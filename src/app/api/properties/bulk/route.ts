import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { AiParsedProperty } from "@/lib/ai-import-types";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import { assignPropertiesToUser } from "@/lib/permissions";
import { normalizePropertyType } from "@/lib/property-types";

export async function POST(request: Request) {
  try {
    const ctx = await getOrgPermissionContext();
    if ("error" in ctx) {
      return Response.json({ error: ctx.error }, { status: ctx.status });
    }
    const permissionError = requirePermission(ctx, "create_properties");
    if (permissionError) {
      return Response.json({ error: permissionError.error }, { status: permissionError.status });
    }

    let body: { properties: AiParsedProperty[] };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { properties } = body;
    if (!Array.isArray(properties) || properties.length === 0) {
      return Response.json({ error: "No properties provided" }, { status: 400 });
    }
    if (properties.length > 100) {
      return Response.json({ error: "Maximum 100 properties per request" }, { status: 400 });
    }

    // Pre-generate IDs so we can build a flat batch transaction
    // (PrismaNeon HTTP adapter does not support callback-style interactive transactions)
    const propertyIds = properties.map(() => randomUUID());

    const ops = properties.flatMap((p, i) => {
      const propertyId = propertyIds[i];

      const unitData = (p.units ?? []).slice(0, 50).map((u) => ({
        property_id: propertyId,
        unit_number: u.unit_number || "1",
        bedrooms: u.bedrooms ?? 0,
        bathrooms: u.bathrooms ?? 0,
        square_feet: u.square_feet ?? null,
        rent_amount: u.rent_amount ?? null,
        status: ["vacant", "occupied", "maintenance"].includes(u.status ?? "") ? u.status! : "vacant",
      }));

      if (unitData.length === 0) {
        unitData.push({
          property_id: propertyId,
          unit_number: "1",
          bedrooms: 0,
          bathrooms: 0,
          square_feet: null,
          rent_amount: null,
          status: "vacant",
        });
      }

      return [
        prisma.properties.create({
          data: {
            id: propertyId,
            organization_id: ctx.orgDbId,
            name: p.name.trim(),
            type: normalizePropertyType(p.type),
            address: p.address.trim(),
            city: p.city.trim(),
            state: p.state.trim().toUpperCase(),
            zip: p.zip.trim(),
            description: p.description?.trim() || null,
          },
        }),
        prisma.units.createMany({ data: unitData }),
      ];
    });

    await prisma.$transaction(ops);
    if (!ctx.isOrgAdmin && ctx.userDbId) {
      await assignPropertiesToUser(ctx.userDbId, propertyIds);
    }

    return Response.json({ importedCount: propertyIds.length, propertyIds }, { status: 201 });
  } catch (err) {
    console.error("Failed to create properties:", err);
    return Response.json({ error: "Failed to save properties. Please try again." }, { status: 500 });
  }
}
