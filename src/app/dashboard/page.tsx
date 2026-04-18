import { currentUser } from "@clerk/nextjs/server";
import { AppNav } from "@/components/AppNav";

const metrics = [
  { label: "Available homes", value: "12", detail: "4 ready for tours" },
  { label: "Open applications", value: "18", detail: "6 need review today" },
  { label: "Maintenance tickets", value: "7", detail: "2 urgent" },
  { label: "Rent collected", value: "94%", detail: "April cycle" },
];

const leasingQueue = [
  {
    name: "Oak Terrace 2B",
    status: "Application review",
    detail: "Income documents pending",
  },
  {
    name: "Maple Court 4A",
    status: "Tour scheduled",
    detail: "Today at 3:30 PM",
  },
  {
    name: "Cedar House",
    status: "Lease draft",
    detail: "Awaiting manager approval",
  },
];

const maintenanceQueue = [
  { item: "HVAC inspection", home: "Pine Lofts 8C", priority: "Urgent" },
  { item: "Kitchen faucet", home: "Oak Terrace 2B", priority: "Normal" },
  { item: "Move-out paint", home: "Cedar House", priority: "Scheduled" },
];

const actions = [
  "Review applications",
  "Schedule a tour",
  "Open maintenance",
  "Update listings",
];

export default async function DashboardPage() {
  const user = await currentUser();
  const firstName =
    user?.firstName ??
    (typeof user?.unsafeMetadata.firstName === "string"
      ? user.unsafeMetadata.firstName
      : null);
  const role =
    typeof user?.unsafeMetadata.role === "string"
      ? user.unsafeMetadata.role.replace("_", " ")
      : "workspace";
  const organizationName =
    typeof user?.unsafeMetadata.organizationName === "string"
      ? user.unsafeMetadata.organizationName
      : null;

  return (
    <main className="relative z-0 min-h-screen px-5 py-6 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <AppNav />
        <header className="flex flex-col gap-4 border-b border-white/12 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[clamp(32px,4vw,52px)] leading-[1.05]">
              Good to see you{firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-[1.6] text-white/70">
              Your {organizationName ? `${organizationName} ` : ""}
              {role} workspace is ready for today&apos;s leasing, maintenance,
              and rent activity.
            </p>
          </div>

        </header>

        <section aria-label="Portfolio snapshot" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className="rounded-[8px] border border-white/14 bg-[rgba(10,14,24,0.58)] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-[16px]"
            >
              <p className="m-0 text-[12px] text-white/62">{metric.label}</p>
              <div className="mt-2 text-[34px] font-semibold leading-none text-white">
                {metric.value}
              </div>
              <p className="m-0 mt-2 text-[12px] leading-[1.5] text-white/68">
                {metric.detail}
              </p>
            </article>
          ))}
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <section
            aria-label="Leasing queue"
            className="rounded-[8px] border border-white/14 bg-[rgba(10,14,24,0.56)] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.32)] backdrop-blur-[16px]"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="m-0 text-[24px] leading-tight">Leasing queue</h2>
                <p className="m-0 mt-1 text-[12px] text-white/60">
                  Keep applications, tours, and lease drafts moving.
                </p>
              </div>
              <button className="mt-2 rounded-[8px] border border-white/15 bg-white/12 px-3 py-2 text-[12px] font-semibold text-white hover:bg-white/18 sm:mt-0">
                Add lead
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {leasingQueue.map((item) => (
                <div
                  key={item.name}
                  className="grid gap-3 rounded-[8px] border border-white/12 bg-white/7 p-3 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="font-semibold text-white/92">{item.name}</div>
                    <div className="mt-1 text-[12px] text-white/58">{item.detail}</div>
                  </div>
                  <div className="self-start rounded-[8px] bg-[rgba(246,184,74,0.16)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent)]">
                    {item.status}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-label="Quick actions"
            className="rounded-[8px] border border-white/14 bg-[rgba(10,14,24,0.52)] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.3)] backdrop-blur-[16px]"
          >
            <h2 className="m-0 text-[24px] leading-tight">Quick actions</h2>
            <div className="mt-4 grid gap-2">
              {actions.map((action) => (
                <button
                  key={action}
                  className="rounded-[8px] border border-white/14 bg-white/9 px-3 py-3 text-left text-[13px] font-semibold text-white/88 hover:bg-white/14"
                >
                  {action}
                </button>
              ))}
            </div>
          </section>
        </div>

        <section
          aria-label="Maintenance queue"
          className="rounded-[8px] border border-white/14 bg-[rgba(10,14,24,0.54)] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.3)] backdrop-blur-[16px]"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="m-0 text-[24px] leading-tight">Maintenance</h2>
              <p className="m-0 mt-1 text-[12px] text-white/60">
                Active work orders across occupied and vacant homes.
              </p>
            </div>
            <button className="mt-2 rounded-[8px] border border-white/15 bg-[linear-gradient(180deg,rgba(16,185,129,1),rgba(10,145,100,1))] px-3 py-2 text-[12px] font-semibold text-white sm:mt-0">
              New ticket
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-[8px] border border-white/12">
            <div className="grid grid-cols-[1fr_1fr_auto] bg-white/10 px-3 py-2 text-[11px] font-semibold text-white/62">
              <span>Work order</span>
              <span>Home</span>
              <span>Priority</span>
            </div>
            {maintenanceQueue.map((ticket) => (
              <div
                key={`${ticket.item}-${ticket.home}`}
                className="grid grid-cols-[1fr_1fr_auto] gap-3 border-t border-white/10 px-3 py-3 text-[13px] text-white/82"
              >
                <span>{ticket.item}</span>
                <span className="text-white/62">{ticket.home}</span>
                <span className="font-semibold text-[var(--accent)]">
                  {ticket.priority}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
