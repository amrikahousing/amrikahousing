"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RemoveStatus = "idle" | "confirming" | "submitting" | "success" | "error";
type DisconnectMode = "disconnect" | "disconnect_hide" | "disconnect_delete";

export function PlaidRemoveButton({ plaidItemId }: { plaidItemId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<RemoveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRemove(mode: DisconnectMode) {
    setStatus("submitting");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/plaid/items/${plaidItemId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to remove account.");
      }

      setStatus("success");
      if (mode === "disconnect_delete") {
        setMessage("Deleted");
      } else if (mode === "disconnect_hide") {
        setMessage("Disconnected + hidden");
      } else {
        setMessage("Disconnected");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove account.");
      setStatus("error");
    }
  }

  if (status === "confirming") {
    return (
      <div className="relative flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Close disconnect menu"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        <div className="absolute right-0 top-8 z-20 w-[300px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <p className="text-xs font-semibold text-slate-700">Disconnect account</p>
          <p className="mt-1 text-xs text-slate-500">
            We will keep your past transactions unless you choose to delete them.
          </p>
          <div className="mt-2 space-y-2">
            <button
              type="button"
              onClick={() => handleRemove("disconnect")}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Disconnect only (keep history)
            </button>
            <button
              type="button"
              onClick={() => handleRemove("disconnect_hide")}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Disconnect + hide data
            </button>
            <button
              type="button"
              onClick={() => handleRemove("disconnect_delete")}
              className="w-full rounded border border-red-200 bg-red-50 px-2 py-1.5 text-left text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Disconnect + delete all data (irreversible)
            </button>
          </div>
          <div className="mt-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="inline-flex h-7 items-center rounded px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setStatus("confirming")}
        disabled={status === "submitting"}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        title="Disconnect account"
      >
        {status === "submitting" ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        )}
      </button>
      {status === "error" && error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : null}
      {status === "success" && message ? (
        <p className="max-w-[160px] text-right text-xs text-slate-500">
          {message}
        </p>
      ) : null}
    </div>
  );
}
