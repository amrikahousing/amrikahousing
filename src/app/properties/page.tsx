import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PropertiesList } from "@/components/PropertiesList";
import { prisma } from "@/lib/db";

export default async function PropertiesPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/login");

  const properties = orgId
    ? await prisma.properties.findMany({
        where: {
          organizations: { clerk_org_id: orgId },
          deleted_at: null,
        },
        include: {
          units: {
            where: { deleted_at: null },
            orderBy: { unit_number: "asc" },
          },
        },
        orderBy: { created_at: "desc" },
      })
    : [];

  const apartmentCards = properties.flatMap((property) =>
    property.units.map((unit) => ({
      id: unit.id,
      propertyId: property.id,
      propertyName: property.name,
      unitNumber: unit.unit_number,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    type: property.type,
    description: property.description,
      bedrooms: unit.bedrooms,
      bathrooms: Number(unit.bathrooms),
      squareFeet: unit.square_feet,
      rentAmount: unit.rent_amount === null ? null : Number(unit.rent_amount),
      status: unit.status,
    })),
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Properties</h1>
            <p className="mt-1 text-slate-500">
              {apartmentCards.length} apartment{apartmentCards.length !== 1 ? "s" : ""} across{" "}
              {properties.length} propert{properties.length !== 1 ? "ies" : "y"}
            </p>
          </div>
          <Link
            href="/properties/new"
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + Add property
          </Link>
        </header>

        {apartmentCards.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-slate-200 bg-white py-16 text-center shadow-sm">
            <p className="text-slate-500">No apartments yet.</p>
            <div className="flex gap-3">
              <Link
                href="/properties/new"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Add manually
              </Link>
            </div>
          </div>
        ) : (
          <PropertiesList properties={apartmentCards} />
        )}
      </div>
    </AppShell>
  );
}
