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
        include: { units: { where: { deleted_at: null } } },
        orderBy: { created_at: "desc" },
      })
    : [];

  const propertyCards = properties.map((property) => ({
    id: property.id,
    name: property.name,
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    type: property.type,
    description: property.description,
    unitCount: property.units.length,
    vacantCount: property.units.filter((unit) => unit.status === "vacant").length,
  }));

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Properties</h1>
            <p className="mt-1 text-slate-500">
              {properties.length} propert{properties.length !== 1 ? "ies" : "y"} in your portfolio
            </p>
          </div>
          <Link
            href="/properties/new"
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            + Add property
          </Link>
        </header>

        {properties.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-slate-200 bg-white py-16 text-center shadow-sm">
            <p className="text-slate-500">No properties yet.</p>
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
          <PropertiesList properties={propertyCards} />
        )}
      </div>
    </AppShell>
  );
}
