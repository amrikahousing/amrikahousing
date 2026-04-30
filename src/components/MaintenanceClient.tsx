"use client";

import { useMemo, useState } from "react";

export type UserRole = "manager" | "tenant";
export type RequestPriority = "low" | "medium" | "high" | "emergency";
export type RequestStatus = "open" | "in_progress" | "completed" | "rejected" | "cancelled";
export type RequestCategory =
  | "plumbing"
  | "electrical"
  | "hvac"
  | "appliance"
  | "pest"
  | "security"
  | "general";

export type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export type MaintenanceRequest = {
  id: string;
  propertyId: string;
  tenantId: string;
  title: string;
  description: string;
  category: RequestCategory;
  priority: RequestPriority;
  status: RequestStatus;
  slaDueAt: string | null;
  escalatedAt: string | null;
  assignedVendor: string | null;
  assignmentNote: string | null;
  createdAt: string;
  statusChangeNote: string | null;
};

type MaintenanceClientProps = {
  role: UserRole;
  userId: string;
  initialProperties: Property[];
  initialRequests: MaintenanceRequest[];
};

const inputClass =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

function priorityRank(priority: RequestPriority) {
  const ranks: Record<RequestPriority, number> = {
    emergency: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return ranks[priority];
}

function propertyLabel(property?: Property | null) {
  if (!property) return null;
  return `${property.address}, ${property.city}, ${property.state} ${property.zipCode}`;
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function relativeDate(value: string | null) {
  if (!value) return "not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not set";

  const diffMs = date.getTime() - Date.now();
  const absHours = Math.round(Math.abs(diffMs) / (1000 * 60 * 60));
  if (absHours < 24) {
    return diffMs >= 0 ? `in ${absHours || 1}h` : `${absHours || 1}h ago`;
  }

  const days = Math.round(absHours / 24);
  return diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
}

function priorityClass(priority: RequestPriority) {
  switch (priority) {
    case "emergency":
      return "border-red-600 bg-red-500 text-white";
    case "high":
      return "border-red-200 bg-red-100 text-red-700";
    case "medium":
      return "border-amber-200 bg-amber-100 text-amber-700";
    default:
      return "border-sky-200 bg-sky-100 text-sky-700";
  }
}

function statusClass(status: RequestStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "in_progress":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
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

  if (name === "search") {
    return (
      <svg {...shared}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg {...shared}>
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="m19.4 15-.8 1.4 1 2-2.1 2.1-2-1-1.5.6-.7 2.1h-3l-.7-2.1-1.5-.6-2 1-2.1-2.1 1-2-.8-1.4-2.1-.7v-3l2.1-.7.8-1.4-1-2 2.1-2.1 2 1 1.5-.6.7-2.1h3l.7 2.1 1.5.6 2-1 2.1 2.1-1 2 .8 1.4 2.1.7v3l-2.1.7Z" />
      </svg>
    );
  }

  if (name === "bot") {
    return (
      <svg {...shared}>
        <path d="M12 4V2M8 4h8a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z" />
        <path d="M9 10h.01M15 10h.01M9 15h6" />
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

  if (name === "clock") {
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path d="M6 6h12M6 12h12M6 18h12" />
    </svg>
  );
}

function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-semibold capitalize",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        aria-pressed={checked}
        className={[
          "relative h-6 w-11 rounded-full transition-colors",
          checked ? "bg-emerald-600" : "bg-slate-300",
        ].join(" ")}
        onClick={() => onChange(!checked)}
      >
        <span
          className={[
            "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-1",
          ].join(" ")}
        />
      </button>
    </label>
  );
}

function buildTimeline(request: MaintenanceRequest) {
  const events = [
    { label: "Submitted", detail: formatDate(request.createdAt) },
    request.assignedVendor
      ? { label: "Assigned vendor", detail: request.assignedVendor }
      : null,
    request.slaDueAt
      ? { label: "Target response", detail: formatDate(request.slaDueAt) }
      : null,
    { label: "Current status", detail: request.status.replaceAll("_", " ") },
    request.assignmentNote
      ? { label: "Team note", detail: request.assignmentNote }
      : null,
  ];

  return events.filter(Boolean) as Array<{ label: string; detail: string }>;
}

export function MaintenanceClient({
  role,
  userId,
  initialProperties,
  initialRequests,
}: MaintenanceClientProps) {
  const [requests, setRequests] =
    useState<MaintenanceRequest[]>(initialRequests);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoTriageEnabled, setAutoTriageEnabled] = useState(true);
  const [autoEscalationEnabled, setAutoEscalationEnabled] = useState(true);
  const [autoVendorAssignmentEnabled, setAutoVendorAssignmentEnabled] =
    useState(true);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    id: string;
    status: RequestStatus;
  } | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const propertyById = useMemo(() => {
    return new Map(initialProperties.map((property) => [property.id, property]));
  }, [initialProperties]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(requests.map((request) => request.category))).sort();
  }, [requests]);

  const priorityOptions = useMemo(() => {
    return Array.from(new Set(requests.map((request) => request.priority))).sort(
      (a, b) => priorityRank(a) - priorityRank(b),
    );
  }, [requests]);

  const visibleRequests = useMemo(() => {
    const scopedRequests =
      role === "tenant"
        ? requests.filter(
            (request) => request.tenantId === userId,
          )
        : requests;
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return scopedRequests
      .filter((request) => {
        if (!normalizedQuery) return true;
        const label = propertyLabel(propertyById.get(request.propertyId)) ?? "";
        return [
          request.title,
          request.description,
          request.assignedVendor,
          request.assignmentNote,
          request.category,
          request.priority,
          label,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .filter(
        (request) =>
          selectedPropertyId === "all" ||
          String(request.propertyId) === selectedPropertyId,
      )
      .filter(
        (request) =>
          selectedCategory === "all" || request.category === selectedCategory,
      )
      .filter(
        (request) =>
          selectedPriority === "all" || request.priority === selectedPriority,
      )
      .sort((a, b) => {
        const rank = priorityRank(a.priority) - priorityRank(b.priority);
        if (rank !== 0) return rank;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
  }, [
    propertyById,
    requests,
    role,
    searchQuery,
    selectedCategory,
    selectedPriority,
    selectedPropertyId,
    userId,
  ]);

  const dropdownFilterCount =
    (selectedPropertyId !== "all" ? 1 : 0) +
    (selectedCategory !== "all" ? 1 : 0) +
    (selectedPriority !== "all" ? 1 : 0);

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) + dropdownFilterCount;

  function resetFilters() {
    setSearchQuery("");
    setSelectedPropertyId("all");
    setSelectedCategory("all");
    setSelectedPriority("all");
  }

  function handleStatusChange(id: string, status: RequestStatus) {
    if (status === "completed" || status === "rejected") {
      setPendingStatusChange({ id, status });
      setResolutionNote("");
    } else {
      commitStatusChange(id, status, "");
    }
  }

  function commitStatusChange(id: string, status: RequestStatus, note: string) {
    setRequests((current) =>
      current.map((request) =>
        request.id === id ? { ...request, status } : request,
      ),
    );
    setPendingStatusChange(null);
    setResolutionNote("");

    void fetch(`/api/maintenance/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, actorName: "Manager", resolutionNote: note }),
    }).then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { request: { status_change_note: string } };
        setRequests((current) =>
          current.map((request) =>
            request.id === id
              ? { ...request, statusChangeNote: data.request.status_change_note }
              : request,
          ),
        );
      }
    });
  }

  function submitTenantRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const nextRequest: MaintenanceRequest = {
      id: crypto.randomUUID(),
      propertyId: initialProperties[0]?.id ?? "",
      tenantId: userId,
      title: title.trim(),
      description: description.trim(),
      category: "general",
      priority: "medium",
      status: "open",
      slaDueAt: null,
      escalatedAt: null,
      assignedVendor: null,
      assignmentNote: "Your property team has been notified.",
      createdAt: new Date().toISOString(),
      statusChangeNote: null,
    };

    if (!nextRequest.propertyId) return;
    setRequests((current) => [nextRequest, ...current]);
    setTitle("");
    setDescription("");
  }

  if (role === "tenant") {
    const activeProperty = initialProperties[0];

    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Maintenance
          </h1>
          <p className="mt-1 text-slate-500">
            Submit a request and track updates from your property team.
          </p>
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Submit Request
              </h2>
            </div>
            <form className="space-y-4 p-6" onSubmit={submitTenantRequest}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Property
                </p>
                <p className="mt-2 font-medium text-slate-900">
                  {propertyLabel(activeProperty) ?? "No linked property found"}
                </p>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  Title
                </span>
                <input
                  className={inputClass}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Leaky faucet"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  Description
                </span>
                <textarea
                  className="min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the issue, location, and urgency"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={!activeProperty}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Submit Request
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Request Timeline
              </h2>
            </div>
            <div className="space-y-4 p-6">
              {visibleRequests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
                  <p className="text-slate-500">No maintenance requests yet.</p>
                </div>
              ) : (
                visibleRequests.map((request) => (
                  <article
                    key={request.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      {propertyLabel(propertyById.get(request.propertyId))}
                    </p>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="font-medium text-slate-900">
                          {request.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {request.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={statusClass(request.status)}>
                          {request.status.replaceAll("_", " ")}
                        </Badge>
                        <Badge className={priorityClass(request.priority)}>
                          {request.priority}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3 border-l border-slate-200 pl-4">
                      {buildTimeline(request).map((event) => (
                        <div key={`${request.id}-${event.label}`}>
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                            {event.label}
                          </p>
                          <p className="text-sm capitalize text-slate-800">
                            {event.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Maintenance Requests
          </h1>
          <p className="mt-1 text-slate-500">
            Track and manage property repairs.
          </p>
        </div>

        <div className="relative">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            aria-label="Maintenance settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Icon name="settings" className="h-4 w-4" />
          </button>

          {settingsOpen ? (
            <div className="absolute right-0 top-11 z-20 w-[min(20rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
              <Toggle
                label="Enable auto-triage"
                checked={autoTriageEnabled}
                onChange={setAutoTriageEnabled}
              />
              <Toggle
                label="Enable SLA escalations"
                checked={autoEscalationEnabled}
                onChange={setAutoEscalationEnabled}
              />
              <Toggle
                label="Enable vendor auto-assignment"
                checked={autoVendorAssignmentEnabled}
                onChange={setAutoVendorAssignmentEnabled}
              />
              <p className="text-[11px] text-slate-500">
                Changes are saved locally for this session.
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search maintenance by title, property, vendor, description..."
              className={`${inputClass} pl-10`}
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
              filtersOpen || dropdownFilterCount > 0
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon name="filter" className="h-4 w-4" />
            Filters
            {dropdownFilterCount > 0 ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                {dropdownFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {filtersOpen ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <select
              value={selectedPropertyId}
              onChange={(event) => setSelectedPropertyId(event.target.value)}
              className={`${inputClass} bg-slate-50`}
            >
              <option value="all">All properties</option>
              {initialProperties.map((property) => (
                <option key={property.id} value={property.id}>
                  {propertyLabel(property)}
                </option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className={`${inputClass} bg-slate-50 capitalize`}
            >
              <option value="all">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category.replaceAll("_", " ")}
                </option>
              ))}
            </select>

            <select
              value={selectedPriority}
              onChange={(event) => setSelectedPriority(event.target.value)}
              className={`${inputClass} bg-slate-50 capitalize`}
            >
              <option value="all">All severity levels</option>
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {activeFilterCount > 0 ? (
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {searchQuery.trim() ? (
                <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                  Search: {searchQuery.trim()}
                  <button type="button" onClick={() => setSearchQuery("")}>
                    x
                  </button>
                </Badge>
              ) : null}
              {selectedPropertyId !== "all" ? (
                <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                  Property:{" "}
                  {propertyLabel(propertyById.get(selectedPropertyId)) ??
                    selectedPropertyId}
                  <button
                    type="button"
                    onClick={() => setSelectedPropertyId("all")}
                  >
                    x
                  </button>
                </Badge>
              ) : null}
              {selectedCategory !== "all" ? (
                <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                  Category: {selectedCategory.replaceAll("_", " ")}
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                  >
                    x
                  </button>
                </Badge>
              ) : null}
              {selectedPriority !== "all" ? (
                <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                  Severity: {selectedPriority}
                  <button
                    type="button"
                    onClick={() => setSelectedPriority("all")}
                  >
                    x
                  </button>
                </Badge>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
              <span>
                {visibleRequests.length} request
                {visibleRequests.length === 1 ? "" : "s"} shown
              </span>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  onClick={resetFilters}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            {visibleRequests.length} request
            {visibleRequests.length === 1 ? "" : "s"} shown
          </p>
        )}
      </section>

      {pendingStatusChange ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">
              {pendingStatusChange.status === "completed" ? "Resolve request" : "Reject request"}
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              {pendingStatusChange.status === "completed"
                ? "Briefly describe how this was resolved."
                : "Briefly explain why this request is being rejected."}
            </p>
            <textarea
              autoFocus
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder={
                pendingStatusChange.status === "completed"
                  ? "e.g. Replaced the faulty valve. Issue resolved."
                  : "e.g. Duplicate request — already addressed in ticket #123."
              }
              className="min-h-[100px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingStatusChange(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  commitStatusChange(
                    pendingStatusChange.id,
                    pendingStatusChange.status,
                    resolutionNote.trim(),
                  )
                }
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                  pendingStatusChange.status === "completed"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {pendingStatusChange.status === "completed" ? "Mark as resolved" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4">
        {visibleRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-20 text-center">
            <p className="text-slate-500">
              No maintenance requests match the current filters.
            </p>
          </div>
        ) : (
          visibleRequests.map((request) => (
            <article
              key={request.id}
              className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-col gap-6 md:flex-row">
                <div className="min-w-0 flex-1">
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {propertyLabel(propertyById.get(request.propertyId))}
                  </p>
                  <div className="mb-2 flex items-center gap-3">
                    <Badge className={priorityClass(request.priority)}>
                      {request.priority}
                    </Badge>
                    <span className="text-sm text-slate-400">
                      {formatDate(request.createdAt).split(",")[0]}
                    </span>
                  </div>
                  <h2 className="mb-2 text-lg font-bold text-slate-900">
                    {request.title}
                  </h2>
                  <p className="mb-4 text-sm text-slate-600">
                    {request.description}
                  </p>

                  <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                    <Badge className="border-slate-200 bg-white text-slate-700">
                      {request.category}
                    </Badge>
                    {request.assignedVendor ? (
                      <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                        <Icon name="wrench" className="h-3 w-3" />
                        {request.assignedVendor}
                      </Badge>
                    ) : null}
                    {request.assignmentNote ? (
                      <span className="text-slate-500">
                        {request.assignmentNote}
                      </span>
                    ) : null}
                    {request.slaDueAt ? (
                      <Badge className="border-slate-200 bg-white text-slate-700">
                        <Icon name="clock" className="h-3 w-3" />
                        SLA {relativeDate(request.slaDueAt)}
                      </Badge>
                    ) : null}
                    {request.escalatedAt ? (
                      <Badge className="border-red-600 bg-red-600 text-white">
                        Escalated
                      </Badge>
                    ) : null}
                  </div>

                  {request.statusChangeNote ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      {request.statusChangeNote}
                    </div>
                  ) : null}

                </div>

                <div className="flex flex-col gap-3 md:min-w-[200px]">
                  <label className="flex flex-col items-start gap-2 text-sm font-medium text-slate-700 sm:flex-row sm:items-center md:flex-col md:items-start">
                    Status:
                    <select
                      value={request.status}
                      onChange={(event) =>
                        handleStatusChange(
                          request.id,
                          event.target.value as RequestStatus,
                        )
                      }
                      disabled={request.status === "cancelled"}
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="rejected">Rejected</option>
                      {request.status === "cancelled" ? (
                        <option value="cancelled">Cancelled</option>
                      ) : null}
                    </select>
                  </label>

                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
