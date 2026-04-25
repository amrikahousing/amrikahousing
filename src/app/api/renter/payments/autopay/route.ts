import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { setAutopayEnabledForTenant } from "@/lib/renter-payments";

const requestSchema = z.object({
  enabled: z.boolean(),
});

export async function POST(request: Request) {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid auto-pay state is required." }, { status: 400 });
  }

  try {
    await setAutopayEnabledForTenant(ctx, parsed.data.enabled);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update auto-pay." },
      { status: 400 },
    );
  }
}
