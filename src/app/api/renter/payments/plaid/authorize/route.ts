import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { authorizePlaidPaymentAttempt } from "@/lib/renter-payments";

const requestSchema = z.object({
  paymentId: z.string().min(1),
  paymentMethodId: z.string().min(1),
  amount: z.string().regex(/^\d+\.\d{2}$/),
});

function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? null;
}

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
    const attempt = await authorizePlaidPaymentAttempt(ctx, {
      paymentId: parsed.data.paymentId,
      renterPaymentMethodId: parsed.data.paymentMethodId,
      amount: parsed.data.amount,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json(attempt);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to authorize the ACH payment." },
      { status: 400 },
    );
  }
}
