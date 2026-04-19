import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PropertiesList } from "@/components/PropertiesList";
import { prisma } from "@/lib/db";

function SparklesIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

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
            <Link
              href="/ai-import"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <SparklesIcon className="h-4 w-4" />
              Add with AI
            </Link>
            <Link
              href="/properties/new"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <PlusIcon className="h-4 w-4" />
              Add property
            </Link>
          </div>
        </header>

        <PropertiesList properties={propertyGroups} />
      </div>
    </AppShell>
  );
}
