import { isAccessError } from "@/lib/auth";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import { prisma } from "@/lib/db";
import { logMaintenanceEvent } from "@/lib/maintenance-audit";
import { inngest } from "@/inngest/client";

const VALID_STATUSES = ["open", "in_progress", "completed", "rejected"];

// Status transitions the tenant should be texted about.
const NOTIFY_STATUSES = ["in_progress", "pending_acceptance", "completed", "rejected"];

function hasKey(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

// Accepts a uuid string or null/empty (to clear the assignment).
function normalizeIdInput(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { status, actorName, resolutionNote } = body;

  const isStatusChange = hasKey(body, "status");
  if (isStatusChange && (typeof status !== "string" || !VALID_STATUSES.includes(status))) {
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

  const data: Record<string, unknown> = { updated_at: new Date() };
  const eventNotes: string[] = [];

  // --- Assignment + scheduling + manual note (detail updates) ---
  if (hasKey(body, "assigned_to_vendor")) {
    const vendorId = normalizeIdInput(body.assigned_to_vendor);
    if (vendorId) {
      const vendor = await prisma.vendors.findFirst({
        where: { id: vendorId, organization_id: access.orgDbId },
        select: { name: true },
      });
      if (!vendor) {
        return Response.json({ error: "Vendor not found." }, { status: 400 });
      }
      eventNotes.push(`Assigned vendor ${vendor.name}`);
    } else {
      eventNotes.push("Cleared vendor assignment");
    }
    data.assigned_to_vendor = vendorId;
  }

  if (hasKey(body, "assigned_to_user")) {
    const userId = normalizeIdInput(body.assigned_to_user);
    if (userId) {
      const assignee = await prisma.users.findFirst({
        where: { id: userId, organization_id: access.orgDbId },
        select: { first_name: true, last_name: true, email: true },
      });
      if (!assignee) {
        return Response.json({ error: "Assignee not found." }, { status: 400 });
      }
      const name =
        [assignee.first_name, assignee.last_name].filter(Boolean).join(" ").trim() ||
        assignee.email;
      eventNotes.push(`Assigned to ${name}`);
    } else {
      eventNotes.push("Cleared assignee");
    }
    data.assigned_to_user = userId;
  }

  if (hasKey(body, "scheduled_date")) {
    const raw = body.scheduled_date;
    if (raw === null || raw === "") {
      data.scheduled_date = null;
      eventNotes.push("Cleared scheduled date");
    } else if (typeof raw === "string") {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return Response.json({ error: "Invalid scheduled date." }, { status: 400 });
      }
      data.scheduled_date = parsed;
      eventNotes.push(`Scheduled for ${parsed.toISOString().slice(0, 10)}`);
    } else {
      return Response.json({ error: "Invalid scheduled date." }, { status: 400 });
    }
  }

  // A manual status_change_note edit is honored only when not part of a status change.
  if (!isStatusChange && hasKey(body, "status_change_note")) {
    const manualNote =
      typeof body.status_change_note === "string" && body.status_change_note.trim()
        ? body.status_change_note.trim()
        : null;
    data.status_change_note = manualNote;
    if (manualNote) eventNotes.push(`Note: ${manualNote}`);
  }

  // --- Status change ---
  let effectiveStatus = existing.status;
  if (isStatusChange) {
    const nextStatus = status as string;

    // Completion and rejection require an explanatory note.
    if ((nextStatus === "completed" || nextStatus === "rejected") && !note) {
      return Response.json(
        {
          error:
            nextStatus === "completed"
              ? "A resolution note is required to complete a request."
              : "A reason is required to reject a request.",
        },
        { status: 400 },
      );
    }

    // Completing a request with a tenant routes through tenant confirmation
    // instead of closing it outright — unless there is no tenant to confirm.
    const awaitsTenant = nextStatus === "completed" && Boolean(existing.submitted_by_tenant);
    effectiveStatus = awaitsTenant ? "pending_acceptance" : nextStatus;

    const noteMap: Record<string, string> = {
      completed: note ? `Resolved by ${actor}: ${note}` : `Marked as completed by ${actor}`,
      pending_acceptance: note
        ? `Work completed by ${actor} — awaiting tenant confirmation: ${note}`
        : `Work completed by ${actor} — awaiting tenant confirmation`,
      rejected: note ? `Rejected by ${actor}: ${note}` : `Rejected by ${actor}`,
      in_progress: `Marked in progress by ${actor}`,
      open: `Reopened by ${actor}`,
    };

    data.status = effectiveStatus;
    data.status_changed_by = "manager";
    data.status_changed_at = new Date();
    data.status_change_note = noteMap[effectiveStatus] ?? `Updated by ${actor}`;
    if (effectiveStatus === "completed") data.resolved_at = new Date();
  }

  // Nothing to update.
  if (Object.keys(data).length <= 1) {
    return Response.json({ error: "No changes provided." }, { status: 400 });
  }

  const updated = await prisma.maintenance_requests.update({
    where: { id },
    data,
    select: {
      id: true,
      status: true,
      status_change_note: true,
      assigned_to_user: true,
      assigned_to_vendor: true,
      scheduled_date: true,
    },
  });

  if (isStatusChange) {
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
  } else if (eventNotes.length > 0) {
    await logMaintenanceEvent({
      organizationId: access.orgDbId,
      maintenanceRequestId: id,
      action: "updated",
      actorType: "manager",
      actorId: access.userId,
      actorName: actor,
      fromStatus: existing.status,
      toStatus: existing.status,
      note: eventNotes.join("; "),
    });
  }

  // Text the tenant about relevant status changes (best-effort; never blocks the response).
  if (isStatusChange && existing.submitted_by_tenant && NOTIFY_STATUSES.includes(effectiveStatus)) {
    await inngest
      .send({
        name: "maintenance/status.changed",
        data: {
          requestId: id,
          organizationId: access.orgDbId,
          toStatus: effectiveStatus,
          note: updated.status_change_note,
        },
      })
      .catch((err) =>
        console.error("[maintenance] failed to enqueue status notification", err),
      );
  }

  return Response.json({
    request: {
      id: updated.id,
      status: updated.status,
      status_change_note: updated.status_change_note,
      assigned_to_user: updated.assigned_to_user,
      assigned_to_vendor: updated.assigned_to_vendor,
      scheduled_date: updated.scheduled_date?.toISOString() ?? null,
    },
  });
}
