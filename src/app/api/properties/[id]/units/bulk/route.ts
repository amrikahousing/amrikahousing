import { prisma } from "@/lib/db";
import type { AiParsedUnit } from "@/lib/ai-import-types";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";

type RouteContext = { params: Promise<{ id: string }> };

export type SkippedUnit = { unit_number: string; reason: string };

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

    let body: { units: AiParsedUnit[] };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    }

    const { units } = body;
    if (!Array.isArray(units) || units.length === 0) {
      return Response.json({ error: "No units provided." }, { status: 400 });
    }

    const existing = await prisma.units.findMany({
      where: { property_id: id, deleted_at: null },
      select: { unit_number: true },
    });
    const existingNumbers = new Set(existing.map((u) => u.unit_number.trim().toLowerCase()));

    const toCreate: typeof units = [];
    const skipped: SkippedUnit[] = [];

    for (const unit of units) {
      const num = unit.unit_number?.trim();
      if (!num) {
        skipped.push({ unit_number: unit.unit_number ?? "(blank)", reason: "Unit number is required." });
        continue;
      }
      if (existingNumbers.has(num.toLowerCase())) {
        skipped.push({ unit_number: num, reason: `Unit ${num} already exists in this property.` });
        continue;
      }
      existingNumbers.add(num.toLowerCase());
      toCreate.push(unit);
    }

    if (toCreate.length > 0) {
      await prisma.units.createMany({
        data: toCreate.map((u) => ({
          property_id: id,
          unit_number: u.unit_number.trim(),
          bedrooms: u.bedrooms ?? 0,
          bathrooms: u.bathrooms ?? 0,
          square_feet: u.square_feet ?? null,
          rent_amount: u.rent_amount ?? null,
          status: ["vacant", "occupied", "maintenance"].includes(u.status ?? "") ? u.status! : "vacant",
        })),
      });
    }

    return Response.json({ added: toCreate.length, skipped }, { status: 201 });
  } catch (err) {
    console.error("Unhandled error in bulk units route:", err);
    return Response.json({ error: "Failed to save units. Please try again." }, { status: 500 });
  }
}
