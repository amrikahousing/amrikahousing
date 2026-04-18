import { requireOrgAccess, isAccessError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ValidatedRow, ImportResult } from "@/lib/import-types";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function POST(request: Request) {
  const ctx = await requireOrgAccess();
  if (isAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: { validatedRows: ValidatedRow[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validRows = (body.validatedRows ?? []).filter((r) => r.errors.length === 0);
  const skippedCount = (body.validatedRows ?? []).length - validRows.length;

  if (validRows.length === 0) {
    return Response.json({ error: "No valid rows to import" }, { status: 400 });
  }

  const propertyIds: string[] = [];

  await prisma.$transaction(async (tx: Tx) => {
    for (const row of validRows) {
      const { property_name, address, city, state, zip, unit_count, property_type } = row.data;

      const property = await tx.properties.create({
        data: {
          organization_id: ctx.orgDbId,
          name: property_name,
          type: property_type,
          address,
          city,
          state,
          zip,
        },
      });

      propertyIds.push(property.id);

      const units = Array.from({ length: unit_count }, (_, i) => ({
        property_id: property.id,
        unit_number: unit_count === 1 ? "1" : String(i + 1),
      }));

      await tx.units.createMany({ data: units });
    }
  });

  const result: ImportResult = {
    importedCount: validRows.length,
    propertyIds,
    skippedCount,
  };

  return Response.json(result);
}
