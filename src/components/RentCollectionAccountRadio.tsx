"use client";

import { useState } from "react";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange() {
    if (disabled || checked) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/accounts/rent-collection-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectedAccountId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Unable to update the rent collection account.");
        return;
      }

      window.location.reload();
    } catch (requestError) {
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
          type="radio"
          name="rent-collection-account"
          checked={checked}
          disabled={disabled || isSubmitting}
          onChange={handleChange}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={`relative inline-flex h-7 w-12 items-center rounded-full border transition sm:h-8 sm:w-14 ${
            checked
              ? "border-emerald-500 bg-emerald-500"
              : disabled
                ? "border-slate-200 bg-slate-100"
                : "border-slate-300 bg-stone-100"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition sm:h-6 sm:w-6 ${
              checked ? "translate-x-6 sm:translate-x-7" : "translate-x-1"
            }`}
          />
        </span>
      </label>
      <p className="text-[11px] text-slate-500 sm:text-xs">
        {isSubmitting ? "Saving..." : checked ? "On" : disabled ? "Off" : "Off"}
      </p>
      {error ? <p className="max-w-[220px] text-right text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
