"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "./ToastProvider";

type RemoveStatus = "idle" | "confirming" | "submitting" | "success" | "error";
type DisconnectMode = "disconnect" | "disconnect_hide" | "disconnect_delete";
type DisconnectScope = "account" | "item";

export function PlaidRemoveButton({
  plaidItemId,
  plaidAccountId = null,
  accountName = null,
}: {
  plaidItemId: string;
  plaidAccountId?: string | null;
  accountName?: string | null;
}) {
  const toast = useToast();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [status, setStatus] = useState<RemoveStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (status !== "confirming") return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 300;
      const viewportPadding = 12;
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding,
      );

      setMenuPosition({
        top: rect.bottom + 8,
        left,
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setStatus("idle");
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStatus("idle");
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [status]);

  async function readErrorMessage(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (data?.error?.trim()) {
        return data.error.trim();
      }
    }

    const text = (await response.text().catch(() => "")).trim();
    return text || "Failed to remove account.";
  }

  async function handleRemove(mode: DisconnectMode, scope: DisconnectScope = "item") {
    const scopedPlaidAccountId = scope === "account" ? plaidAccountId : null;
    setStatus("submitting");
    setMessage(
      scope === "account" && mode === "disconnect"
        ? "Disconnecting..."
        : scope === "account"
          ? "Deleting..."
          : mode === "disconnect_delete"
          ? "Deleting..."
          : mode === "disconnect_hide"
            ? "Disconnecting..."
            : "Disconnecting...",
    );

    try {
      const response = await fetch(`/api/plaid/items/${plaidItemId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, plaidAccountId: scopedPlaidAccountId }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      setStatus("idle");
      setMessage(null);
      toast.success(
        scope === "account"
          ? "The connected account was removed."
          : "The bank connection was removed.",
        { title: "Connected Accounts" },
      );
      window.location.reload();
    } catch (err) {
      setStatus("error");
      toast.error(err instanceof Error ? err.message : "Failed to remove account.", {
        title: "Connected Accounts",
      });
    }
  }

  if (status === "confirming") {
    return (
      <div ref={containerRef} className="flex flex-col items-end gap-1">
        <button
          ref={buttonRef}
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
        <div
          className="fixed z-50 w-[300px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <p className="text-xs font-semibold text-slate-700">Disconnect account</p>
          {plaidAccountId ? (
            <p className="mt-1 text-xs text-slate-500">
              {accountName ? `${accountName} will` : "This synced account will"} be handled account-first.
              If it is the only remaining account in this Plaid connection, we will disconnect the whole bank connection automatically.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              We will keep your past transactions unless you choose to delete them.
            </p>
          )}
          <div className="mt-2 space-y-2">
            {plaidAccountId ? (
              <button
                type="button"
                onClick={() => handleRemove("disconnect", "account")}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Disconnect this account
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                handleRemove(
                  plaidAccountId ? "disconnect_delete" : "disconnect_hide",
                  plaidAccountId ? "account" : "item",
                )
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {plaidAccountId
                ? "Disconnect this account and delete its data"
                : "Disconnect + hide data"}
            </button>
            <button
              type="button"
              onClick={() => handleRemove(plaidAccountId ? "disconnect" : "disconnect_delete")}
              className="w-full rounded border border-red-200 bg-red-50 px-2 py-1.5 text-left text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              {plaidAccountId
                ? "Disconnect whole bank connection"
                : "Disconnect + delete all data (irreversible)"}
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
    <div ref={containerRef} className="flex flex-col items-end gap-1">
      <button
        ref={buttonRef}
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
      {status === "submitting" && message ? (
        <p className="max-w-[160px] text-right text-xs text-slate-500">
          {message}
        </p>
      ) : null}
    </div>
  );
}
