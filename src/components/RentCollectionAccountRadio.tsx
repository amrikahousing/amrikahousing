"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RentCollectionAccountRadioProps = {
  connectedAccountId: string;
  checked: boolean;
  disabled: boolean;
};

export function RentCollectionAccountRadio({
  connectedAccountId,
  checked,
  disabled,
}: RentCollectionAccountRadioProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAwaitingServerState, setIsAwaitingServerState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticChecked, setOptimisticChecked] = useState(checked);

  useEffect(() => {
    if (checked === optimisticChecked) {
      setIsAwaitingServerState(false);
    }

    if (!isSubmitting && !isAwaitingServerState) {
      setOptimisticChecked(checked);
    }
  }, [checked, isSubmitting, isAwaitingServerState, optimisticChecked]);

  async function handleChange() {
    if (disabled) {
      return;
    }

    const nextChecked = !optimisticChecked;
    setIsSubmitting(true);
    setIsAwaitingServerState(false);
    setError(null);
    setOptimisticChecked(nextChecked);

    try {
      const response = await fetch("/api/accounts/rent-collection-account", {
        method: nextChecked ? "POST" : "DELETE",
        headers: nextChecked ? { "Content-Type": "application/json" } : undefined,
        body: nextChecked ? JSON.stringify({ connectedAccountId }) : undefined,
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setOptimisticChecked(checked);
        setIsAwaitingServerState(false);
        setError(data.error ?? "Unable to update the rent collection account.");
        return;
      }

      setIsAwaitingServerState(true);
      startTransition(() => {
        router.refresh();
      });
    } catch (requestError) {
      setOptimisticChecked(checked);
      setIsAwaitingServerState(false);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update the rent collection account.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-w-[88px] flex-col items-end gap-1">
      <label
        className={`flex items-center gap-2 text-xs sm:text-sm ${
          disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700"
        }`}
      >
        <span>Rent</span>
        <input
          type="checkbox"
          checked={optimisticChecked}
          disabled={disabled || isSubmitting}
          onChange={handleChange}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={`relative inline-flex h-7 w-12 items-center rounded-full border transition sm:h-8 sm:w-14 ${
            optimisticChecked
              ? "border-emerald-500 bg-emerald-500"
              : disabled
                ? "border-slate-200 bg-slate-100"
                : "border-slate-300 bg-stone-100"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition sm:h-6 sm:w-6 ${
              optimisticChecked ? "translate-x-6 sm:translate-x-7" : "translate-x-1"
            }`}
          />
        </span>
      </label>
      <p className="text-[11px] text-slate-500 sm:text-xs">
        {isSubmitting ? "Connecting..." : optimisticChecked ? "On" : disabled ? "Off" : "Off"}
      </p>
      {error ? <p className="max-w-[220px] text-right text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
