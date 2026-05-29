import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

type RouteContext = { params: Promise<{ id: string }> };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function bool(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id: propertyId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const property = await prisma.properties.findFirst({
    where: { id: propertyId, organization_id: ctx.orgDbId, deleted_at: null },
    select: { id: true },
  });
  if (!property) {
    return Response.json({ error: "Property not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  let updated;
  try {
    updated = await prisma.properties.update({
      where: { id: propertyId },
      data: {
        landlord_name: clean(body.landlordName) ?? null,
        landlord_signatory: clean(body.landlordSignatory) ?? null,
        property_manager_name: clean(body.propertyManagerName) ?? null,
        property_manager_email: clean(body.propertyManagerEmail) ?? null,
        property_manager_phone: clean(body.propertyManagerPhone) ?? null,
        ...(bool(body.includesElectricity) !== undefined ? { includes_electricity: bool(body.includesElectricity) } : {}),
        ...(bool(body.includesLaundry) !== undefined ? { includes_laundry: bool(body.includesLaundry) } : {}),
        ...(bool(body.hasPetFee) !== undefined ? { has_pet_fee: bool(body.hasPetFee) } : {}),
        ...(bool(body.includesParking) !== undefined ? { includes_parking: bool(body.includesParking) } : {}),
        ...(bool(body.includesInternet) !== undefined ? { includes_internet: bool(body.includesInternet) } : {}),
        updated_at: new Date(),
      },
      select: {
        id: true,
        landlord_name: true,
        landlord_signatory: true,
        property_manager_name: true,
        property_manager_email: true,
        property_manager_phone: true,
        includes_electricity: true,
        includes_laundry: true,
        has_pet_fee: true,
        includes_parking: true,
        includes_internet: true,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error.";
    console.error("[lease-profile] update failed:", err);
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ property: updated });
}
