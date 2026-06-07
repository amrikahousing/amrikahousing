import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

type LogMaintenanceEventInput = {
  organizationId: string;
  maintenanceRequestId: string;
  action: string;
  actorType: "tenant" | "manager" | "system";
  actorId?: string | null;
  actorName?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Append an entry to a maintenance request's audit trail.
 *
 * Audit logging must never break the primary operation, so failures are
 * swallowed and logged rather than thrown.
 */
export async function logMaintenanceEvent(input: LogMaintenanceEventInput) {
  try {
    await prisma.maintenance_request_events.create({
      data: {
        organization_id: input.organizationId,
        maintenance_request_id: input.maintenanceRequestId,
        action: input.action,
        actor_type: input.actorType,
        actor_id: input.actorId ?? null,
        actor_name: input.actorName ?? null,
        from_status: input.fromStatus ?? null,
        to_status: input.toStatus ?? null,
        note: input.note ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("Failed to record maintenance request event", err);
  }
}
