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
  status_change_note: string | null;
  units: {
    unit_number: string;
    properties: { name: string; address: string };
  };
};

type Props = {
  requests: MaintenanceRequest[];
  hasActiveLease: boolean;
  unitLabel: string | null;
};

type ParseResult = {
  ready: boolean;
  question: string;
  priority: string;
  description: string;
  category: string;
};

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-sky-50 text-sky-700",
  high: "bg-amber-50 text-amber-700",
  emergency: "bg-rose-50 text-rose-700",
};

const priorityLabels: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  emergency: "Emergency",
};

const statusColors: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  in_progress: "bg-sky-50 text-sky-700",
  completed: "bg-emerald-50 text-emerald-700",
  rejected: "bg-slate-100 text-slate-500",
  cancelled: "bg-rose-50 text-rose-500",
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
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
  if (name === "wrench") return <svg {...shared}><path d="M14.7 6.3a4 4 0 0 0 5 5L11 20l-4-4 8.7-8.7Z" /><path d="m7 16-3 3 1 1 3-3" /></svg>;
  if (name === "x") return <svg {...shared}><path d="M18 6 6 18M6 6l12 12" /></svg>;
  if (name === "sparkles") return <svg {...shared}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>;
  return null;
}

export function MaintenanceClient({ requests, hasActiveLease, unitLabel }: Props) {
  const router = useRouter();

  const [freeformInput, setFreeformInput] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Pre-filled fallback form
  const [prefilled, setPrefilled] = useState<ParseResult | null>(null);
  const [prefilledCategory, setPrefilledCategory] = useState("general");
  const [prefilledDescription, setPrefilledDescription] = useState("");
  const [prefilledPriority, setPrefilledPriority] = useState("normal");
  const [isPrefilledSubmitting, setIsPrefilledSubmitting] = useState(false);
  const [prefilledError, setPrefilledError] = useState<string | null>(null);

  const CANCEL_REASONS = [
    "Issue resolved on my own",
    "Made a mistake",
    "No longer urgent",
    "Other",
  ] as const;

  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelOther, setCancelOther] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  function openCancelPrompt(id: string) {
    setPendingCancelId(id);
    setCancelReason(null);
    setCancelOther("");
  }

  async function confirmCancel() {
    if (!pendingCancelId || !cancelReason) return;
    const note =
      cancelReason === "Other"
        ? cancelOther.trim() || "Other"
        : cancelReason;
    setIsClosing(true);
    try {
      const res = await fetch(`/api/renter/maintenance/${pendingCancelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error ?? "Could not cancel the request.");
        return;
      }
      setPendingCancelId(null);
      router.refresh();
    } finally {
      setIsClosing(false);
    }
  }

  const busy = isParsing || isSubmitting;

  function resetLeft() {
    setFreeformInput("");
    setError(null);
    setPrefilled(null);
    setPrefilledError(null);
    setPrefilledCategory("general");
    setPrefilledDescription("");
    setPrefilledPriority("normal");
  }

  async function callParse(input: string): Promise<ParseResult> {
    const res = await fetch("/api/renter/maintenance/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not understand the description.");
    }
    return res.json() as Promise<ParseResult>;
  }

  async function submitFields(fields: { category: string; description: string; priority: string }) {
    const res = await fetch("/api/renter/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Failed to submit request.");
    }
  }

  async function handleSubmit() {
    if (!freeformInput.trim()) return;
    setError(null);
    setIsParsing(true);
    try {
      const result = await callParse(freeformInput);
      if (!result.ready) {
        setPrefilled(result);
        setPrefilledCategory(result.category || "general");
        setPrefilledDescription(result.description);
        setPrefilledPriority(result.priority);
        return;
      }
      setIsSubmitting(true);
      await submitFields({ category: result.category, description: result.description, priority: result.priority });
      setSuccess(true);
      resetLeft();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsParsing(false);
      setIsSubmitting(false);
    }
  }


  async function handlePrefilledSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPrefilledError(null);
    setIsPrefilledSubmitting(true);
    try {
      await submitFields({ category: prefilledCategory, description: prefilledDescription, priority: prefilledPriority });
      setSuccess(true);
      resetLeft();
      router.refresh();
    } catch (err) {
      setPrefilledError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsPrefilledSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {pendingCancelId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Why are you cancelling?</h2>
            <p className="mb-4 text-sm text-slate-500">Your property team will see this reason.</p>
            <div className="flex flex-col gap-2">
              {CANCEL_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={isClosing}
                  onClick={() => setCancelReason(reason)}
                  className={`rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-60 ${
                    cancelReason === reason
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            {cancelReason === "Other" && (
              <textarea
                autoFocus
                value={cancelOther}
                onChange={(e) => setCancelOther(e.target.value)}
                placeholder="Briefly describe your reason…"
                rows={2}
                disabled={isClosing}
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60"
              />
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingCancelId(null)}
                disabled={isClosing}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Keep request
              </button>
              <button
                type="button"
                onClick={() => void confirmCancel()}
                disabled={!cancelReason || isClosing}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isClosing ? "Cancelling…" : "Confirm cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Maintenance</h1>
        <p className="mt-1 text-slate-500">Submit a request and track updates from your property team.</p>
      </header>

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Your maintenance request was submitted successfully.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left — Submit Request */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm self-start">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-900">Submit Request</h2>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Property label */}
            {unitLabel && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Property</p>
                <p className="mt-1 text-sm text-slate-700">{unitLabel}</p>
              </div>
            )}

            {!hasActiveLease ? (
              <p className="text-sm text-slate-500">
                You need an active lease to submit maintenance requests. Contact your property manager.
              </p>
            ) : prefilled ? (
              /* Prefilled fallback form */
              <form onSubmit={(e) => void handlePrefilledSubmit(e)} className="space-y-4">
                <p className="text-xs text-amber-700 font-medium">
                  We filled in what we could — review and complete before submitting.
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="pf-category" className="block text-sm font-medium text-slate-700">
                    Category
                  </label>
                  <select
                    id="pf-category"
                    value={prefilledCategory}
                    onChange={(e) => setPrefilledCategory(e.target.value)}
                    disabled={isPrefilledSubmitting}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="hvac">HVAC</option>
                    <option value="appliance">Appliance</option>
                    <option value="pest">Pest</option>
                    <option value="security">Security</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="pf-description" className="block text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    id="pf-description"
                    value={prefilledDescription}
                    onChange={(e) => setPrefilledDescription(e.target.value)}
                    rows={4}
                    disabled={isPrefilledSubmitting}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="pf-priority" className="block text-sm font-medium text-slate-700">
                    Priority
                  </label>
                  <select
                    id="pf-priority"
                    value={prefilledPriority}
                    onChange={(e) => setPrefilledPriority(e.target.value)}
                    disabled={isPrefilledSubmitting}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  >
                    <option value="low">Low — Minor inconvenience</option>
                    <option value="normal">Normal — Needs attention soon</option>
                    <option value="high">High — Urgent repair needed</option>
                    <option value="emergency">Emergency — Safety hazard</option>
                  </select>
                </div>
                {prefilledError && (
                  <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {prefilledError}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={isPrefilledSubmitting}
                    className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPrefilledSubmitting ? "Submitting…" : "Submit Request"}
                  </button>
                  <button
                    type="button"
                    onClick={resetLeft}
                    disabled={isPrefilledSubmitting}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    Start over
                  </button>
                </div>
              </form>
            ) : (
              /* AI freeform input */
              <div className="space-y-4">
                <textarea
                  value={freeformInput}
                  onChange={(e) => { setFreeformInput(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleSubmit(); }}
                  placeholder={`e.g. "my heat doesn't work and it's cold" or "the bathroom faucet is dripping"`}
                  rows={5}
                  disabled={busy}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60 resize-none"
                />
                {error && (
                  <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!freeformInput.trim() || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {isParsing ? "Reviewing…" : "Submitting…"}
                    </>
                  ) : (
                    "Submit Request"
                  )}
                </button>
                <p className="text-xs text-slate-400 text-center">⌘↵ to submit</p>
              </div>
            )}
          </div>
        </div>

        {/* Right — Request Timeline */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-900">Request Timeline</h2>
          </div>

          {requests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Icon name="wrench" className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">No maintenance requests yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((req) => (
                <article key={req.id} className="px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    {req.units.properties.address}
                  </p>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-semibold text-slate-900 leading-snug">{req.title}</h3>
                    <div className="flex shrink-0 gap-1.5">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[req.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {statusLabels[req.status] ?? req.status}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${priorityColors[req.priority] ?? "bg-slate-100 text-slate-600"}`}>
                        {priorityLabels[req.priority] ?? req.priority}
                      </span>
                    </div>
                  </div>
                  {req.description && (
                    <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">{req.description}</p>
                  )}
                  {req.status_change_note && (
                    <p className="mt-2 text-xs text-slate-400 italic">{req.status_change_note}</p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500">
                    <div>
                      <p className="font-semibold uppercase tracking-wider text-slate-400">Submitted</p>
                      <p className="mt-0.5">{formatDate(req.created_at)}</p>
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-wider text-slate-400">Current Status</p>
                      <p className="mt-0.5">{statusLabels[req.status] ?? req.status}</p>
                    </div>
                    {req.scheduled_date && (
                      <div>
                        <p className="font-semibold uppercase tracking-wider text-slate-400">Scheduled</p>
                        <p className="mt-0.5">{formatDate(req.scheduled_date)}</p>
                      </div>
                    )}
                    {req.resolved_at && (
                      <div>
                        <p className="font-semibold uppercase tracking-wider text-slate-400">Resolved</p>
                        <p className="mt-0.5">{formatDate(req.resolved_at)}</p>
                      </div>
                    )}
                  </div>
                  {(req.status === "open" || req.status === "in_progress") && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => openCancelPrompt(req.id)}
                        className="text-xs font-medium text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        Cancel request
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
