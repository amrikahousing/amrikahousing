"use client";

import { useState } from "react";

type PageState = "gate" | "form" | "success";

interface ProvisionResult {
  orgId: string;
  orgName: string;
  invitedEmail: string;
  status: string;
}

function BuildingIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V21" />
      <path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V21" />
      <path d="M8 8h4" />
      <path d="M8 12h4" />
      <path d="M8 16h4" />
      <path d="M3 21h18" />
    </svg>
  );
}

function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function GateForm({
  onUnlock,
}: {
  onUnlock: (token: string) => void;
}) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setChecking(true);

    const res = await fetch("/api/internal/provision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify({ orgName: "_ping_", adminEmail: "ping@ping.com" }),
    });

    setChecking(false);

    if (res.status === 401) {
      setError("Incorrect secret. Check INTERNAL_SECRET and try again.");
      return;
    }

    if (res.status === 503) {
      setError("INTERNAL_SECRET is not configured on this environment.");
      return;
    }

    onUnlock(token);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-300">
          Internal secret
        </label>
        <input
          type="password"
          placeholder="Enter INTERNAL_SECRET"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={checking}
        className="h-10 w-full rounded-lg bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {checking ? "Checking..." : "Unlock"}
      </button>
    </form>
  );
}

function ProvisionForm({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (result: ProvisionResult) => void;
}) {
  const [orgName, setOrgName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [appUrl, setAppUrl] = useState(
    typeof window !== "undefined" ? window.location.origin : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/internal/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": token,
        },
        body: JSON.stringify({ orgName, adminEmail, appUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      onSuccess(data as ProvisionResult);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-300">
          Organization name
        </label>
        <input
          type="text"
          placeholder="Avon Management LLC"
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-300">
          Admin email
        </label>
        <input
          type="email"
          placeholder="admin@avon.com"
          required
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
        <p className="text-xs text-slate-500">
          Clerk will send an invite to this address.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-300">
          App URL <span className="font-normal text-slate-500">(for invite redirect)</span>
        </label>
        <input
          type="url"
          placeholder="https://app.amrikahousing.com"
          required
          value={appUrl}
          onChange={(e) => setAppUrl(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-10 w-full rounded-lg bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Provisioning..." : "Create org & send invite"}
      </button>
    </form>
  );
}

function SuccessPanel({
  result,
  onProvisionAnother,
}: {
  result: ProvisionResult;
  onProvisionAnother: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <CheckCircleIcon className="h-8 w-8 flex-shrink-0 text-emerald-400" />
        <div>
          <p className="font-semibold text-slate-100">Org provisioned</p>
          <p className="text-sm text-slate-400">Invite email sent via Clerk.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 divide-y divide-slate-700/60">
        {(
          [
            ["Organization", result.orgName],
            ["Org ID", result.orgId],
            ["Invited", result.invitedEmail],
            ["Invite status", result.status],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {label}
            </span>
            <span className="font-mono text-sm text-slate-200">{value}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onProvisionAnother}
        className="h-10 w-full rounded-lg border border-slate-600 text-sm text-slate-300 transition hover:border-slate-400 hover:text-slate-100"
      >
        Provision another org
      </button>
    </div>
  );
}

export default function InternalProvisionPage() {
  const [pageState, setPageState] = useState<PageState>("gate");
  const [token, setToken] = useState("");
  const [result, setResult] = useState<ProvisionResult | null>(null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
            <BuildingIcon className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-slate-200">Amrika Housing</span>
          <span className="ml-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-amber-500/30">
            Internal
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-7 shadow-2xl">
          {pageState === "gate" && (
            <>
              <h1 className="mb-1 text-lg font-semibold text-slate-100">
                Provision a new org
              </h1>
              <p className="mb-5 text-sm text-slate-400">
                Enter the internal secret to unlock this tool.
              </p>
              <GateForm
                onUnlock={(t) => {
                  setToken(t);
                  setPageState("form");
                }}
              />
            </>
          )}

          {pageState === "form" && (
            <>
              <h1 className="mb-1 text-lg font-semibold text-slate-100">
                New organization
              </h1>
              <p className="mb-5 text-sm text-slate-400">
                Creates the org in Clerk and emails the admin an invite link.
              </p>
              <ProvisionForm
                token={token}
                onSuccess={(r) => {
                  setResult(r);
                  setPageState("success");
                }}
              />
            </>
          )}

          {pageState === "success" && result && (
            <SuccessPanel
              result={result}
              onProvisionAnother={() => {
                setResult(null);
                setPageState("form");
              }}
            />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          This page is for internal use only. Do not share the URL.
        </p>
      </div>
    </main>
  );
}
