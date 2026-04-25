"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type MaintenanceRequest = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  scheduled_date: Date | null;
  resolved_at: Date | null;
  units: {
    unit_number: string;
    properties: { name: string };
  };
};

type Props = {
  requests: MaintenanceRequest[];
  hasActiveLease: boolean;
  unitLabel: string | null;
};

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 border-slate-200",
  normal: "bg-sky-50 text-sky-700 border-sky-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  emergency: "bg-rose-50 text-rose-700 border-rose-200",
};

const statusColors: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  in_progress: "bg-sky-50 text-sky-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

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

  if (name === "wrench") {
    return (
      <svg {...shared}>
        <path d="M14.7 6.3a4 4 0 0 0 5 5L11 20l-4-4 8.7-8.7Z" />
        <path d="m7 16-3 3 1 1 3-3" />
      </svg>
    );
  }
  if (name === "plus") {
    return (
      <svg {...shared}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (name === "x") {
    return (
      <svg {...shared}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    );
  }
  return null;
}

export function MaintenanceClient({ requests, hasActiveLease, unitLabel }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const activeRequests = requests.filter((request) => request.status === "open" || request.status === "in_progress");
  const completedRequests = requests.filter((request) => request.status === "resolved" || request.status === "closed");
  const visibleRequests = activeTab === "active" ? activeRequests : completedRequests;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Please enter a title for your request.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/renter/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), priority }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to submit request. Please try again.");
        setIsSubmitting(false);
        return;
      }

      setSuccess(true);
      setTitle("");
      setDescription("");
      setPriority("normal");
      setShowForm(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Maintenance</h1>
          <p className="mt-1 text-slate-500">Track and submit maintenance requests for your unit.</p>
        </div>
        {hasActiveLease && !showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setSuccess(false);
            }}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
          >
            <Icon name="plus" className="h-4 w-4" />
            New Request
          </button>
        )}
      </header>

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Your maintenance request was submitted successfully.
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Open Requests</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{activeRequests.length}</p>
          <p className="mt-1 text-sm text-slate-500">
            {activeRequests.some((request) => request.status === "in_progress") ? "In progress" : "Awaiting update"}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Completed</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{completedRequests.length}</p>
          <p className="mt-1 text-sm text-slate-500">All time</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Avg Response Time</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">24h</p>
          <p className="mt-1 text-sm text-slate-500">Very responsive</p>
        </article>
      </section>

      {/* Submit form */}
      {showForm && hasActiveLease && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900">New Maintenance Request</h2>
            <button
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close form"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            {unitLabel && (
              <p className="text-sm text-slate-500">
                Submitting for: <span className="font-medium text-slate-700">{unitLabel}</span>
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="title" className="block text-sm font-medium text-slate-700">
                Issue Title <span className="text-rose-500">*</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Leaking faucet in bathroom"
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="description" className="block text-sm font-medium text-slate-700">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in detail..."
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="priority" className="block text-sm font-medium text-slate-700">
                Priority
              </label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                disabled={isSubmitting}
              >
                <option value="low">Low — Minor inconvenience</option>
                <option value="normal">Normal — Needs attention soon</option>
                <option value="high">High — Urgent repair needed</option>
                <option value="emergency">Emergency — Safety hazard</option>
              </select>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {!hasActiveLease && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          You need an active lease to submit maintenance requests. Contact your property manager.
        </div>
      )}

      {/* Request list */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">
            Your Requests{" "}
            {requests.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {requests.length}
              </span>
            )}
          </h2>
        </div>
        <div className="border-b border-slate-100 px-5 py-4">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-medium text-slate-500">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={[
              "rounded-lg px-4 py-2 transition-colors",
              activeTab === "active"
                ? "bg-sky-600 text-white shadow-lg shadow-sky-950/20"
                : "hover:text-slate-700",
            ].join(" ")}
          >
            Active Requests
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("completed")}
            className={[
              "rounded-lg px-4 py-2 transition-colors",
              activeTab === "completed"
                ? "bg-sky-600 text-white shadow-lg shadow-sky-950/20"
                : "hover:text-slate-700",
            ].join(" ")}
          >
            Completed
          </button>
          </div>
        </div>
        {visibleRequests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <Icon name="wrench" className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500">
              {activeTab === "active" ? "No active maintenance requests." : "No completed requests yet."}
            </p>
            {hasActiveLease && activeTab === "active" && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-1 text-sm font-medium text-sky-600 hover:text-sky-700"
              >
                Submit your first request
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleRequests.map((req) => (
              <article key={req.id} className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900">{req.title}</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {req.units.properties.name} · Unit {req.units.unit_number} · Submitted {formatDate(req.created_at)}
                    </p>
                    {req.description && (
                      <p className="mt-2 text-sm text-slate-600">{req.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                    <span
                      className={[
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        statusColors[req.status] ?? "bg-slate-100 text-slate-600",
                      ].join(" ")}
                    >
                      {statusLabels[req.status] ?? req.status}
                    </span>
                    <span
                      className={[
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                        priorityColors[req.priority] ?? "bg-slate-100 text-slate-600 border-slate-200",
                      ].join(" ")}
                    >
                      {req.priority}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                  {req.scheduled_date && (
                    <span>Scheduled: {formatDate(req.scheduled_date)}</span>
                  )}
                  {req.resolved_at && (
                    <span>Resolved: {formatDate(req.resolved_at)}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
