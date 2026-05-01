export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AddPropertyModalButton } from "@/components/AddPropertyModalButton";
import { PropertiesList } from "@/components/PropertiesList";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  propertyScopeWhere,
  requirePermission,
} from "@/lib/org-authorization";

export default async function PropertiesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");
  const access = await getOrgPermissionContext();
  if ("error" in access) redirect("/dashboard");
  const viewError = requirePermission(access, "view_properties");
  if (viewError) redirect("/dashboard");

  const properties = await prisma.properties.findMany({
    where: propertyScopeWhere(access),
    include: {
      units: {
        where: { deleted_at: null },
        orderBy: { unit_number: "asc" },
      },
    },
    orderBy: { created_at: "desc" },
  });

  const propertyGroups = properties.map((property) => ({
    id: property.id,
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    type: property.type,
    description: property.description,
    isActive: property.is_active,
    apartments: property.units.map((unit) => ({
      id: unit.id,
      unitNumber: unit.unit_number,
      bedrooms: unit.bedrooms,
      bathrooms: Number(unit.bathrooms),
      squareFeet: unit.square_feet,
      rentAmount: unit.rent_amount === null ? null : Number(unit.rent_amount),
      status: unit.status,
    })),
  }));

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Properties</h1>
            <p className="mt-1 text-slate-500">Manage your property portfolio</p>
          </div>
          <div className="flex items-center gap-2">
            {access.permissions.create_properties ? (
              <AddPropertyModalButton />
            ) : null}
          </div>
        </header>

        <PropertiesList properties={propertyGroups} />
      </div>
    </AppShell>
  );
}
