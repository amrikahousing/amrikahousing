"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  /** True when the org has a Stripe Connect account but it's not yet verified. */
  needsOnboarding: boolean;
};

export function StripeOnboardingBanner({ needsOnboarding }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const onboardingStatus = searchParams.get("stripe_onboarding");

  // Clean up the query param from the URL after Stripe redirects back
  useEffect(() => {
    if (onboardingStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe_onboarding");
      router.replace(url.pathname + (url.search || ""), { scroll: false });
    }
  }, [onboardingStatus, router]);

  async function handleVerify() {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts/stripe-onboarding", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(data?.error ?? "Could not start verification. Please try again.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      alert("Could not start verification. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Show a success banner when returning from completed onboarding
  if (onboardingStatus === "complete") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <span className="mt-0.5 text-emerald-500">✓</span>
        <div>
          <p className="font-semibold">Verification submitted</p>
          <p className="mt-0.5 text-emerald-700">
            Stripe is reviewing your information. Rent collection will activate automatically once approved — usually within minutes.
          </p>
        </div>
      </div>
    );
  }

  // Show a warning when they came back via the refresh URL (session expired)
  if (onboardingStatus === "refresh") {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="flex items-start gap-3">
          <span className="mt-0.5">⚠</span>
          <div>
            <p className="font-semibold">Verification session expired</p>
            <p className="mt-0.5 text-amber-700">
              Your Stripe verification session timed out. Start a new one to complete setup.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading}
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Restart"}
        </button>
      </div>
    );
  }

  if (!needsOnboarding || dismissed) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0 text-blue-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <div>
          <p className="font-semibold text-blue-900">Identity verification required</p>
          <p className="mt-0.5 text-blue-700">
            Complete Stripe&apos;s verification to activate rent collection and receive payouts to your bank account.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Loading…" : "Verify now →"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-blue-400 hover:text-blue-600"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
