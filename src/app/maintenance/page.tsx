import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
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
    };
  });

  return (
    <AppShell>
      <MaintenanceClient
        role={role}
        userId={userId}
        initialProperties={initialProperties}
        initialRequests={initialRequests}
      />
    </AppShell>
  );
}
