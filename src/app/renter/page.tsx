import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { RenterShell } from "@/components/RenterShell";
import Link from "next/link";
import { getPortalAccessState } from "@/lib/portal-access";
import { getRenterSupportContact } from "@/lib/renter-portal";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
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

  if (name === "building") {
    return (
      <svg {...shared}>
        <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V21" />
        <path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V21" />
        <path d="M8 8h4M8 12h4M8 16h4M3 21h18" />
      </svg>
    );
  }
  if (name === "wallet") {
    return (
      <svg {...shared}>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
        <path d="M17 12h3v4h-3a2 2 0 0 1 0-4Z" />
      </svg>
    );
  }
  if (name === "wrench") {
    return (
      <svg {...shared}>
        <path d="M14.7 6.3a4 4 0 0 0 5 5L11 20l-4-4 8.7-8.7Z" />
        <path d="m7 16-3 3 1 1 3-3" />
      </svg>
    );
  }
  if (name === "calendar") {
    return (
      <svg {...shared}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg {...shared}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  return (
    <svg {...shared}>
      <path d="m12 4 9 16H3L12 4Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-sky-50 text-sky-700",
  high: "bg-amber-50 text-amber-700",
  emergency: "bg-rose-50 text-rose-700",
};

const statusColors: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  in_progress: "bg-sky-50 text-sky-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
};

const paymentStatusColors: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  failed: "bg-rose-50 text-rose-700",
  cancelled: "bg-slate-100 text-slate-600",
};

export default async function RenterPage() {
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
        last_name: true,
        email: true,
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
                      select: { name: true, address: true, city: true, state: true, zip: true },
                    },
                  },
                },
                payments: {
                  orderBy: { due_date: "desc" },
                  take: 3,
                  select: {
                    id: true,
                    amount: true,
                    status: true,
                    due_date: true,
                    paid_at: true,
                    payment_method: true,
                  },
                },
              },
            },
          },
        },
        maintenance_requests: {
          orderBy: { created_at: "desc" },
          take: 3,
          select: {
            id: true,
            title: true,
            priority: true,
            status: true,
            created_at: true,
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
    return (
      <RenterShell user={shellUser}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-amber-50 p-4">
            <Icon name="building" className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">No tenant record found</h1>
          <p className="max-w-md text-slate-500">
            Your account isn&apos;t linked to a tenant record yet. Please contact your property
            manager to complete your setup.
          </p>
        </div>
      </RenterShell>
    );
  }

  const activeLeaseTenant = tenant.lease_tenants.find(
    (lt) => lt.leases.status === "active",
  );
  const lease = activeLeaseTenant?.leases ?? tenant.lease_tenants[0]?.leases ?? null;
  const unit = lease?.units ?? null;
  const property = unit?.properties ?? null;

  const now = new Date();
  const nextPayment = lease?.payments.find(
    (p) =>
      p.status === "pending" &&
      p.due_date &&
      new Date(p.due_date) >= now,
  ) ?? null;

  const recentPayments = lease?.payments ?? [];
  const recentMaintenance = tenant.maintenance_requests;
  const support = await getRenterSupportContact(tenant.organization_id);

  const firstName = shellUser.firstName ?? tenant.first_name;

  return (
    <RenterShell user={shellUser}>
      <div className="space-y-8">
        {/* Header */}
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {firstName ? `Welcome back, ${firstName}` : "Your Portal"}
          </h1>
          <p className="mt-1 text-slate-500">
            Here&apos;s an overview of your home and upcoming items.
          </p>
        </header>

        {/* Lease summary */}
        {lease && unit && property ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article className="col-span-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50">
                    <Icon name="building" className="h-6 w-6 text-sky-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{property.name}</h2>
                    <p className="text-sm text-slate-500">
                      Unit {unit.unit_number} · {property.address}, {property.city}, {property.state} {property.zip}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      {unit.bedrooms > 0 && <span>{unit.bedrooms} bed</span>}
                      {Number(unit.bathrooms) > 0 && <span>{Number(unit.bathrooms)} bath</span>}
                      {unit.square_feet && <span>{unit.square_feet.toLocaleString()} sqft</span>}
                    </div>
                  </div>
                </div>
                <span
                  className={[
                    "self-start rounded-full px-3 py-1 text-xs font-semibold",
                    lease.status === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600",
                  ].join(" ")}
                >
                  {lease.status === "active" ? "Active Lease" : lease.status}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Monthly Rent</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {formatCurrency(Number(lease.rent_amount))}
                  </p>
                </div>
                {lease.security_deposit && (
                  <div>
                    <p className="text-xs font-medium text-slate-500">Security Deposit</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {formatCurrency(Number(lease.security_deposit))}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-slate-500">Lease Start</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {formatDate(lease.start_date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Lease End</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {lease.end_date ? formatDate(lease.end_date) : "Month-to-month"}
                  </p>
                </div>
              </div>
            </article>

            {/* Next payment */}
            <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                  <Icon name="calendar" className="h-5 w-5 text-amber-600" />
                </div>
                <h2 className="text-sm font-medium text-slate-500">Next Payment Due</h2>
              </div>
              {nextPayment ? (
                <div className="mt-3">
                  <p className="text-2xl font-bold text-slate-900">
                    {formatCurrency(Number(nextPayment.amount))}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">Due {formatDate(nextPayment.due_date)}</p>
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-sm text-slate-500">No upcoming payments scheduled.</p>
                </div>
              )}
            </article>

            {/* Quick actions */}
            <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:col-span-1 lg:col-span-2">
              <h2 className="mb-4 text-sm font-medium text-slate-500">Quick Actions</h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <Link
                  href="/renter/payments"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Icon name="wallet" className="h-4 w-4 text-sky-500" />
                  Make Payment
                </Link>
                <Link
                  href="/renter/lease"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Icon name="check" className="h-4 w-4 text-emerald-500" />
                  View Lease
                </Link>
                <Link
                  href="/renter/maintenance"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Icon name="wrench" className="h-4 w-4 text-sky-500" />
                  View Requests
                </Link>
              </div>
            </article>
          </section>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            No active lease found. Contact your property manager.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent payments */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900">Recent Payments</h2>
              <Link href="/renter/payments" className="text-sm text-sky-600 hover:text-sky-700">
                View all
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {recentPayments.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No payment history yet.</p>
              ) : (
                recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {formatCurrency(Number(payment.amount))}
                      </p>
                      <p className="text-xs text-slate-500">
                        Due {formatDate(payment.due_date)}
                        {payment.paid_at ? ` · Paid ${formatDate(payment.paid_at)}` : ""}
                      </p>
                    </div>
                    <span
                      className={[
                        "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        paymentStatusColors[payment.status] ?? "bg-slate-100 text-slate-600",
                      ].join(" ")}
                    >
                      {payment.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Recent maintenance */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900">Maintenance Requests</h2>
              <Link href="/renter/maintenance" className="text-sm text-sky-600 hover:text-sky-700">
                View all
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {recentMaintenance.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No maintenance requests submitted yet.</p>
              ) : (
                recentMaintenance.map((req) => (
                  <div key={req.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{req.title}</p>
                      <p className="text-xs text-slate-500">{formatDate(req.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={[
                          "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          statusColors[req.status] ?? "bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        {req.status.replace("_", " ")}
                      </span>
                      <span
                        className={[
                          "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                          priorityColors[req.priority] ?? "bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        {req.priority}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {recentMaintenance.length === 0 && (
              <div className="p-4 pt-0">
                <Link
                  href="/renter/maintenance"
                  className="flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
                >
                  <Icon name="wrench" className="h-4 w-4" />
                  Submit a request
                </Link>
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900">Lease & Contact</h2>
              <Link href="/renter/lease" className="text-sm text-sky-600 hover:text-sky-700">
                Open lease
              </Link>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Manager</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {support.managerName ?? support.organizationName ?? "Property Manager"}
                </p>
                <p className="text-sm text-slate-500">
                  {support.managerEmail ?? support.organizationEmail ?? "No email on file"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Default Payment Method</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {recentPayments.find((payment) => payment.payment_method)?.payment_method ?? "No card on file"}
                </p>
              </div>
              <Link
                href="/renter/lease"
                className="inline-flex rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Lease details
              </Link>
            </div>
          </section>
        </div>
      </div>
    </RenterShell>
  );
}
