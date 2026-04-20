"use client";

import { useEffect, useState } from "react";

type PlaidInstitution = {
  institution_id?: string | null;
  name?: string | null;
};

type PlaidSuccessMetadata = {
  institution?: PlaidInstitution | null;
};

type PlaidHandler = {
  open: () => void;
  destroy: () => void;
};

type PlaidFactory = {
  create: (options: {
    token: string;
    onSuccess: (publicToken: string, metadata: PlaidSuccessMetadata) => void;
    onExit?: (error: unknown) => void;
  }) => PlaidHandler;
};

declare global {
  interface Window {
    Plaid?: PlaidFactory;
  }
}

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

export function PlaidLinkButton() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPlaidScript().catch(() => {
      setError("Plaid Link could not be loaded.");
    });
  }, []);

  async function connectAccount() {
    setIsConnecting(true);
    setMessage(null);
    setError(null);

    try {
      await loadPlaidScript();
      if (!window.Plaid) {
        setError("Plaid Link is unavailable.");
        return;
      }

      const tokenResponse = await fetch("/api/plaid/link-token", {
        method: "POST",
      });
      const tokenData = (await tokenResponse.json()) as {
        linkToken?: string;
        error?: string;
      };

      if (!tokenResponse.ok || !tokenData.linkToken) {
        setError(tokenData.error ?? "Could not start Plaid Link.");
        return;
      }

      const handler = window.Plaid.create({
        token: tokenData.linkToken,
        onSuccess: async (publicToken, metadata) => {
          setMessage("Finishing secure connection...");
          const exchangeResponse = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ publicToken, metadata }),
          });
          const exchangeData = (await exchangeResponse.json()) as {
            item?: { institutionName?: string | null };
            error?: string;
          };

          if (!exchangeResponse.ok) {
            setError(exchangeData.error ?? "Could not save the Plaid connection.");
            setMessage(null);
            return;
          }

          setMessage(
            exchangeData.item?.institutionName
              ? `${exchangeData.item.institutionName} connected.`
              : "Bank account connected.",
          );
          window.location.reload();
        },
        onExit: (plaidError) => {
          if (plaidError) {
            setError("Plaid Link was closed before the account connected.");
          }
        },
      });

      handler.open();
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Could not connect Plaid.",
      );
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={connectAccount}
        disabled={isConnecting}
        className="flex w-full items-center justify-center rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isConnecting ? "Opening Plaid..." : "+ Add New Account (Plaid Integration)"}
      </button>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
