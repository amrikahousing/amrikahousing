import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";

type RouteContext = {
  params: Promise<{ id: string; unitId: string }>;
};

type DuplicateUnitInput = {
  unitNumber?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id, unitId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_units", id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  let body: DuplicateUnitInput;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const unitNumber = body.unitNumber?.trim();
  if (!unitNumber) {
    return Response.json({ error: "New apartment number is required." }, { status: 400 });
  }

  const property = await prisma.properties.findFirst({
    where: {
      id,
      organization_id: ctx.orgDbId,
      deleted_at: null,
    },
    select: { id: true },
  });

  if (!property) {
    return Response.json({ error: "Property not found." }, { status: 404 });
  }

  const existingUnit = await prisma.units.findFirst({
    where: {
      property_id: id,
      unit_number: unitNumber,
      deleted_at: null,
    },
    select: { id: true },
  });

  if (existingUnit) {
    return Response.json({ error: "That apartment number already exists." }, { status: 409 });
  }

  const sourceUnit = await prisma.units.findFirst({
    where: {
      id: unitId,
      property_id: id,
      deleted_at: null,
    },
  });

  if (!sourceUnit) {
    return Response.json({ error: "Apartment not found." }, { status: 404 });
  }

  const newUnit = await prisma.units.create({
    data: {
      property_id: id,
      unit_number: unitNumber,
      bedrooms: sourceUnit.bedrooms,
      bathrooms: sourceUnit.bathrooms,
      square_feet: sourceUnit.square_feet,
      rent_amount: sourceUnit.rent_amount,
      status: sourceUnit.status,
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

  return Response.json({ unit: newUnit }, { status: 201 });
}
