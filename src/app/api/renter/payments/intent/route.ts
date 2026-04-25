import { NextResponse } from "next/server";
import { z } from "zod";
import { createPaymentAttempt } from "@/lib/renter-payments";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { isStripeConfigured } from "@/lib/stripe";

const requestSchema = z.object({
  paymentId: z.string().min(1),
  paymentMethodId: z.string().min(1),
  amount: z.string().regex(/^\d+\.\d{2}$/),
});

export async function POST(request: Request) {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured for this environment." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a charge and saved payment method to continue." }, { status: 400 });
  }

  try {
    const { paymentIntent } = await createPaymentAttempt(ctx, {
      paymentId: parsed.data.paymentId,
      renterPaymentMethodId: parsed.data.paymentMethodId,
      amount: parsed.data.amount,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    });
  } catch (error) {
    console.error("[renter-payments/intent]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create the payment attempt.",
      },
      { status: 400 },
    );
  }
}
