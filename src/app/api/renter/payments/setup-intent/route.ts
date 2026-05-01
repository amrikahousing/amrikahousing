import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { isStripeConfigured } from "@/lib/stripe";
import { ensureStripeCustomerForTenant } from "@/lib/renter-payments";
import { getStripeServer } from "@/lib/stripe";

const requestSchema = z.object({
  paymentMethodType: z.enum(["card", "us_bank_account"]).default("card"),
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
  const parsed = requestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid payment method type is required." }, { status: 400 });
  }

  try {
    const { stripeCustomerId } = await ensureStripeCustomerForTenant(ctx);
    const stripe = getStripeServer();
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: [parsed.data.paymentMethodType],
      usage: "off_session",
      metadata: {
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        sharedUserId: ctx.sharedUserId ?? "",
        paymentMethodType: parsed.data.paymentMethodType,
      },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (error) {
    console.error("[renter-payments/setup-intent]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare Stripe setup." },
      { status: 500 },
    );
  }
}
