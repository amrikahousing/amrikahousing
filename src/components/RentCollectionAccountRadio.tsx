"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRentCollectionAccountSelection } from "./RentCollectionAccountSelectionProvider";
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
  const selection = useRentCollectionAccountSelection();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localChecked, setLocalChecked] = useState(checked);
  const optimisticChecked = selection
    ? selection.selectedAccountId === connectedAccountId
    : localChecked;

  useEffect(() => {
    if (!selection && !isSubmitting) {
      setLocalChecked(checked);
    }
  }, [checked, isSubmitting, selection]);

  function setOptimisticSelection(accountId: string | null) {
    if (selection) {
      selection.setSelectedAccountId(accountId);
      return;
    }

    setLocalChecked(accountId === connectedAccountId);
  }

  function resetOptimisticSelection() {
    if (selection) {
      selection.resetSelectedAccountId();
      return;
    }

    setLocalChecked(checked);
  }

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
    setOptimisticSelection(nextChecked ? connectedAccountId : null);

    try {
      const response = await fetch("/api/accounts/rent-collection-account", {
        method: nextChecked ? "POST" : "DELETE",
        headers: nextChecked ? { "Content-Type": "application/json" } : undefined,
        body: nextChecked ? JSON.stringify({ connectedAccountId }) : undefined,
      });

      if (!response.ok) {
        resetOptimisticSelection();
        toast.error(await readErrorMessage(response), { title: "Rent Collection" });
        return;
      }

      const data = (await response.json().catch(() => null)) as {
        needsOnboarding?: boolean;
      } | null;

      toast.success(
        nextChecked && data?.needsOnboarding
          ? "This account is set for rent collection. Complete Stripe verification from the banner when you're ready."
          : nextChecked
            ? "This account is now set to collect rent."
            : "Rent collection was turned off for this account.",
        { title: "Rent Collection" },
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (requestError) {
      resetOptimisticSelection();
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
          className={`ui-switch ${
            optimisticChecked
              ? "ui-switch-on"
              : disabled
                ? "ui-switch-disabled"
                : ""
          }`}
        />
      </label>
      <p className="text-[11px] text-slate-500 sm:text-xs">
        {isSubmitting ? "Connecting..." : optimisticChecked ? "On" : disabled ? "Off" : "Off"}
      </p>
    </div>
  );
}
