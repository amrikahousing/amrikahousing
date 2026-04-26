import { NextResponse } from "next/server";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { createPlaidLinkTokenForTenant } from "@/lib/renter-payments";

export async function POST() {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    const result = await createPlaidLinkTokenForTenant(ctx);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare Plaid Link." },
      { status: 400 },
    );
  }
}
