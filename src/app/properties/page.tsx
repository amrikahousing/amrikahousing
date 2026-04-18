import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
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
          <div className="flex gap-2">
            <Link
              href="/import"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
            >
              Import CSV
            </Link>
            <Link
              href="/properties/new"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              + Add property
            </Link>
          </div>
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
              <Link
                href="/import"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Import CSV
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {properties.map((p: typeof properties[number]) => {
              const vacantCount = p.units.filter((u: typeof p.units[number]) => u.status === "vacant").length;
              return (
                <article
                  key={p.id}
                  className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{p.name}</p>
                      <p className="mt-0.5 truncate text-sm text-slate-500">
                        {p.address}, {p.city}, {p.state} {p.zip}
                      </p>
                    </div>
                    <span className="shrink-0 rounded border border-slate-200 px-2 py-0.5 text-xs capitalize text-slate-500">
                      {p.type}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-3 text-sm text-slate-500">
                    <span>{p.units.length} unit{p.units.length !== 1 ? "s" : ""}</span>
                    {vacantCount > 0 && (
                      <span className="text-emerald-600">{vacantCount} vacant</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
