import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";
import { computeNetRent } from "@/lib/rent-credit";

type RouteContext = { params: Promise<{ leaseId: string }> };

const patchSchema = z.object({
  monthlyRentCredit: z.number().min(0),
  appliedPaymentIds: z.array(z.string()),
});

async function loadLease(leaseId: string, orgDbId: string) {
  return prisma.leases.findFirst({
    where: {
      id: leaseId,
      units: {
        properties: { organization_id: orgDbId, deleted_at: null },
        deleted_at: null,
      },
    },
    select: {
      id: true,
      rent_amount: true,
      monthly_rent_credit: true,
      units: { select: { property_id: true } },
      payments: {
        where: { type: "rent", status: { not: "canceled" } },
        orderBy: { due_date: "asc" },
        select: { id: true, amount: true, status: true, due_date: true },
      },
    },
  });
}

function serialize(lease: NonNullable<Awaited<ReturnType<typeof loadLease>>>) {
  const rentAmount = Number(lease.rent_amount);
  return {
    leaseId: lease.id,
    rentAmount,
    monthlyRentCredit: lease.monthly_rent_credit === null ? 0 : Number(lease.monthly_rent_credit),
    months: lease.payments.map((p, index) => ({
      paymentId: p.id,
      month: index + 1,
      dueDate: p.due_date?.toISOString() ?? null,
      currentAmount: Number(p.amount),
      status: p.status,
    })),
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { leaseId } = await context.params;
  const lease = await loadLease(leaseId, ctx.orgDbId);
  if (!lease) {
    return Response.json({ error: "Lease not found." }, { status: 404 });
  }

  const permissionError = requirePropertyPermission(ctx, "view_properties", lease.units.property_id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  return Response.json(serialize(lease));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { leaseId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid credit amount." }, { status: 400 });
  }

  const lease = await loadLease(leaseId, ctx.orgDbId);
  if (!lease) {
    return Response.json({ error: "Lease not found." }, { status: 404 });
  }

  const permissionError = requirePropertyPermission(ctx, "invite_renters", lease.units.property_id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const rent = Number(lease.rent_amount);
  const credit = parsed.data.monthlyRentCredit;
  if (credit > rent) {
    return Response.json(
      { error: `Credit cannot exceed the monthly rent of $${rent.toFixed(2)}.` },
      { status: 400 },
    );
  }

  const selected = new Set(parsed.data.appliedPaymentIds);
  // The credit is only "active" when there is an amount AND at least one selected
  // month. Deselecting every month (or a $0 amount) removes the credit entirely.
  const applyToCredit = credit > 0 && selected.size > 0;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.leases.update({
      where: { id: lease.id },
      data: { monthly_rent_credit: applyToCredit ? credit : null, updated_at: now },
    });

    // Each selected month is billed at the net amount; every unselected month is
    // reset to full rent. The property manager controls the selection per month.
    for (const payment of lease.payments) {
      const credited = applyToCredit && selected.has(payment.id);
      const targetAmount = credited ? computeNetRent(rent, credit) : rent;
      if (Number(payment.amount) === targetAmount) continue;

      await tx.payments.update({
        where: { id: payment.id },
        data: {
          amount: targetAmount,
          notes: credited ? `Monthly rent (credit $${credit.toFixed(2)} applied)` : "Monthly rent",
          updated_at: now,
        },
      });
    }
  });

  const updated = await loadLease(leaseId, ctx.orgDbId);
  return Response.json(serialize(updated!));
}
