import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { isStripeConfigured } from "@/lib/stripe";

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

  return NextResponse.json(
    {
      error:
        "Stripe payment methods are disabled for rent collection. Link a bank account with Plaid so rent goes to the organization's receiving account.",
    },
    { status: 400 },
  );
}
