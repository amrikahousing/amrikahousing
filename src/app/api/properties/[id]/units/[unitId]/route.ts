import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";

type RouteContext = {
  params: Promise<{ id: string; unitId: string }>;
};

type UnitUpdateInput = {
  unitNumber?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number | null;
  rentAmount?: number | null;
  status?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function todayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

async function findScopedUnit(propertyId: string, unitId: string, organizationId: string) {
  return prisma.units.findFirst({
    where: {
      id: unitId,
      property_id: propertyId,
      deleted_at: null,
      properties: {
        organization_id: organizationId,
        deleted_at: null,
      },
    },
    select: { id: true, unit_number: true },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id, unitId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_units", id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }
  const unit = await findScopedUnit(id, unitId, ctx.orgDbId);

  if (!unit) {
    return Response.json({ error: "Apartment not found." }, { status: 404 });
  }

  let body: UnitUpdateInput;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const unitNumber = body.unitNumber?.trim();
  if (!unitNumber) {
    return Response.json({ error: "Apartment number is required." }, { status: 400 });
  }

  const status = body.status?.trim() || "vacant";
  if (!["vacant", "occupied", "maintenance", "inactive"].includes(status)) {
    return Response.json({ error: "Status must be vacant, occupied, maintenance, or inactive." }, { status: 400 });
  }

  if (!isFiniteNumber(body.bedrooms) || body.bedrooms < 0) {
    return Response.json({ error: "Bedrooms is required." }, { status: 400 });
  }
  if (!isFiniteNumber(body.bathrooms) || body.bathrooms <= 0) {
    return Response.json({ error: "Bathrooms is required." }, { status: 400 });
  }
  if (!isFiniteNumber(body.squareFeet) || body.squareFeet <= 0) {
    return Response.json({ error: "Square feet is required." }, { status: 400 });
  }
  if (!isFiniteNumber(body.rentAmount) || body.rentAmount <= 0) {
    return Response.json({ error: "Monthly rent is required." }, { status: 400 });
  }

  const duplicateUnit = await prisma.units.findFirst({
    where: {
      property_id: id,
      unit_number: unitNumber,
      deleted_at: null,
      NOT: { id: unitId },
    },
    select: { id: true },
  });

  if (duplicateUnit) {
    return Response.json({ error: "That apartment number already exists." }, { status: 409 });
  }

  const updatedUnit = await prisma.units.update({
    where: { id: unitId },
    data: {
      unit_number: unitNumber,
      bedrooms: body.bedrooms,
      bathrooms: body.bathrooms,
      square_feet: body.squareFeet,
      rent_amount: body.rentAmount,
      status,
      updated_at: new Date(),
    },
    select: {
      id: true,
      unit_number: true,
      bedrooms: true,
      bathrooms: true,
      square_feet: true,
      rent_amount: true,
      status: true,
    },
  });

  return Response.json({ unit: updatedUnit });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id, unitId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_units", id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }
  const unit = await findScopedUnit(id, unitId, ctx.orgDbId);

  if (!unit) {
    return Response.json({ error: "Apartment not found." }, { status: 404 });
  }

  const activeLease = await prisma.leases.findFirst({
    where: {
      unit_id: unitId,
      status: "active",
      deleted_at: null,
    },
    select: { id: true },
  });

  const now = new Date();
  const futurePaymentsWhere = activeLease
    ? {
        lease_id: activeLease.id,
        status: "pending",
        due_date: { gte: todayStart() },
      }
    : null;

  let cancelledFuturePaymentCount = 0;
  if (futurePaymentsWhere) {
    const [, cancelledPayments] = await prisma.$transaction([
      prisma.units.update({
        where: { id: unitId },
        data: {
          status: "inactive",
          updated_at: now,
        },
      }),
      prisma.payments.updateMany({
        where: futurePaymentsWhere,
        data: {
          status: "cancelled",
          updated_at: now,
        },
      }),
    ]);
    cancelledFuturePaymentCount = cancelledPayments.count;
  } else {
    await prisma.units.update({
      where: { id: unitId },
      data: {
        status: "inactive",
        updated_at: now,
      },
    });
  }

  return Response.json({
    ok: true,
    unitNumber: unit.unit_number,
    cancelledFuturePaymentCount,
  });
}
