import { auth, currentUser } from "@clerk/nextjs/server";
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

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export default async function MaintenancePage() {
  const [{ userId, orgId }, user] = await Promise.all([auth(), currentUser()]);
  if (!userId) redirect("/login");

  const unsafeMetadata = user?.unsafeMetadata as Record<string, unknown> | null;
  const publicMetadata = user?.publicMetadata as Record<string, unknown> | null;
  const rawRole =
    metadataString(unsafeMetadata, "role") ??
    metadataString(publicMetadata, "role") ??
    "property_manager";
  const role = rawRole === "tenant" || rawRole === "renter" ? "tenant" : "manager";

  const tenant = role === "tenant"
    ? await prisma.tenants.findUnique({
        where: { clerk_user_id: userId },
        select: { id: true, organization_id: true },
      })
    : null;

  const maintenanceRequests = await prisma.maintenance_requests.findMany({
    where:
      role === "tenant"
        ? {
            submitted_by_tenant: tenant?.id ?? "__missing_tenant__",
          }
        : orgId
          ? {
              organizations: { clerk_org_id: orgId },
            }
          : {
              organization_id: "__missing_org__",
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

  const properties = role === "tenant"
    ? tenant
      ? await prisma.properties.findMany({
          where: {
            organization_id: tenant.organization_id,
            deleted_at: null,
          },
          orderBy: { created_at: "desc" },
        })
      : []
    : orgId
      ? await prisma.properties.findMany({
          where: {
            organizations: { clerk_org_id: orgId },
            deleted_at: null,
          },
          orderBy: { created_at: "desc" },
        })
      : [];

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
      request.status === "rejected"
        ? request.status
        : request.status === "resolved"
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
      aiAnalysis: null,
      createdAt: request.created_at.toISOString(),
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
