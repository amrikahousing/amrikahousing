import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // body is optional
  }
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim()
      : "Tenant cancelled the request";

  const req = await prisma.maintenance_requests.findFirst({
    where: { id, submitted_by_tenant: ctx.tenantId },
    select: { id: true, status: true },
  });

  if (!req) {
    return Response.json({ error: "Request not found." }, { status: 404 });
  }

  if (req.status === "completed" || req.status === "rejected" || req.status === "cancelled") {
    return Response.json({ error: "This request is already closed." }, { status: 400 });
  }

  const updated = await prisma.maintenance_requests.update({
    where: { id },
    data: {
      status: "cancelled",
      updated_at: new Date(),
      status_changed_by: "tenant",
      status_changed_at: new Date(),
      status_change_note: note,
    },
    select: { id: true, status: true, status_change_note: true },
  });

  return Response.json({ request: updated });
}
