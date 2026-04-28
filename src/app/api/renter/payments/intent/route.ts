import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";

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

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a charge and saved payment method to continue." }, { status: 400 });
  }

  return NextResponse.json(
    {
      error:
        "Card payments are disabled for rent collection. Use a linked bank account so rent settles to the organization's receiving account.",
    },
    { status: 400 },
  );
}
