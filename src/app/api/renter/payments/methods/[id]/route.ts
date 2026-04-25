import { NextResponse } from "next/server";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { removePaymentMethodForTenant } from "@/lib/renter-payments";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await params;

  try {
    await removePaymentMethodForTenant(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove the payment method." },
      { status: 400 },
    );
  }
}
