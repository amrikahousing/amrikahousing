import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { createPlaidTransferForAttempt } from "@/lib/renter-payments";

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
    return NextResponse.json({ error: "Choose a charge and bank account to continue." }, { status: 400 });
  }

  try {
    const attempt = await createPlaidTransferForAttempt(ctx, {
      paymentId: parsed.data.paymentId,
      renterPaymentMethodId: parsed.data.paymentMethodId,
      amount: parsed.data.amount,
    });

    return NextResponse.json(attempt);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit the ACH payment." },
      { status: 400 },
    );
  }
}
