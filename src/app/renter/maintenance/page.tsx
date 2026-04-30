import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { RenterShell } from "@/components/RenterShell";
import { MaintenanceClient } from "./MaintenanceClient";
import { getPortalAccessState } from "@/lib/portal-access";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";

export default async function RenterMaintenancePage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/login");

  const identity = await resolveSharedUserIdentity(userId);
  const tenant = identity.email
    ? await prisma.tenants.findFirst({
      where: {
        email: identity.email,
        deleted_at: null,
        ...(identity.sharedUser?.organization_id
          ? { organization_id: identity.sharedUser.organization_id }
          : {}),
      },
      select: {
        id: true,
        first_name: true,
        lease_tenants: {
          select: {
            leases: {
              select: {
                status: true,
                units: {
                  select: {
                    unit_number: true,
                    properties: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        maintenance_requests: {
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            title: true,
            description: true,
            priority: true,
            status: true,
            created_at: true,
            updated_at: true,
            scheduled_date: true,
            resolved_at: true,
            units: {
              select: {
                unit_number: true,
                properties: { select: { name: true, address: true } },
              },
            },
            status_change_note: true,
          },
        },
      },
    })
    : null;

  const shellUser = {
    email: identity.sharedUser?.email ?? identity.clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    firstName: identity.sharedUser?.first_name ?? identity.clerkUser?.firstName ?? tenant?.first_name ?? null,
    imageUrl: identity.clerkUser?.imageUrl ?? null,
    portal: "renter" as const,
    ...(await getPortalAccessState({
      userId,
      orgId,
      email: identity.sharedUser?.email ?? identity.clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    })),
  };

  const hasActiveLease = tenant?.lease_tenants.some(
    (lt) => lt.leases.status === "active",
  ) ?? false;

  const activeLease = tenant?.lease_tenants.find((lt) => lt.leases.status === "active");
  const unitLabel = activeLease
    ? `Unit ${activeLease.leases.units.unit_number} · ${activeLease.leases.units.properties.name}`
    : null;

  return (
    <RenterShell user={shellUser}>
      <MaintenanceClient
        requests={tenant?.maintenance_requests ?? []}
        hasActiveLease={hasActiveLease}
        unitLabel={unitLabel}
      />
    </RenterShell>
  );
}
