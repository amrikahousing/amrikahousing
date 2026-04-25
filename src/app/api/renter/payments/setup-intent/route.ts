import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { ensureStripeCustomerForTenant } from "@/lib/renter-payments";
import { getStripeServer, isStripeConfigured } from "@/lib/stripe";

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
    const setupIntent = await stripe.setupIntents.create(
      parsed.data.paymentMethodType === "us_bank_account"
        ? {
            customer: stripeCustomerId,
            usage: "off_session",
            payment_method_types: ["us_bank_account"],
            payment_method_options: {
              us_bank_account: {
                verification_method: "automatic",
                financial_connections: {
                  permissions: ["payment_method"],
                  prefetch: [],
                },
              },
            },
            metadata: {
              tenantId: ctx.tenantId,
              organizationId: ctx.organizationId,
              sharedUserId: ctx.sharedUserId ?? "",
            },
          }
        : {
            customer: stripeCustomerId,
            usage: "off_session",
            payment_method_types: ["card"],
            metadata: {
              tenantId: ctx.tenantId,
              organizationId: ctx.organizationId,
              sharedUserId: ctx.sharedUserId ?? "",
            },
          },
    );

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (error) {
    console.error("[renter-payments/setup-intent]", error);
    return NextResponse.json(
      { error: "Unable to prepare payment method setup." },
      { status: 500 },
    );
  }
}
