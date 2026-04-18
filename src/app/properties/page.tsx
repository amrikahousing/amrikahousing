import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
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
    <main className="relative z-0 min-h-screen px-5 py-6 text-white sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <AppNav />
        <header className="mt-6 mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-[clamp(28px,3.5vw,42px)] leading-[1.05] font-semibold">Properties</h1>
            <p className="mt-1.5 text-[14px] text-white/60">
              {properties.length} propert{properties.length !== 1 ? "ies" : "y"} in your portfolio
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/import"
              className="rounded-[8px] border border-white/15 bg-white/8 px-3 py-2 text-[13px] text-white/70 hover:bg-white/12"
            >
              Import CSV
            </Link>
            <Link
              href="/properties/new"
              className="rounded-[8px] bg-[linear-gradient(180deg,rgba(16,185,129,1),rgba(10,145,100,1))] px-3 py-2 text-[13px] font-semibold text-white hover:opacity-90"
            >
              + Add property
            </Link>
          </div>
        </header>

        {properties.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-[12px] border border-white/10 bg-[var(--card)] py-16 text-center backdrop-blur-[16px]">
            <p className="text-[15px] text-white/50">No properties yet.</p>
            <div className="flex gap-3">
              <Link
                href="/properties/new"
                className="rounded-[8px] bg-[linear-gradient(180deg,rgba(16,185,129,1),rgba(10,145,100,1))] px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90"
              >
                Add manually
              </Link>
              <Link
                href="/import"
                className="rounded-[8px] border border-white/15 bg-white/8 px-4 py-2 text-[13px] text-white/70 hover:bg-white/12"
              >
                Import CSV
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {properties.map((p: typeof properties[number]) => {
              const vacantCount = p.units.filter((u: typeof p.units[number]) => u.status === "vacant").length;
              return (
                <article
                  key={p.id}
                  className="rounded-[10px] border border-white/12 bg-[var(--card)] p-4 backdrop-blur-[14px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white/92">{p.name}</p>
                      <p className="mt-0.5 truncate text-[12px] text-white/50">
                        {p.address}, {p.city}, {p.state} {p.zip}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-[6px] bg-white/8 px-2 py-0.5 text-[11px] text-white/50 capitalize">
                      {p.type}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-3 text-[12px]">
                    <span className="text-white/60">{p.units.length} unit{p.units.length !== 1 ? "s" : ""}</span>
                    {vacantCount > 0 && (
                      <span className="text-[var(--green)]">{vacantCount} vacant</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
