import { requireOrgAccess, isAccessError } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  const ctx = await requireOrgAccess();
  if (isAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id, unitId } = await context.params;
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
  if (!["vacant", "occupied", "maintenance"].includes(status)) {
    return Response.json({ error: "Status must be vacant, occupied, or maintenance." }, { status: 400 });
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
      bedrooms: body.bedrooms ?? 0,
      bathrooms: body.bathrooms ?? 0,
      square_feet: body.squareFeet ?? null,
      rent_amount: body.rentAmount ?? null,
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
  const ctx = await requireOrgAccess();
  if (isAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id, unitId } = await context.params;
  const unit = await findScopedUnit(id, unitId, ctx.orgDbId);

  if (!unit) {
    return Response.json({ error: "Apartment not found." }, { status: 404 });
  }

  const deletedAt = new Date();
  await prisma.units.update({
    where: { id: unitId },
    data: {
      deleted_at: deletedAt,
      updated_at: deletedAt,
    },
  });

  return Response.json({ ok: true, unitNumber: unit.unit_number });
}
