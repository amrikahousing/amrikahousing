"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";

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
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAwaitingServerState, setIsAwaitingServerState] = useState(false);
  const [optimisticChecked, setOptimisticChecked] = useState(checked);

  useEffect(() => {
    if (checked === optimisticChecked) {
      setIsAwaitingServerState(false);
    }

    if (!isSubmitting && !isAwaitingServerState) {
      setOptimisticChecked(checked);
    }
  }, [checked, isSubmitting, isAwaitingServerState, optimisticChecked]);

  async function readErrorMessage(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (data?.error?.trim()) {
        return data.error.trim();
      }
    }

    const text = (await response.text().catch(() => "")).trim();
    if (!text) {
      return "Unable to update the rent collection account.";
    }

    // If the server returned HTML, strip tags so we can still show a useful message.
    const plainText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plainText || "Unable to update the rent collection account.";
  }

  async function handleChange() {
    if (disabled) {
      return;
    }

    const nextChecked = !optimisticChecked;
    setIsSubmitting(true);
    setIsAwaitingServerState(false);
    setOptimisticChecked(nextChecked);

    try {
      const response = await fetch("/api/accounts/rent-collection-account", {
        method: nextChecked ? "POST" : "DELETE",
        headers: nextChecked ? { "Content-Type": "application/json" } : undefined,
        body: nextChecked ? JSON.stringify({ connectedAccountId }) : undefined,
      });

      if (!response.ok) {
        setOptimisticChecked(checked);
        setIsAwaitingServerState(false);
        toast.error(await readErrorMessage(response), { title: "Rent Collection" });
        return;
      }

      toast.success(
        nextChecked
          ? "This account is now set to collect rent."
          : "Rent collection was turned off for this account.",
        { title: "Rent Collection" },
      );

      setIsAwaitingServerState(true);
      startTransition(() => {
        router.refresh();
      });
    } catch (requestError) {
      setOptimisticChecked(checked);
      setIsAwaitingServerState(false);
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update the rent collection account.",
        { title: "Rent Collection" },
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-w-[56px] flex-col items-end gap-1 sm:min-w-[88px]">
      <label
        className={`flex items-center gap-2 text-xs sm:text-sm ${
          disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700"
        }`}
      >
        <span className="hidden sm:inline">Rent</span>
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
    </div>
  );
}
