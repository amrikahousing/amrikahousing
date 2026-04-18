import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppShell } from "@/components/AppShell";
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

  const unitCount = property.units.length;
  const vacantCount = property.units.filter((unit) => unit.status === "vacant").length;
  const occupiedCount = property.units.filter((unit) => unit.status === "occupied").length;
  const totalSqft = property.units.reduce((sum, unit) => sum + (unit.square_feet ?? 0), 0);

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href="/properties"
          className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to Properties
        </Link>

        <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="space-y-6 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  {property.name}
                </h1>
                <p className="mt-1 text-slate-600">
                  {property.address}
                </p>
                <p className="mt-0.5 text-slate-500">
                  {property.city}, {property.state} {property.zip}
                </p>
              </div>
              <span className="self-start rounded border border-slate-200 px-3 py-1 text-sm font-semibold capitalize text-slate-700">
                {property.type}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Units</p>
                <p className="mt-1 font-semibold text-slate-900">{unitCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Vacant</p>
                <p className="mt-1 font-semibold text-slate-900">{vacantCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Occupied</p>
                <p className="mt-1 font-semibold text-slate-900">{occupiedCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Square feet</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {totalSqft > 0 ? totalSqft.toLocaleString() : "--"}
                </p>
              </div>
            </div>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">
                Description
              </h2>
              <p className="mt-2 text-slate-600">
                {property.description?.trim() || "No description added yet."}
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900">Units</h2>
              {property.units.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Unit</th>
                        <th className="px-4 py-3 text-left font-medium">Beds</th>
                        <th className="px-4 py-3 text-left font-medium">Baths</th>
                        <th className="px-4 py-3 text-left font-medium">Sq ft</th>
                        <th className="px-4 py-3 text-left font-medium">Rent</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                      {property.units.map((unit) => (
                        <tr key={unit.id}>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {unit.unit_number}
                          </td>
                          <td className="px-4 py-3">{unit.bedrooms}</td>
                          <td className="px-4 py-3">{Number(unit.bathrooms)}</td>
                          <td className="px-4 py-3">
                            {unit.square_feet?.toLocaleString() ?? "--"}
                          </td>
                          <td className="px-4 py-3">
                            {unit.rent_amount ? `$${Number(unit.rent_amount).toLocaleString()}` : "--"}
                          </td>
                          <td className="px-4 py-3 capitalize">{unit.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-slate-500">No units found for this property.</p>
              )}
            </section>
          </div>
        </article>
      </div>
    </AppShell>
  );
}
