import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { handleStripeWebhookEvent } from "@/lib/renter-payments";
import { getStripeServer, getStripeWebhookSecret } from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();

  // Step 1: verify the signature. A failure here is a genuine 400 — the payload
  // is untrusted, so Stripe should not retry it.
  let event: Stripe.Event;
  try {
    const stripe = getStripeServer();
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    console.error("[stripe-webhook] signature verification failed", error);
    return NextResponse.json(
      { error: "Webhook signature verification failed." },
      { status: 400 },
    );
  }

  // Step 2: run the business logic. The event is authentic at this point, so a
  // failure here is our problem, not a bad signature. Return 500 so Stripe
  // retries a transient fault, and keep the log honest for debugging.
  try {
    await handleStripeWebhookEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(
      `[stripe-webhook] failed to handle event ${event.id} (${event.type})`,
      error,
    );
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 },
    );
  }
}
