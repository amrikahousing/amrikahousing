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
      users: {
        select: {
          first_name: true,
          last_name: true,
          email: true,
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

  const [vendorRows, userRows] = await Promise.all([
    prisma.vendors.findMany({
      where: { organization_id: access.orgDbId, is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.users.findMany({
      where: { organization_id: access.orgDbId, is_active: true, deleted_at: null },
      select: { id: true, first_name: true, last_name: true, email: true },
      orderBy: [{ first_name: "asc" }, { last_name: "asc" }],
    }),
  ]);

  const vendors = vendorRows.map((vendor) => ({ id: vendor.id, name: vendor.name }));
  const assignableUsers = userRows.map((user) => ({
    id: user.id,
    name:
      [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
      user.email,
  }));

  // Response-time SLA targets per priority (hours from submission).
  const SLA_TARGET_HOURS: Record<RequestPriority, number> = {
    emergency: 24,
    high: 72,
    normal: 168,
    low: 336,
  };

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
      request.priority === "normal" ||
      request.priority === "low"
        ? request.priority
        : // legacy value
          request.priority === "medium"
          ? "normal"
          : "normal";
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

    const slaDueAt = new Date(
      request.created_at.getTime() +
        SLA_TARGET_HOURS[normalizedPriority] * 60 * 60 * 1000,
    ).toISOString();
    const assignedUserName =
      [request.users?.first_name, request.users?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      request.users?.email ||
      null;

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
      slaDueAt,
      escalatedAt: request.priority === "emergency" ? request.updated_at.toISOString() : null,
      scheduledDate: request.scheduled_date?.toISOString() ?? null,
      assignedUserId: request.assigned_to_user ?? null,
      assignedUserName,
      assignedVendorId: request.assigned_to_vendor ?? null,
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
        vendors={vendors}
        assignableUsers={assignableUsers}
      />
  );
}
