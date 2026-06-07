import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";
import { prisma } from "@/lib/db";
import { logMaintenanceEvent } from "@/lib/maintenance-audit";

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

  const action =
    body.action === "confirm" || body.action === "dispute" ? body.action : "cancel";
  const rawNote = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const req = await prisma.maintenance_requests.findFirst({
    where: { id, submitted_by_tenant: ctx.tenantId },
    select: { id: true, status: true },
  });

  if (!req) {
    return Response.json({ error: "Request not found." }, { status: 404 });
  }

  // The tenant can confirm or dispute a completion only while it is awaiting them.
  if (action === "confirm" || action === "dispute") {
    if (req.status !== "pending_acceptance") {
      return Response.json(
        { error: "This request is not awaiting your confirmation." },
        { status: 400 },
      );
    }

    const isConfirm = action === "confirm";
    const note = rawNote ?? (isConfirm ? "Tenant confirmed completion" : "Tenant reported the work is not done");
    const toStatus = isConfirm ? "completed" : "in_progress";

    const updated = await prisma.maintenance_requests.update({
      where: { id },
      data: {
        status: toStatus,
        updated_at: new Date(),
        status_changed_by: "tenant",
        status_changed_at: new Date(),
        status_change_note: note,
        ...(isConfirm ? { resolved_at: new Date() } : {}),
      },
      select: { id: true, status: true, status_change_note: true },
    });

    await logMaintenanceEvent({
      organizationId: ctx.organizationId,
      maintenanceRequestId: id,
      action: isConfirm ? "tenant_confirmed" : "tenant_disputed",
      actorType: "tenant",
      actorId: ctx.tenantId,
      fromStatus: req.status,
      toStatus,
      note,
    });

    return Response.json({ request: updated });
  }

  // Default action: cancel an open / in-progress request.
  const note = rawNote ?? "Tenant cancelled the request";

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

  await logMaintenanceEvent({
    organizationId: ctx.organizationId,
    maintenanceRequestId: id,
    action: "cancelled",
    actorType: "tenant",
    actorId: ctx.tenantId,
    fromStatus: req.status,
    toStatus: "cancelled",
    note,
  });

  return Response.json({ request: updated });
}
