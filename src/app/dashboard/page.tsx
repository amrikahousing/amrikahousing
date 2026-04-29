import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell, getAppShellUser } from "@/components/AppShell";
import { prisma } from "@/lib/db";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRatio(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
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

  if (name === "apartment") {
    return (
      <svg {...shared}>
        <path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21" />
        <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M4 21h16" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...shared}>
        <path d="M16 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 20a5.5 5.5 0 0 1 9-4.2M13.5 20a5 5 0 0 1 8 0" />
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

  if (name === "wallet") {
    return (
      <svg {...shared}>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
        <path d="M17 12h3v4h-3a2 2 0 0 1 0-4Z" />
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

export default async function DashboardPage() {
  const [{ userId, orgId }, shellUser] = await Promise.all([
    auth(),
    getAppShellUser(),
  ]);
  if (!userId) redirect("/login");

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index), 1);
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const [
    totalProperties,
    totalApartments,
    vacantApartments,
    maintenanceApartments,
    activeLeases,
    openRequests,
    urgentOpenRequests,
    activeLeaseRows,
    recentPayments,
    recentAlerts,
    properties,
  ] = orgId
    ? await Promise.all([
        prisma.properties.count({
          where: {
            organizations: { clerk_org_id: orgId },
            deleted_at: null,
          },
        }),
        prisma.units.count({
          where: {
            deleted_at: null,
            properties: {
              deleted_at: null,
              organizations: { clerk_org_id: orgId },
            },
          },
        }),
        prisma.units.count({
          where: {
            status: "vacant",
            deleted_at: null,
            properties: {
              deleted_at: null,
              organizations: { clerk_org_id: orgId },
            },
          },
        }),
        prisma.units.count({
          where: {
            status: "maintenance",
            deleted_at: null,
            properties: {
              deleted_at: null,
              organizations: { clerk_org_id: orgId },
            },
          },
        }),
        prisma.leases.count({
          where: {
            status: "active",
            deleted_at: null,
            units: {
              deleted_at: null,
              properties: {
                deleted_at: null,
                organizations: { clerk_org_id: orgId },
              },
            },
          },
        }),
        prisma.maintenance_requests.count({
          where: {
            organizations: { clerk_org_id: orgId },
            status: { in: ["open", "in_progress"] },
          },
        }),
        prisma.maintenance_requests.count({
          where: {
            organizations: { clerk_org_id: orgId },
            status: { in: ["open", "in_progress"] },
            priority: { in: ["high", "emergency"] },
          },
        }),
        prisma.leases.findMany({
          where: {
            status: "active",
            deleted_at: null,
            units: {
              deleted_at: null,
              properties: {
                deleted_at: null,
                organizations: { clerk_org_id: orgId },
              },
            },
          },
          select: { rent_amount: true },
        }),
        prisma.payments.findMany({
          where: {
            leases: {
              units: {
                deleted_at: null,
                properties: {
                  deleted_at: null,
                  organizations: { clerk_org_id: orgId },
                },
              },
            },
            OR: [
              { paid_at: { gte: monthStart(months[0]) } },
              { due_date: { gte: monthStart(months[0]) } },
            ],
          },
          select: {
            amount: true,
            paid_at: true,
            due_date: true,
            status: true,
            leases: {
              select: {
                unit_id: true,
                units: {
                  select: {
                    property_id: true,
                  },
                },
              },
            },
          },
        }),
        prisma.maintenance_requests.findMany({
          where: {
            organizations: { clerk_org_id: orgId },
            status: { in: ["open", "in_progress"] },
          },
          include: {
            units: {
              include: {
                properties: true,
              },
            },
          },
          orderBy: [{ priority: "desc" }, { created_at: "desc" }],
          take: 3,
        }),
        prisma.properties.findMany({
          where: {
            organizations: { clerk_org_id: orgId },
            deleted_at: null,
          },
          include: {
            units: {
              where: { deleted_at: null },
              include: {
                leases: {
                  where: { deleted_at: null },
                  select: {
                    id: true,
                    status: true,
                  },
                },
                maintenance_requests: {
                  select: {
                    id: true,
                    priority: true,
                    status: true,
                  },
                },
              },
            },
          },
          orderBy: { created_at: "desc" },
          take: 6,
        }),
      ])
    : [0, 0, 0, 0, 0, 0, 0, [], [], [], []];

  const monthlyRevenue = activeLeaseRows.reduce(
    (sum, lease) => sum + Number(lease.rent_amount ?? 0),
    0,
  );
  const occupiedApartments = Math.max(totalApartments - vacantApartments - maintenanceApartments, 0);
  const apartmentOccupancyRate =
    totalApartments === 0 ? 0 : clampScore((occupiedApartments / totalApartments) * 100);
  const apartmentVacancyRate =
    totalApartments === 0 ? 0 : clampScore((vacantApartments / totalApartments) * 100);
  const apartmentMaintenanceRate =
    totalApartments === 0 ? 0 : clampScore((maintenanceApartments / totalApartments) * 100);
  const averageApartmentsPerProperty =
    totalProperties === 0 ? 0 : totalApartments / totalProperties;
  const averageRentPerActiveLease =
    activeLeaseRows.length === 0 ? 0 : monthlyRevenue / activeLeaseRows.length;
  const revenuePerApartment =
    totalApartments === 0 ? 0 : monthlyRevenue / totalApartments;
  const requestsPer100Apartments =
    totalApartments === 0 ? 0 : (openRequests / totalApartments) * 100;
  const completedPaymentCount = recentPayments.filter(
    (payment) => payment.status === "paid" || payment.status === "completed",
  ).length;
  const collectiblePaymentCount = recentPayments.filter(
    (payment) => payment.status !== "failed" && payment.status !== "cancelled",
  ).length;
  const rentCollectionRate =
    collectiblePaymentCount === 0
      ? apartmentOccupancyRate
      : clampScore((completedPaymentCount / collectiblePaymentCount) * 100);
  const routineOpenRequests = Math.max(openRequests - urgentOpenRequests, 0);

  const stats = [
    {
      name: "Total Properties",
      value: totalProperties.toLocaleString(),
      icon: "building",
      subtext: "Live portfolio",
    },
    {
      name: "Total Apartments",
      value: totalApartments.toLocaleString(),
      icon: "apartment",
      subtext: `${occupiedApartments.toLocaleString()} occupied across the portfolio`,
    },
    {
      name: "Vacant Apartments",
      value: vacantApartments.toLocaleString(),
      icon: "apartment",
      subtext: `${apartmentOccupancyRate}% apartment occupancy`,
    },
    {
      name: "Apartments in Maintenance",
      value: maintenanceApartments.toLocaleString(),
      icon: "wrench",
      subtext: "Units marked for repair or turnover",
    },
    {
      name: "Active Leases",
      value: activeLeases.toLocaleString(),
      icon: "users",
      subtext: `${Math.max(activeLeases, 0)} currently occupied agreements`,
    },
    {
      name: "Open Requests",
      value: openRequests.toLocaleString(),
      icon: "wrench",
      subtext: `${urgentOpenRequests} urgent item${urgentOpenRequests === 1 ? "" : "s"}`,
    },
    {
      name: "Monthly Revenue",
      value: formatCurrency(monthlyRevenue),
      icon: "wallet",
      subtext: "Projected from active leases",
    },
  ];

  const analytics = [
    {
      name: "Avg Apartments / Property",
      value: formatRatio(averageApartmentsPerProperty),
      detail: "Portfolio density",
    },
    {
      name: "Occupancy Rate",
      value: `${apartmentOccupancyRate}%`,
      detail: `${occupiedApartments.toLocaleString()} occupied apartment${occupiedApartments === 1 ? "" : "s"}`,
    },
    {
      name: "Vacancy Rate",
      value: `${apartmentVacancyRate}%`,
      detail: `${vacantApartments.toLocaleString()} ready for leasing`,
    },
    {
      name: "Avg Rent / Active Lease",
      value: formatCurrency(averageRentPerActiveLease),
      detail: "Monthly rent roll average",
    },
    {
      name: "Revenue / Apartment",
      value: formatCurrency(revenuePerApartment),
      detail: "Monthly rent roll per unit",
    },
    {
      name: "Requests / 100 Apartments",
      value: formatRatio(requestsPer100Apartments),
      detail: `${apartmentMaintenanceRate}% of apartments in maintenance`,
    },
  ];

  const revenueData = months.map((date) => {
    const start = monthStart(date);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const revenue = recentPayments
      .filter((payment) => {
        if (payment.status === "failed" || payment.status === "cancelled") {
          return false;
        }
        const effectiveDate = payment.paid_at ?? payment.due_date;
        if (!effectiveDate) return false;
        return effectiveDate >= start && effectiveDate < end;
      })
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

    return {
      month: monthLabel(start),
      revenue,
    };
  });

  const tallestRevenue = Math.max(1, ...revenueData.map((item) => item.revenue));

  const alerts =
    recentAlerts.length > 0
      ? recentAlerts.map((item) => ({
          title: item.title,
          detail: `${item.units.properties.name}${item.units.unit_number ? ` • Unit ${item.units.unit_number}` : ""}`,
          severity:
            item.priority === "emergency" || item.priority === "high"
              ? "high"
              : item.priority === "normal"
                ? "medium"
                : "low",
        }))
      : [
          {
            title: "No active alerts",
            detail: "Open maintenance issues will appear here.",
            severity: "low",
          },
        ];

  const portfolioHealth = properties.map((property) => {
    const totalUnits = property.units.length;
    const occupiedUnits = property.units.filter(
      (unit) =>
        unit.status === "occupied" ||
        unit.leases?.status === "active",
    ).length;
    const propertyOpenRequests = property.units.flatMap((unit) =>
      unit.maintenance_requests.filter((request) =>
        ["open", "in_progress"].includes(request.status),
      ),
    );
    const severeRequestCount = propertyOpenRequests.filter((request) =>
      ["high", "emergency"].includes(request.priority),
    ).length;
    const occupancy = totalUnits === 0 ? 0 : (occupiedUnits / totalUnits) * 100;

    const propertyPayments = recentPayments.filter(
      (payment) => payment.leases.units.property_id === property.id,
    );
    const completedPayments = propertyPayments.filter(
      (payment) => payment.status === "paid" || payment.status === "completed",
    ).length;
    const rent = propertyPayments.length
      ? (completedPayments / propertyPayments.length) * 100
      : occupancy;

    const maintenance = clampScore(
      100 - propertyOpenRequests.length * 12 - severeRequestCount * 10,
    );
    const noi = clampScore(occupancy * 0.45 + rent * 0.35 + maintenance * 0.2);
    const score = clampScore((occupancy + rent + maintenance + noi) / 4);

    return {
      propertyId: property.id,
      address: property.name,
      city: property.city,
      state: property.state,
      score,
      occupancy: clampScore(occupancy),
      rent: clampScore(rent),
      maintenance,
      noi,
    };
  });

  const averagePortfolioScore =
    portfolioHealth.length === 0
      ? 0
      : clampScore(
          portfolioHealth.reduce((sum, item) => sum + item.score, 0) /
            portfolioHealth.length,
        );
  const strongestProperties = [...portfolioHealth]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const apartmentMix = [
    {
      label: "Occupied",
      value: occupiedApartments,
      percent: apartmentOccupancyRate,
      className: "bg-emerald-600",
    },
    {
      label: "Vacant",
      value: vacantApartments,
      percent: apartmentVacancyRate,
      className: "bg-amber-500",
    },
    {
      label: "Maintenance",
      value: maintenanceApartments,
      percent: apartmentMaintenanceRate,
      className: "bg-rose-600",
    },
  ];
  const occupiedSlice = apartmentOccupancyRate;
  const vacantSlice = occupiedSlice + apartmentVacancyRate;
  const apartmentMixGradient =
    totalApartments === 0
      ? "conic-gradient(#e2e8f0 0deg 360deg)"
      : `conic-gradient(#059669 0% ${occupiedSlice}%, #f59e0b ${occupiedSlice}% ${vacantSlice}%, #e11d48 ${vacantSlice}% 100%)`;
  const maintenanceChart = [
    {
      label: "Routine",
      value: routineOpenRequests,
      percent: openRequests === 0 ? 0 : clampScore((routineOpenRequests / openRequests) * 100),
      className: "bg-sky-500",
    },
    {
      label: "Urgent",
      value: urgentOpenRequests,
      percent: openRequests === 0 ? 0 : clampScore((urgentOpenRequests / openRequests) * 100),
      className: "bg-rose-600",
    },
  ];
  const alertGridClass = [
    "grid grid-cols-1 divide-y divide-slate-200",
    alerts.length === 1
      ? ""
      : alerts.length === 2
        ? "md:grid-cols-2 md:divide-x md:divide-y-0"
        : "md:grid-cols-3 md:divide-x md:divide-y-0",
  ].join(" ");
  const lastUpdated = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());

  return (
    <AppShell user={shellUser}>
      <div className="space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
            <p className="mt-1 text-slate-500">
              {shellUser.firstName ? `Welcome back, ${shellUser.firstName}. ` : ""}
              Overview of{" "}
              {shellUser.organizationName ? `${shellUser.organizationName}'s ` : "your "}
              rental portfolio performance.
            </p>
          </div>
          <div className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm sm:self-auto">
            Last updated: {lastUpdated}
          </div>
        </header>

        <section
          aria-label="Dashboard charts"
          className="grid grid-cols-1 gap-6 xl:grid-cols-3"
        >
          <article className="rounded-lg border border-slate-200 bg-white shadow-sm xl:col-span-2">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Revenue Trend
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Six-month rent movement from paid and scheduled payments.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                {formatCurrency(monthlyRevenue)} monthly roll
              </div>
            </div>
            <div className="h-[340px] p-6">
              <div className="flex h-full items-end gap-3 border-b border-l border-slate-200 pl-3">
                {revenueData.map((item) => (
                  <div
                    key={item.month}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
                  >
                    <div className="flex min-h-10 items-end justify-center text-[11px] font-medium text-slate-500">
                      {item.revenue > 0 ? formatCurrency(item.revenue) : ""}
                    </div>
                    <div
                      className="rounded-t bg-emerald-600 shadow-sm"
                      style={{
                        height: `${Math.max(12, (item.revenue / tallestRevenue) * 100)}%`,
                      }}
                      title={formatCurrency(item.revenue)}
                    />
                    <div className="pb-2 text-center text-xs text-slate-500">
                      {item.month}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Apartment Mix
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Current unit status across the portfolio.
              </p>
            </div>
            <div className="p-6">
              <div
                className="mx-auto flex h-48 w-48 items-center justify-center rounded-full"
                style={{ background: apartmentMixGradient }}
              >
                <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
                  <span className="text-3xl font-bold text-slate-900">
                    {apartmentOccupancyRate}%
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    occupied
                  </span>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {apartmentMix.map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${item.className}`} />
                    <span className="flex-1 text-sm text-slate-600">
                      {item.label}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {item.value.toLocaleString()}
                    </span>
                    <span className="w-10 text-right text-xs text-slate-500">
                      {item.percent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </section>

        <section
          aria-label="Operational charts"
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Portfolio Health
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Highest-scoring properties by occupancy, rent, and maintenance.
                </p>
              </div>
              <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                {averagePortfolioScore}/100 avg
              </span>
            </div>
            <div className="space-y-4 p-6">
              {strongestProperties.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Add properties to start scoring performance.
                </p>
              ) : (
                strongestProperties.map((item) => (
                  <div key={item.propertyId}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-slate-700">
                        {item.address}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {item.score}/100
                      </span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100">
                      <div
                        className="h-3 rounded-full bg-sky-500"
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Maintenance Pressure
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Open workload split by routine and urgent requests.
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-5">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Open requests
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {openRequests.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Rent collection
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">
                    {rentCollectionRate}%
                  </p>
                </div>
              </div>
              {maintenanceChart.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{item.label}</span>
                    <span className="text-slate-500">
                      {item.value.toLocaleString()} requests
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100">
                    <div
                      className={`h-3 rounded-full ${item.className}`}
                      style={{ width: `${Math.max(item.percent, item.value > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section
          aria-label="Portfolio stats"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
        >
          {stats.map((stat) => (
            <article
              key={stat.name}
              className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-slate-500">
                  {stat.name}
                </h2>
                <Icon name={stat.icon} className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                {stat.value}
              </div>
              <p className="mt-1 text-xs text-slate-500">{stat.subtext}</p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Apartment Analytics
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-3">
            {analytics.map((item) => (
              <article key={item.name} className="bg-white p-5">
                <p className="text-sm font-medium text-slate-500">
                  {item.name}
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {item.value}
                </p>
                <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Icon name="alert" className="h-4 w-4 text-amber-600" />
              Smart Alerts Center
            </h2>
          </div>
          <div className={alertGridClass}>
            {alerts.map((item) => (
              <div key={item.title} className="flex min-w-0 items-start gap-3 p-6">
                <div
                  className={[
                    "mt-2 h-2 w-2 rounded-full",
                    item.severity === "high"
                      ? "bg-rose-600"
                      : item.severity === "medium"
                        ? "bg-amber-500"
                        : "bg-sky-500",
                  ].join(" ")}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                </div>
                <span className="rounded border border-slate-200 px-2 py-0.5 text-xs capitalize text-slate-600">
                  {item.severity}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Portfolio Health Score
            </h2>
          </div>
          <div className="space-y-3 p-6">
            {portfolioHealth.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Add properties to start tracking portfolio health.
              </div>
            ) : (
              portfolioHealth.map((item) => (
                <article
                  key={item.propertyId}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-slate-900">
                        {item.address}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {item.city}, {item.state}
                      </p>
                    </div>
                    <span
                      className={[
                        "rounded px-2 py-1 text-xs font-semibold",
                        item.score >= 80
                          ? "bg-emerald-600 text-white"
                          : "border border-slate-200 text-slate-700",
                      ].join(" ")}
                    >
                      {item.score}/100
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-4">
                    <span>Occupancy: {item.occupancy}</span>
                    <span>On-time Rent: {item.rent}</span>
                    <span>Maintenance: {item.maintenance}</span>
                    <span>NOI Trend: {item.noi}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
