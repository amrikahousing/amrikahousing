// End-to-end Stripe + rent-collection integration test against Stripe TEST mode.
// Mirrors the real app code paths in src/lib/renter-payments.ts and
// src/lib/organization-payment-destinations.ts using dummy data, and drives the
// live local webhook endpoint. Read-only against the DB (does not write app tables).
//
// Run: node scripts/stripe-e2e-test.mjs
import fs from "node:fs";
import Stripe from "stripe";

// --- load .env.local (same vars the app uses) ---
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const WEBHOOK_URL = "http://localhost:3000/api/webhooks/stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

let pass = 0,
  fail = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "  ✅" : "  ❌"} ${label}${extra ? "  — " + extra : ""}`);
  cond ? pass++ : fail++;
};
const section = (t) => console.log(`\n=== ${t} ===`);

// Mirror of src/lib/renter-payments.ts helpers
const roundCurrency = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const calcProcessingFee = (amount, type) =>
  type === "us_bank_account"
    ? roundCurrency(Math.min(amount * 0.008, 5))
    : roundCurrency(amount * 0.029 + 0.3);
const toMinorUnits = (amount) => Number(amount.toFixed(2).replace(".", ""));

(async () => {
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_live")) {
    console.error("ABORT: live key detected. Refusing to run.");
    process.exit(1);
  }
  console.log("Mode: TEST (sk_test). Webhook secret loaded:", Boolean(webhookSecret));

  // ---------------------------------------------------------------
  section("1. Connect onboarding gate (org rent destination)");
  // Mirrors ensureOrganizationStripeConnectedAccount(): a brand-new Express
  // account must NOT be chargeable until onboarding completes.
  const freshOrg = await stripe.accounts.create({
    type: "express",
    country: "US",
    business_profile: { name: "E2E Test Properties LLC", product_description: "Rental housing rent collection" },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { organizationId: "e2e-test-org" },
  });
  const freshFull = await stripe.accounts.retrieve(freshOrg.id);
  ok(!freshFull.charges_enabled && !freshFull.payouts_enabled, "fresh Express account is NOT yet chargeable (gate would block payments)", `${freshOrg.id} charges=${freshFull.charges_enabled}`);

  // Mirrors createStripeOnboardingLink()
  const link = await stripe.accountLinks.create({
    account: freshOrg.id,
    refresh_url: "http://localhost:3000/accounts?stripe_onboarding=refresh",
    return_url: "http://localhost:3000/accounts?stripe_onboarding=complete",
    type: "account_onboarding",
  });
  ok(link.url.startsWith("https://connect.stripe.com"), "hosted onboarding link generated", link.url.slice(0, 48) + "...");

  // For the actual charge we need an already-onboarded destination (an org that
  // finished onboarding). Pick any test connected account with transfers active.
  const accts = await stripe.accounts.list({ limit: 100 });
  const onboarded = accts.data.filter((a) => a.capabilities?.transfers === "active" && a.charges_enabled);
  // Prefer Express/Custom (the app's model) over Standard for a realistic destination.
  const destination = onboarded.find((a) => a.type !== "standard") ?? onboarded[0];
  ok(Boolean(destination), "found an onboarded connected account to act as rent destination", destination?.id);
  if (!destination) throw new Error("No onboarded test connected account available as destination.");

  // ---------------------------------------------------------------
  section("2. Tenant saves a payment method (Customer + SetupIntent)");
  // Mirrors ensureStripeCustomerForTenant()
  const tenantId = "e2e-tenant-" + Date.now();
  const customer = await stripe.customers.create({
    email: `${tenantId}@example.com`,
    name: "Test Tenant",
    metadata: { tenantId, organizationId: "e2e-test-org" },
  });
  ok(customer.id.startsWith("cus_"), "Stripe customer created for tenant", customer.id);

  // Mirrors setup-intent route + confirm. pm_card_visa = Stripe test card.
  const setupIntent = await stripe.setupIntents.create({
    customer: customer.id,
    payment_method_types: ["card"],
    payment_method: "pm_card_visa",
    confirm: true,
    usage: "off_session",
    metadata: { tenantId, organizationId: "e2e-test-org", sharedUserId: "" },
  });
  ok(setupIntent.status === "succeeded", "SetupIntent confirmed & succeeded (card saved)", setupIntent.status);

  // Mirrors syncPaymentMethodFromStripe(): retrieve PM, extract display metadata.
  const pm = await stripe.paymentMethods.retrieve(setupIntent.payment_method);
  ok(pm.type === "card" && Boolean(pm.card?.last4), "saved payment method has card brand/last4", `${pm.card?.brand} ****${pm.card?.last4}`);

  // ---------------------------------------------------------------
  section("3. Rent payment — destination charge (PaymentIntent)");
  // Mirrors createPaymentAttempt(): rent + processing fee, transfer rent to org.
  const rent = 1500.0;
  const fee = calcProcessingFee(rent, "card");
  const charge = roundCurrency(rent + fee);
  console.log(`  rent=$${rent.toFixed(2)} fee=$${fee.toFixed(2)} total=$${charge.toFixed(2)} (card 2.9% + $0.30)`);
  ok(fee === 43.8 && charge === 1543.8, "processing fee math matches app (2.9% + $0.30)", `fee=${fee} total=${charge}`);

  const paymentId = "e2e-payment-" + Date.now();
  const idempotencyKey = `${paymentId}:e2e-method:stripe`;
  // Build params once so the idempotency replay is byte-identical (as the app does).
  const piParams = {
    amount: toMinorUnits(charge),
    currency: "usd",
    customer: customer.id,
    payment_method: pm.id,
    payment_method_types: ["card"],
    confirm: true,
    off_session: false,
    description: "rent payment",
    transfer_data: { destination: destination.id, amount: toMinorUnits(rent) },
    metadata: { paymentId, tenantId, organizationId: "e2e-test-org", rentAmount: rent.toFixed(2), processingFee: fee.toFixed(2), totalAmount: charge.toFixed(2) },
  };
  const pi = await stripe.paymentIntents.create(piParams, { idempotencyKey });
  ok(pi.status === "succeeded", "rent PaymentIntent confirmed & succeeded", pi.status);
  ok(pi.amount === 154380, "charged total amount in minor units (rent + fee)", String(pi.amount));
  ok(pi.transfer_data?.destination === destination.id, "funds routed to org's connected account (destination charge)", String(pi.transfer_data?.destination));
  ok(pi.transfer_data?.amount === 150000, "transfer to landlord = rent only (fee retained by platform)", String(pi.transfer_data?.amount));

  // Verify the routing on the resulting charge. For destination charges,
  // charge.transfer_data is authoritative (a separate Transfer object only
  // appears for some connected-account types).
  const piFull = await stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
  const chargeTd = piFull.latest_charge?.transfer_data;
  ok(
    chargeTd?.destination === destination.id && chargeTd?.amount === 150000,
    "settled charge routes rent to landlord via transfer_data",
    chargeTd ? `→ ${chargeTd.destination} $${(chargeTd.amount / 100).toFixed(2)}` : "none",
  );

  // Idempotency: replaying the SAME key + SAME params must return the same PI.
  const piReplay = await stripe.paymentIntents.create(piParams, { idempotencyKey });
  ok(piReplay.id === pi.id, "idempotency key prevents duplicate charge on replay", piReplay.id);

  // ---------------------------------------------------------------
  section("4. Failure path — declined card");
  let declined = false,
    declineCode = "";
  try {
    await stripe.paymentIntents.create({
      amount: toMinorUnits(charge), currency: "usd", customer: customer.id,
      payment_method: "pm_card_chargeDeclined", payment_method_types: ["card"],
      confirm: true, off_session: false,
      transfer_data: { destination: destination.id, amount: toMinorUnits(rent) },
    });
  } catch (e) {
    declined = e.type === "StripeCardError" || e.code === "card_declined";
    declineCode = e.code || e.type;
  }
  ok(declined, "declined test card is rejected (failure path surfaces error)", declineCode);

  // ---------------------------------------------------------------
  section("5. Webhook endpoint — signed events against live dev server");
  const postEvent = async (eventObj) => {
    const payload = JSON.stringify(eventObj);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
    return { status: res.status, body: await res.text() };
  };

  // Strip metadata.paymentId so the handler exercises the signature + routing
  // plumbing without needing a seeded payments row in the DB.
  const piForEvent = { ...pi, metadata: { ...pi.metadata, paymentId: "" } };
  const piSucceeded = await postEvent({
    id: "evt_e2e_" + Date.now(), object: "event", type: "payment_intent.succeeded",
    api_version: pi.api_version, data: { object: piForEvent },
  });
  ok(piSucceeded.status === 200, "payment_intent.succeeded accepted (valid signature → 200)", `status=${piSucceeded.status} ${piSucceeded.body}`);

  // A signed, valid event for a paymentId that has NO matching payments row must
  // be handled gracefully (no-op) — NOT mislabeled as a signature failure. This
  // regression-guards the split try/catch in the webhook route + the updateMany
  // no-op in markPaymentIntentSucceeded().
  // Use a valid-but-nonexistent UUID — the payments.id column is a uuid, so a
  // real Stripe event always carries a UUID here. (A non-UUID string would be
  // rejected by Postgres' type cast, which is a different error path.)
  const piUnknownPayment = { ...pi, metadata: { ...pi.metadata, paymentId: crypto.randomUUID() } };
  const unknownRes = await postEvent({
    id: "evt_e2e_unknown_" + Date.now(), object: "event", type: "payment_intent.succeeded",
    api_version: pi.api_version, data: { object: piUnknownPayment },
  });
  ok(
    unknownRes.status === 200,
    "payment_intent.succeeded for unknown paymentId handled gracefully (→ 200, not a signature 400)",
    `status=${unknownRes.status} ${unknownRes.body}`,
  );
  ok(
    !/signature/i.test(unknownRes.body),
    "unknown paymentId is NOT mislabeled as a signature failure",
    unknownRes.body,
  );

  const acctUpdated = await postEvent({
    id: "evt_e2e_acct_" + Date.now(), object: "event", type: "account.updated",
    data: { object: { id: destination.id, charges_enabled: true, payouts_enabled: true } },
  });
  ok(acctUpdated.status === 200, "account.updated accepted (valid signature → 200)", `status=${acctUpdated.status}`);

  // Tampered signature must be rejected.
  const badRes = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" }, body: "{}" });
  ok(badRes.status === 400, "tampered signature rejected (400)", `status=${badRes.status}`);

  // ---------------------------------------------------------------
  section("Cleanup");
  await stripe.accounts.del(freshOrg.id).then(() => ok(true, "deleted throwaway Express onboarding account", freshOrg.id)).catch((e) => ok(false, "cleanup account", e.message));

  console.log(`\n──────────────────────────────\nRESULT: ${pass} passed, ${fail} failed\n──────────────────────────────`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});
