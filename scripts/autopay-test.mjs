// Drives the REAL app auto-pay functions (the exact code the Inngest cron calls)
// against the live Neon branch + Stripe test mode. No browser/session needed.
//
//   node scripts/autopay-test.mjs enable   # turn auto-pay on for the test tenant
//   node scripts/autopay-test.mjs list     # show charges the cron would pick up
//   node scripts/autopay-test.mjs run      # charge all due auto-pay rent now
import fs from "node:fs";

// Load env BEFORE importing app modules that read it at load time.
// Run with the tsx binary so app TypeScript + "@/..." path aliases resolve:
//   node_modules/.bin/tsx scripts/autopay-test.mjs <enable|list|run>
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const JOE = {
  tenantId: "c4e212cd-ac5b-460c-aac5-adbca199ce67",
  organizationId: "6e36d0b6-d20a-48f5-b9d0-9b5f7114fa41",
  sharedUserId: "01c51a5f-c48c-4271-89b9-3ca12b3cec25",
};

const cmd = process.argv[2] ?? "list";

const {
  setAutopayEnabledForTenant,
  getAutopayChargesDue,
  runDueAutopayCharges,
} = await import("@/lib/renter-payments.ts");

if (cmd === "enable") {
  await setAutopayEnabledForTenant(JOE, true);
  console.log("auto-pay enabled for tenant", JOE.tenantId);
} else if (cmd === "list") {
  const due = await getAutopayChargesDue();
  console.log(`getAutopayChargesDue() -> ${due.length} candidate(s):`);
  for (const c of due) console.log(`  payment ${c.paymentId}  $${c.amount}  method ${c.paymentMethodId}`);
} else if (cmd === "run") {
  const summary = await runDueAutopayCharges();
  console.log(`runDueAutopayCharges() -> processed ${summary.processed}`);
  for (const r of summary.results) {
    console.log(`  ${r.paymentId}: ${r.outcome}` + (r.paymentIntentId ? `  (${r.paymentIntentId}, ${r.stripeStatus})` : "") + (r.failureCode ? `  [${r.failureCode}: ${r.failureMessage}]` : ""));
  }
} else {
  console.error("unknown command:", cmd);
  process.exit(2);
}

process.exit(0);
