import { requireOrgAccess, isAccessError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { AiParsedProperty } from "@/app/api/ai-import/route";
import type { PrismaClient } from "@/generated/prisma/client";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function POST(request: Request) {
  const ctx = await requireOrgAccess();
  if (isAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
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

  const propertyIds: string[] = [];

  await prisma.$transaction(async (tx: Tx) => {
    for (const p of properties) {
      const property = await tx.properties.create({
        data: {
          organization_id: ctx.orgDbId,
          name: p.name.trim(),
          type: ["rental", "association"].includes(p.type) ? p.type : "rental",
          address: p.address.trim(),
          city: p.city.trim(),
          state: p.state.trim().toUpperCase(),
          zip: p.zip.trim(),
          description: p.description?.trim() || null,
        },
      });

      propertyIds.push(property.id);

      const unitData = (p.units ?? []).slice(0, 50).map((u) => ({
        property_id: property.id,
        unit_number: u.unit_number || "1",
        bedrooms: u.bedrooms ?? 0,
        bathrooms: u.bathrooms ?? 0,
        square_feet: u.square_feet ?? null,
        rent_amount: u.rent_amount ?? null,
        status: ["vacant", "occupied", "maintenance"].includes(u.status ?? "") ? u.status! : "vacant",
      }));

      if (unitData.length === 0) {
        unitData.push({
          property_id: property.id,
          unit_number: "1",
          bedrooms: 0,
          bathrooms: 0,
          square_feet: null,
          rent_amount: null,
          status: "vacant",
        });
      }

      await tx.units.createMany({ data: unitData });
    }
  });

  return Response.json({ importedCount: propertyIds.length, propertyIds }, { status: 201 });
}
