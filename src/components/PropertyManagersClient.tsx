"use client";

import { useState } from "react";

type EmailRow = {
  id: string;
  value: string;
};

function createEmailRow(value = ""): EmailRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    value,
  };
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" />
    </svg>
  );
}

export function PropertyManagersClient({ canInvite }: { canInvite: boolean }) {
  const [emailRows, setEmailRows] = useState<EmailRow[]>(() => [createEmailRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function updateEmail(index: number, value: string) {
    setError(null);
    setNotice(null);
    setEmailRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, value } : row)),
    );
  }

  function addEmail() {
    setError(null);
    setNotice(null);
    setEmailRows((prev) => [...prev, createEmailRow()]);
  }

  function removeEmail(index: number) {
    setError(null);
    setNotice(null);
    setEmailRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function sendInvites(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const normalizedEmails = emailRows
      .map((row) => row.value.trim())
      .filter(Boolean);
    if (!normalizedEmails.length) {
      setError("Enter at least one property manager email.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/property-managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: normalizedEmails }),
      });
      const data = (await response.json()) as {
        error?: string;
        invited?: string[];
        failed?: string[];
      };

      if (!response.ok && response.status !== 207) {
        setError(data.error ?? "Could not send invites.");
        return;
      }

      if (data.failed?.length) {
        setError(data.error ?? "Some invites could not be sent.");
        setEmailRows(data.failed.map((email) => createEmailRow(email)));
        return;
      }

      setNotice(`Invites sent to ${data.invited?.join(", ") ?? "your team"}.`);
      setEmailRows([createEmailRow()]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canInvite) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Only organization admins can add property managers.
      </div>
    );
  }

  return (
    <form
      onSubmit={sendInvites}
      className="max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Add property managers</h2>
        <p className="mt-1 text-sm text-slate-500">
          Invite teammates who should help manage properties, units, and maintenance.
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {emailRows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <input
              type="email"
              value={row.value}
              onChange={(event) => updateEmail(index, event.target.value)}
              placeholder="manager@company.com"
              className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            {emailRows.length > 1 ? (
              <button
                type="button"
                onClick={() => removeEmail(index)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-red-200 hover:text-red-600"
                aria-label="Remove email"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addEmail}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-emerald-700"
      >
        <PlusIcon className="h-4 w-4" />
        Add another
      </button>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Sending invites..." : "Send invites"}
      </button>
    </form>
  );
}
