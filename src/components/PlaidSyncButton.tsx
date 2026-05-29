"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SyncStatus = "idle" | "syncing" | "done" | "error";

let plaidScriptPromise: Promise<void> | null = null;

function loadPlaidScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Plaid) return Promise.resolve();
  if (plaidScriptPromise) return plaidScriptPromise;

  plaidScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"]',
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Plaid Link failed to load.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid Link failed to load."));
    document.body.appendChild(script);
  });

  return plaidScriptPromise;
}

export function PlaidSyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    void loadPlaidScript();
  }, []);

  async function openAuthUpdateIfNeeded() {
    await loadPlaidScript();
    if (!window.Plaid) {
      return false;
    }

    const tokenResponse = await fetch("/api/plaid/link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "update_auth" }),
    });
    const tokenData = (await tokenResponse.json()) as {
      linkToken?: string;
      updateRequired?: boolean;
      item?: { institutionName?: string | null };
      error?: string;
    };

    if (!tokenResponse.ok) {
      throw new Error(tokenData.error ?? "Could not start Plaid update mode.");
    }

    if (tokenData.updateRequired === false || !tokenData.linkToken) {
      return false;
    }

    const institutionLabel = tokenData.item?.institutionName
      ? ` for ${tokenData.item.institutionName}`
      : "";

    const handler = window.Plaid.create({
      token: tokenData.linkToken,
      onSuccess: async () => {
        setSummary(`Permissions updated${institutionLabel}`);
        setStatus("done");
        await fetch("/api/plaid/transactions", { method: "POST" }).catch(() => null);
        router.refresh();
      },
      onExit: (plaidError) => {
        if (plaidError) {
          setSummary("Plaid update was closed before permissions were updated.");
          setStatus("error");
        }
      },
    });

    setSummary(`Update permissions${institutionLabel}`);
    handler.open();
    return true;
  }

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
      const openedUpdate = await openAuthUpdateIfNeeded();
      if (openedUpdate) {
        return;
      }

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
