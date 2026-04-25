import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { setDefaultPaymentMethodForTenant } from "@/lib/renter-payments";

const requestSchema = z.object({
  paymentMethodId: z.string().min(1),
});

export async function POST(request: Request) {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a saved payment method." }, { status: 400 });
  }

  try {
    await setDefaultPaymentMethodForTenant(ctx, parsed.data.paymentMethodId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the default card." },
      { status: 400 },
    );
  }
}
