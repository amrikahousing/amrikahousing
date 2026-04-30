import { isAccessError } from "@/lib/auth";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import { prisma } from "@/lib/db";

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
    select: { id: true },
  });

  if (!existing) {
    return Response.json({ error: "Request not found." }, { status: 404 });
  }

  const actor = typeof actorName === "string" && actorName.trim() ? actorName.trim() : "Manager";
  const note = typeof resolutionNote === "string" && resolutionNote.trim() ? resolutionNote.trim() : null;

  const noteMap: Record<string, string> = {
    completed: note ? `Resolved by ${actor}: ${note}` : `Marked as completed by ${actor}`,
    rejected: note ? `Rejected by ${actor}: ${note}` : `Rejected by ${actor}`,
    in_progress: `Marked in progress by ${actor}`,
    open: `Reopened by ${actor}`,
  };

  const updated = await prisma.maintenance_requests.update({
    where: { id },
    data: {
      status,
      updated_at: new Date(),
      status_changed_by: "manager",
      status_changed_at: new Date(),
      status_change_note: noteMap[status] ?? `Updated by ${actor}`,
    },
    select: { id: true, status: true, status_change_note: true },
  });

  return Response.json({ request: updated });
}
