import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MaintenanceClient } from "@/components/MaintenanceClient";
import type {
  MaintenanceRequest,
  Property,
  RequestPriority,
  RequestStatus,
} from "@/components/MaintenanceClient";
import { prisma } from "@/lib/db";
import { getOrgPermissionContext, propertyScopeWhere, requirePermission } from "@/lib/org-authorization";

export default async function MaintenancePage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  const access = await getOrgPermissionContext();
  if ("error" in access) redirect("/dashboard");
  const permissionError = requirePermission(access, "manage_maintenance");
  if (permissionError) redirect("/dashboard");
  const role = "manager";

  const maintenanceRequests = await prisma.maintenance_requests.findMany({
    where: {
      units: {
        properties: propertyScopeWhere(access),
      },
    },
    include: {
      units: {
        include: {
          properties: true,
        },
      },
      tenants: {
        select: {
          clerk_user_id: true,
        },
      },
      vendors: {
        select: {
          name: true,
        },
      },
      events: {
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          action: true,
          actor_type: true,
          actor_name: true,
          from_status: true,
          to_status: true,
          note: true,
          created_at: true,
        },
      },
    },
    orderBy: [{ created_at: "desc" }],
  });

  const properties = await prisma.properties.findMany({
    where: propertyScopeWhere(access),
    orderBy: { created_at: "desc" },
  });

  const initialProperties: Property[] = properties.map((property) => ({
    id: property.id,
    address: property.name,
    city: property.city,
    state: property.state,
    zipCode: property.zip,
  }));

  const initialRequests: MaintenanceRequest[] = maintenanceRequests.map((request) => {
    const normalizedPriority: RequestPriority =
      request.priority === "emergency" ||
      request.priority === "high" ||
      request.priority === "medium" ||
      request.priority === "low"
        ? request.priority
        : request.priority === "normal"
          ? "medium"
          : "medium";
    const normalizedStatus: RequestStatus =
      request.status === "open" ||
      request.status === "in_progress" ||
      request.status === "completed" ||
      request.status === "rejected" ||
      request.status === "cancelled"
        ? request.status
        : request.status === "resolved" || request.status === "closed"
          ? "completed"
          : "open";

    return {
      id: request.id,
      propertyId: request.units.properties.id,
      unitId: request.unit_id,
      unitNumber: request.units.unit_number,
      tenantId: request.tenants?.clerk_user_id ?? userId,
      title: request.title,
      description: request.description ?? "No description provided.",
      category: "general" as const,
      priority: normalizedPriority,
      status: normalizedStatus,
      slaDueAt: request.scheduled_date?.toISOString() ?? null,
      escalatedAt: request.priority === "emergency" ? request.updated_at.toISOString() : null,
      assignedVendor: request.vendors?.name ?? null,
      assignmentNote: request.vendors?.name ? "Vendor assigned." : null,
      createdAt: request.created_at.toISOString(),
      statusChangeNote: request.status_change_note ?? null,
      events: request.events.map((event) => ({
        id: event.id,
        action: event.action,
        actorType: event.actor_type,
        actorName: event.actor_name,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        note: event.note,
        createdAt: event.created_at.toISOString(),
      })),
    };
  });

  return (
    <MaintenanceClient
        role={role}
        userId={userId}
        initialProperties={initialProperties}
        initialRequests={initialRequests}
      />
  );
}
