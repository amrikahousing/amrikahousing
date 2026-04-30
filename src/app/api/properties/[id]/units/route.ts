import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const ctx = await getOrgPermissionContext();
    if ("error" in ctx) {
      return Response.json({ error: ctx.error }, { status: ctx.status });
    }

    const { id } = await context.params;
    const permissionError = requirePropertyPermission(ctx, "manage_units", id);
    if (permissionError) {
      return Response.json({ error: permissionError.error }, { status: permissionError.status });
    }

    const property = await prisma.properties.findFirst({
      where: { id, organization_id: ctx.orgDbId, deleted_at: null },
      select: { id: true },
    });
    if (!property) {
      return Response.json({ error: "Property not found." }, { status: 404 });
    }

    let body: {
      unitNumber?: string;
      bedrooms?: number;
      bathrooms?: number;
      squareFeet?: number | null;
      rentAmount?: number | null;
      status?: string;
    };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const unitNumber = body.unitNumber?.trim();
    if (!unitNumber) {
      return Response.json({ error: "Unit number is required." }, { status: 400 });
    }

    const status = body.status?.trim() || "vacant";
    if (!["vacant", "occupied", "maintenance"].includes(status)) {
      return Response.json({ error: "Status must be vacant, occupied, or maintenance." }, { status: 400 });
    }

    const existing = await prisma.units.findFirst({
      where: { property_id: id, unit_number: unitNumber },
      select: { id: true, deleted_at: true },
    });
    if (existing?.deleted_at === null) {
      return Response.json({ error: "That unit number already exists." }, { status: 409 });
    }

    const unitData = {
      unit_number: unitNumber,
      bedrooms: body.bedrooms ?? 0,
      bathrooms: body.bathrooms ?? 0,
      square_feet: body.squareFeet ?? null,
      rent_amount: body.rentAmount ?? null,
      status,
      updated_at: new Date(),
    };

    const unit = existing
      ? await prisma.units.update({
          where: { id: existing.id },
          data: {
            ...unitData,
            deleted_at: null,
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
        })
      : await prisma.units.create({
          data: {
            property_id: id,
            ...unitData,
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

    return Response.json({ unit }, { status: 201 });
  } catch (err) {
    console.error("Unhandled error in unit create route:", err);
    return Response.json({ error: "Failed to save unit. Please try again." }, { status: 500 });
  }
}
