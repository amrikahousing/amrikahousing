import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { RenterShell } from "@/components/RenterShell";
import { getPortalAccessState } from "@/lib/portal-access";
import { getRenterSupportContact } from "@/lib/renter-portal";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";
import { LeaseActions } from "./LeaseActions";

function formatCurrency(value: number | string | { toString(): string } | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(typeof value === "object" ? value.toString() : value));
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function formatPeriod(start: Date | string | null | undefined, end: Date | string | null | undefined) {
  if (!start && !end) return "—";
  if (!end) return `${formatDate(start)} onward`;
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const shared = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  switch (name) {
    case "status":
      return (
        <svg {...shared}>
          <path d="M7 12.5 10 15.5 17 8.5" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...shared}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "money":
      return (
        <svg {...shared}>
          <path d="M12 3v18" />
          <path d="M16.5 7.5A3.5 3.5 0 0 0 12.8 6H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-2.2a4 4 0 0 1-3.8-2" />
        </svg>
      );
    default:
      return (
        <svg {...shared}>
          <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
          <path d="M14 3.5V8h4" />
          <path d="M9 12h6M9 16h6" />
        </svg>
      );
  }
}

export default async function RenterLeasePage() {
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
        organization_id: true,
        lease_tenants: {
          select: {
            leases: {
              select: {
                id: true,
                start_date: true,
                end_date: true,
                rent_amount: true,
                security_deposit: true,
                status: true,
                units: {
                  select: {
                    unit_number: true,
                    bedrooms: true,
                    bathrooms: true,
                    square_feet: true,
                    properties: {
                      select: {
                        name: true,
                        address: true,
                        city: true,
                        state: true,
                        zip: true,
                      },
                    },
                  },
                },
              },
            },
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

  if (!tenant) {
    redirect("/renter");
  }

  const activeLeaseTenant = tenant.lease_tenants.find((row) => row.leases.status === "active");
  const lease = activeLeaseTenant?.leases ?? tenant.lease_tenants[0]?.leases ?? null;
  if (!lease) {
    redirect("/renter");
  }

  const support = await getRenterSupportContact(tenant.organization_id);
  const unit = lease.units;
  const property = unit.properties;
  const renewalEligible = Boolean(lease.end_date && lease.status === "active");

  return (
    <RenterShell user={shellUser}>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Lease</h1>
          <p className="mt-1 text-slate-500">View and manage your current lease agreement.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Icon name="status" className="h-5 w-5 text-emerald-600" />
              <p className="text-sm font-medium text-slate-500">Lease Status</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">
              {lease.status === "active" ? "Active" : lease.status}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {lease.end_date ? `Expires ${formatDate(lease.end_date)}` : "No end date on file"}
            </p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Icon name="calendar" className="h-5 w-5 text-sky-600" />
              <p className="text-sm font-medium text-slate-500">Lease Period</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">
              {lease.end_date ? "12 Months" : "Open Term"}
            </p>
            <p className="mt-1 text-sm text-slate-500">{formatPeriod(lease.start_date, lease.end_date)}</p>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Icon name="money" className="h-5 w-5 text-amber-600" />
              <p className="text-sm font-medium text-slate-500">Monthly Rent</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(lease.rent_amount)}</p>
            <p className="mt-1 text-sm text-slate-500">Due on the 1st of each month</p>
          </article>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Current Lease Agreement</h2>
              <p className="mt-1 text-sm text-slate-500">Your active rental agreement and key details.</p>
            </div>
            <LeaseActions />
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <article className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm">
                  <Icon name="document" className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">Residential Lease Agreement</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {property.address}, Unit {unit.unit_number}, {property.city}, {property.state} {property.zip}
                  </p>
                </div>
              </div>

              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Start Date</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">{formatDate(lease.start_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">End Date</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">{formatDate(lease.end_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Monthly Rent</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(lease.rent_amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Security Deposit</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(lease.security_deposit)}</dd>
                </div>
              </dl>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-900">Lease Details</h3>
              <dl className="mt-4 space-y-4 text-sm">
                <div>
                  <dt className="text-slate-500">Property Address</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {property.address}, Unit {unit.unit_number}
                    <br />
                    {property.city}, {property.state} {property.zip}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Layout</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {unit.bedrooms} bed • {Number(unit.bathrooms)} bath
                    {unit.square_feet ? ` • ${unit.square_feet.toLocaleString()} sqft` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Landlord / Manager</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {support.organizationName ?? "Property management team"}
                    <br />
                    {support.managerEmail ?? support.organizationEmail ?? "No email on file"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Payment Terms</dt>
                  <dd className="mt-1 font-medium text-slate-900">Rent due on the 1st of each month.</dd>
                </div>
              </dl>
            </article>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Ready to renew?</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            {renewalEligible
              ? "Your lease is within the renewal window. Reach out to your manager to confirm next steps."
              : "Renewal usually opens about 60 days before the lease expires. We’ll keep the current terms visible here in the meantime."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={`mailto:${support.managerEmail ?? support.organizationEmail ?? ""}?subject=${encodeURIComponent("Lease renewal question")}`}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Contact About Renewal
            </a>
          </div>
        </section>
      </div>
    </RenterShell>
  );
}
