import { describe, expect, it } from "vitest";

import Stripe from "stripe";
import { NextRequest } from "next/server";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { prisma } from "@/lib/db";
import { PAYMENT_STRIPE_FAIL, PAYMENT_STRIPE_SUCCEED } from "./fixtures";

// Only the signature helper is used — no network calls are made, so any key works.
const stripe = new Stripe("sk_test_integration_dummy");

function eventPayload(type: string, object: Record<string, unknown>) {
  return JSON.stringify({
    id: `evt_integration_${type.replace(/\./g, "_")}`,
    object: "event",
    api_version: "2025-06-30.basil",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  });
}

function webhookRequest(payload: string, signature?: string) {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
  });
}

function signedRequest(payload: string, secret = process.env.STRIPE_WEBHOOK_SECRET!) {
  return webhookRequest(payload, stripe.webhooks.generateTestHeaderString({ payload, secret }));
}

describe("POST /api/webhooks/stripe", () => {
  it("rejects a request without a Stripe signature header", async () => {
    const res = await stripeWebhook(webhookRequest(eventPayload("payment_intent.succeeded", {})));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toMatch(/Missing Stripe signature/);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const payload = eventPayload("payment_intent.succeeded", {
      id: PAYMENT_STRIPE_SUCCEED.paymentIntentId,
      object: "payment_intent",
      status: "succeeded",
      metadata: { paymentId: PAYMENT_STRIPE_SUCCEED.id },
    });
    const res = await stripeWebhook(signedRequest(payload, "whsec_integration_wrong_secret"));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toMatch(/signature verification failed/);

    // The forged event must not have touched the seeded payment.
    const payment = await prisma.payments.findUniqueOrThrow({
      where: { id: PAYMENT_STRIPE_SUCCEED.id },
    });
    expect(payment.status).toBe("pending");
  });

  it("rejects a tampered payload whose signature no longer matches", async () => {
    const payload = eventPayload("payment_intent.succeeded", {
      id: PAYMENT_STRIPE_SUCCEED.paymentIntentId,
      object: "payment_intent",
      status: "succeeded",
      metadata: { paymentId: PAYMENT_STRIPE_SUCCEED.id },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });
    const res = await stripeWebhook(
      webhookRequest(payload.replace("succeeded", "canceled"), signature),
    );
    expect(res.status).toBe(400);
  });

  it("acknowledges authentic event types it does not handle", async () => {
    const res = await stripeWebhook(
      signedRequest(eventPayload("charge.refunded", { id: "ch_integration_1", object: "charge" })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("marks the payment and attempt paid on payment_intent.succeeded", async () => {
    const payload = eventPayload("payment_intent.succeeded", {
      id: PAYMENT_STRIPE_SUCCEED.paymentIntentId,
      object: "payment_intent",
      status: "succeeded",
      payment_method: "pm_integration_not_on_file",
      metadata: { paymentId: PAYMENT_STRIPE_SUCCEED.id },
      last_payment_error: null,
    });
    const res = await stripeWebhook(signedRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const payment = await prisma.payments.findUniqueOrThrow({
      where: { id: PAYMENT_STRIPE_SUCCEED.id },
    });
    expect(payment.status).toBe("paid");
    expect(payment.paid_at).not.toBeNull();
    expect(payment.reference).toBe(PAYMENT_STRIPE_SUCCEED.paymentIntentId);
    // The payment method is not in renter_payment_methods, so the generic label is stored.
    expect(payment.payment_method).toBe("Online payment");

    const attempt = await prisma.payment_attempts.findUniqueOrThrow({
      where: { id: PAYMENT_STRIPE_SUCCEED.attemptId },
    });
    expect(attempt.status).toBe("succeeded");
    expect(attempt.paid_at).not.toBeNull();
    expect(attempt.failure_code).toBeNull();
    expect(attempt.failure_message).toBeNull();
  });

  it("records the failure on payment_intent.payment_failed without paying the charge", async () => {
    const payload = eventPayload("payment_intent.payment_failed", {
      id: PAYMENT_STRIPE_FAIL.paymentIntentId,
      object: "payment_intent",
      status: "requires_payment_method",
      metadata: { paymentId: PAYMENT_STRIPE_FAIL.id },
      last_payment_error: {
        code: "card_declined",
        message: "Your card was declined.",
      },
    });
    const res = await stripeWebhook(signedRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const attempt = await prisma.payment_attempts.findUniqueOrThrow({
      where: { id: PAYMENT_STRIPE_FAIL.attemptId },
    });
    expect(attempt.status).toBe("requires_payment_method");
    expect(attempt.failure_code).toBe("card_declined");
    expect(attempt.failure_message).toBe("Your card was declined.");
    expect(attempt.paid_at).toBeNull();

    const payment = await prisma.payments.findUniqueOrThrow({
      where: { id: PAYMENT_STRIPE_FAIL.id },
    });
    expect(payment.status).toBe("pending");
    expect(payment.paid_at).toBeNull();
  });
});
