import { currentUser } from "@clerk/nextjs/server";
import { AppShell } from "@/components/AppShell";

const revenueData = [
  { month: "Jan", revenue: 18000 },
  { month: "Feb", revenue: 21000 },
  { month: "Mar", revenue: 19500 },
  { month: "Apr", revenue: 24500 },
  { month: "May", revenue: 23000 },
  { month: "Jun", revenue: 24500 },
];

const stats = [
  {
    name: "Total Properties",
    value: "12",
    icon: "building",
    subtext: "Live portfolio",
  },
  {
    name: "Active Leases",
    value: "18",
    icon: "users",
    subtext: "6 renewals this month",
  },
  {
    name: "Open Requests",
    value: "7",
    icon: "wrench",
    subtext: "2 urgent items",
  },
  {
    name: "Monthly Revenue",
    value: "$24,500",
    icon: "wallet",
    subtext: "From active leases",
  },
];

const alerts = [
  {
    title: "Oak Terrace 2B needs income review",
    detail: "Applicant documents are waiting for approval.",
    severity: "high",
  },
  {
    title: "Pine Lofts HVAC inspection",
    detail: "Vendor requested a same-day confirmation.",
    severity: "medium",
  },
  {
    title: "Cedar House lease draft",
    detail: "Manager approval is the final step.",
    severity: "low",
  },
];

const portfolioHealth = [
  {
    propertyId: "oak-terrace",
    address: "Oak Terrace 2B",
    city: "Atlanta",
    state: "GA",
    score: 91,
    occupancy: 96,
    rent: 94,
    maintenance: 88,
    noi: 90,
  },
  {
    propertyId: "maple-court",
    address: "Maple Court 4A",
    city: "Decatur",
    state: "GA",
    score: 84,
    occupancy: 89,
    rent: 92,
    maintenance: 76,
    noi: 81,
  },
  {
    propertyId: "cedar-house",
    address: "Cedar House",
    city: "Marietta",
    state: "GA",
    score: 78,
    occupancy: 82,
    rent: 86,
    maintenance: 70,
    noi: 74,
  },
];

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
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
  const user = await currentUser();
  const unsafeMetadata = (user?.unsafeMetadata ?? {}) as Record<string, unknown>;
  const organizationName = metadataString(unsafeMetadata, "organizationName");
  const firstName =
    user?.firstName ?? metadataString(unsafeMetadata, "firstName") ?? null;
  const tallestRevenue = Math.max(...revenueData.map((item) => item.revenue));

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
            <p className="mt-1 text-slate-500">
              {firstName ? `Welcome back, ${firstName}. ` : ""}
              Overview of{" "}
              {organizationName ? `${organizationName}'s ` : "your "}
              rental portfolio performance.
            </p>
          </div>
          <div className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm sm:self-auto">
            Last updated: Today, 9:41 AM
          </div>
        </header>

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

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm lg:col-span-2">
            <div className="border-b border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Revenue Overview
              </h2>
            </div>
            <div className="h-[300px] p-6">
              <div className="flex h-full items-end gap-3">
                {revenueData.map((item) => (
                  <div
                    key={item.month}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
                  >
                    <div
                      className="rounded-t bg-emerald-500"
                      style={{
                        height: `${Math.max(12, (item.revenue / tallestRevenue) * 100)}%`,
                      }}
                      title={`$${item.revenue.toLocaleString()}`}
                    />
                    <div className="text-center text-xs text-slate-500">
                      {item.month}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Icon name="alert" className="h-4 w-4 text-amber-600" />
                Smart Alerts Center
              </h2>
            </div>
            <div className="space-y-6 p-6">
              {alerts.map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <div
                    className={[
                      "mt-2 h-2 w-2 rounded-full",
                      item.severity === "high"
                        ? "bg-red-500"
                        : item.severity === "medium"
                          ? "bg-amber-500"
                          : "bg-sky-500",
                    ].join(" ")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500">{item.detail}</p>
                  </div>
                  <span className="rounded border border-slate-200 px-2 py-0.5 text-xs capitalize text-slate-600">
                    {item.severity}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              Portfolio Health Score
            </h2>
          </div>
          <div className="space-y-3 p-6">
            {portfolioHealth.map((item) => (
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
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
