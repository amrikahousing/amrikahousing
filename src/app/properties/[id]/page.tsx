import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/AppShell";
import { PropertyDetailsClient } from "@/components/PropertyDetailsClient";
import { prisma } from "@/lib/db";

export default async function PropertyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/login");
  if (!orgId) notFound();

  const { id } = await params;
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
      },
    },
  });

  if (!property) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Link
            href="/properties"
            className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
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
    units: property.units.map((unit) => ({
      id: unit.id,
      unitNumber: unit.unit_number,
      bedrooms: unit.bedrooms,
      bathrooms: Number(unit.bathrooms),
      squareFeet: unit.square_feet,
      rentAmount: unit.rent_amount === null ? null : Number(unit.rent_amount),
      status: unit.status,
    })),
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href="/properties"
          className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to Properties
        </Link>

        <PropertyDetailsClient initialProperty={propertyDetails} />
      </div>
    </AppShell>
  );
}
