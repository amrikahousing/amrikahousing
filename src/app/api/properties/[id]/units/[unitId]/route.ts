import { requireOrgAccess, isAccessError } from "@/lib/auth";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string; unitId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const ctx = await requireOrgAccess();
  if (isAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id, unitId } = await context.params;

  const unit = await prisma.units.findFirst({
    where: {
      id: unitId,
      property_id: id,
      deleted_at: null,
      properties: {
        organization_id: ctx.orgDbId,
        deleted_at: null,
      },
    },
    select: { id: true, unit_number: true },
  });

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
