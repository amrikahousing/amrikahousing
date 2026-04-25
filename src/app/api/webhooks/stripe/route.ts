import { NextResponse } from "next/server";
import { handleStripeWebhookEvent } from "@/lib/renter-payments";
import { getStripeServer, getStripeWebhookSecret } from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  try {
    const payload = await request.text();
    const stripe = getStripeServer();
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      getStripeWebhookSecret(),
    );

    await handleStripeWebhookEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook]", error);
    return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 400 });
  }
}
