import { isAccessError } from "@/lib/auth";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import { prisma } from "@/lib/db";
import { logMaintenanceEvent } from "@/lib/maintenance-audit";

const VALID_STATUSES = ["open", "in_progress", "completed", "rejected"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getOrgPermissionContext();
  if (isAccessError(access)) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const permissionError = requirePermission(access, "manage_maintenance");
  if (permissionError) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { status, actorName, resolutionNote } = body as Record<string, unknown>;

  if (!status || typeof status !== "string" || !VALID_STATUSES.includes(status)) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }

  const existing = await prisma.maintenance_requests.findFirst({
    where: { id, organization_id: access.orgDbId },
    select: { id: true, status: true, submitted_by_tenant: true },
  });

  if (!existing) {
    return Response.json({ error: "Request not found." }, { status: 404 });
  }

  const actor = typeof actorName === "string" && actorName.trim() ? actorName.trim() : "Manager";
  const note = typeof resolutionNote === "string" && resolutionNote.trim() ? resolutionNote.trim() : null;

  // When a manager completes a request, route it through tenant confirmation
  // instead of closing it outright — unless there is no tenant to confirm, in
  // which case it completes directly.
  const awaitsTenant = status === "completed" && Boolean(existing.submitted_by_tenant);
  const effectiveStatus = awaitsTenant ? "pending_acceptance" : status;

  const noteMap: Record<string, string> = {
    completed: note ? `Resolved by ${actor}: ${note}` : `Marked as completed by ${actor}`,
    pending_acceptance: note
      ? `Work completed by ${actor} — awaiting tenant confirmation: ${note}`
      : `Work completed by ${actor} — awaiting tenant confirmation`,
    rejected: note ? `Rejected by ${actor}: ${note}` : `Rejected by ${actor}`,
    in_progress: `Marked in progress by ${actor}`,
    open: `Reopened by ${actor}`,
  };

  const updated = await prisma.maintenance_requests.update({
    where: { id },
    data: {
      status: effectiveStatus,
      updated_at: new Date(),
      status_changed_by: "manager",
      status_changed_at: new Date(),
      status_change_note: noteMap[effectiveStatus] ?? `Updated by ${actor}`,
      ...(effectiveStatus === "completed" ? { resolved_at: new Date() } : {}),
    },
    select: { id: true, status: true, status_change_note: true },
  });

  await logMaintenanceEvent({
    organizationId: access.orgDbId,
    maintenanceRequestId: id,
    action: existing.status === effectiveStatus ? "updated" : "status_changed",
    actorType: "manager",
    actorId: access.userId,
    actorName: actor,
    fromStatus: existing.status,
    toStatus: effectiveStatus,
    note: updated.status_change_note,
  });

  return Response.json({ request: updated });
}
