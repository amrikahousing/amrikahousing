"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SyncStatus = "idle" | "syncing" | "done" | "error";

export function PlaidSyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [summary, setSummary] = useState<string | null>(null);

  async function handleSync() {
    setStatus("syncing");
    setSummary(null);

    try {
      const response = await fetch("/api/plaid/transactions", { method: "POST" });
      const result = (await response.json()) as {
        synced?: number;
        added?: number;
        modified?: number;
        removed?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Sync failed.");
      }

      const parts: string[] = [];
      if ((result.added ?? 0) > 0) parts.push(`${result.added} added`);
      if ((result.modified ?? 0) > 0) parts.push(`${result.modified} updated`);
      if ((result.removed ?? 0) > 0) parts.push(`${result.removed} removed`);
      setSummary(parts.length > 0 ? parts.join(", ") : "Already up to date");
      setStatus("done");
      router.refresh();
    } catch (error) {
      setSummary(error instanceof Error ? error.message : "Sync failed.");
      setStatus("error");
    }
  }

  return (
    <div className="relative flex flex-col items-end">
      <button
        type="button"
        onClick={handleSync}
        disabled={status === "syncing"}
        aria-label={status === "syncing" ? "Syncing accounts" : "Sync connected accounts"}
        title={status === "syncing" ? "Syncing accounts" : "Sync connected accounts"}
        className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-300 bg-white text-slate-700 shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 sm:h-14 sm:w-14"
      >
        <svg
          className={`h-4 w-4 shrink-0 sm:h-5 sm:w-5 ${status === "syncing" ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
        <span className="sr-only">
          {status === "syncing" ? "Syncing accounts" : "Sync connected accounts"}
        </span>
      </button>
      {summary ? (
        <p
          className={`absolute right-0 top-full mt-1 whitespace-nowrap text-xs ${
            status === "error" ? "text-red-600" : "text-slate-500"
          }`}
        >
          {summary}
        </p>
      ) : null}
    </div>
  );
}
