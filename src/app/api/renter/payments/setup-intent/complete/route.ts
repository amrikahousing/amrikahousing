import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { getVerifiedSetupIntent, syncSetupIntent } from "@/lib/renter-payments";
import { isStripeConfigured } from "@/lib/stripe";

const requestSchema = z.object({
  setupIntentId: z.string().min(1),
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
    return NextResponse.json({ error: "A setup intent id is required." }, { status: 400 });
  }

  try {
    const setupIntent = await getVerifiedSetupIntent(parsed.data.setupIntentId, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    });
    await syncSetupIntent(setupIntent);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Setup intent does not belong to this tenant.") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[renter-payments/setup-intent/complete]", error);
    return NextResponse.json(
      { error: "Unable to save the payment method." },
      { status: 500 },
    );
  }
}
