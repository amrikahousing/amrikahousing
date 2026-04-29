export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/AppShell";
import { PropertyDetailsClient } from "@/components/PropertyDetailsClient";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  hasPropertyAccess,
  requirePermission,
} from "@/lib/org-authorization";

export default async function PropertyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/login");
  if (!orgId) notFound();
  const access = await getOrgPermissionContext();
  if ("error" in access) notFound();
  const viewError = requirePermission(access, "view_properties");
  if (viewError) notFound();

  const { id } = await params;
  if (!hasPropertyAccess(access, id)) {
    notFound();
  }
  const property = await prisma.properties.findFirst({
    where: {
      id,
      deleted_at: null,
      organizations: { clerk_org_id: orgId },
    },
    include: {
      units: {
        where: { deleted_at: null },
        orderBy: { unit_number: "asc" },
        include: {
          leases: {
            where: { status: "active", deleted_at: null },
            include: {
              lease_tenants: {
                include: {
                  tenants: {
                    select: {
                      id: true,
                      first_name: true,
                      last_name: true,
                      email: true,
                      phone: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!property) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Link
            href="/properties"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to Properties
          </Link>
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Property not found.
          </div>
        </div>
      </AppShell>
    );
  }

  const propertyDetails = {
    id: property.id,
    name: property.name,
    type: property.type,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    description: property.description ?? "",
    units: property.units.map((unit) => {
      const primaryTenant = unit.leases?.lease_tenants?.tenants ?? null;
      return {
        id: unit.id,
        unitNumber: unit.unit_number,
        bedrooms: unit.bedrooms,
        bathrooms: Number(unit.bathrooms),
        squareFeet: unit.square_feet,
        rentAmount: unit.rent_amount === null ? null : Number(unit.rent_amount),
        status: unit.status,
        tenant: primaryTenant
          ? {
              id: primaryTenant.id,
              firstName: primaryTenant.first_name,
              lastName: primaryTenant.last_name,
              email: primaryTenant.email,
              phone: primaryTenant.phone ?? null,
            }
          : null,
      };
    }),
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href="/properties"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to Properties
        </Link>

        <PropertyDetailsClient
          initialProperty={propertyDetails}
          canManageProperty={access.permissions.manage_properties}
          canManageUnits={access.permissions.manage_units}
          canInviteRenters={access.permissions.invite_renters}
        />
      </div>
    </AppShell>
  );
}
