import { NextResponse } from "next/server";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { savePlaidBankAccountForTenant } from "@/lib/renter-payments";

const requestSchema = z.object({
  publicToken: z.string().min(1),
  metadata: z
    .object({
      institution: z
        .object({
          institution_id: z.string().nullable().optional(),
          name: z.string().nullable().optional(),
          logo: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      link_session_id: z.string().nullable().optional(),
      accounts: z
        .array(
          z.object({
            id: z.string().nullable().optional(),
            name: z.string().nullable().optional(),
            mask: z.string().nullable().optional(),
            subtype: z.string().nullable().optional(),
            type: z.string().nullable().optional(),
          }),
        )
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

export async function POST(request: Request) {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A Plaid account selection is required." }, { status: 400 });
  }

  try {
    const method = await savePlaidBankAccountForTenant(ctx, {
      publicToken: parsed.data.publicToken,
      metadata: parsed.data.metadata ?? null,
    });

    return NextResponse.json({
      paymentMethod: {
        id: method.id,
        bankName: method.bank_name,
        last4: method.last4,
        transferEligible: method.plaid_transfer_eligible,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the Plaid bank account." },
      { status: 400 },
    );
  }
}
