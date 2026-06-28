"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type SavedPaymentMethod = {
  id: string;
  paymentProvider: "stripe" | "plaid";
  stripePaymentMethodId: string | null;
  paymentType: "card" | "us_bank_account";
  brand: string | null;
  bankName: string | null;
  bankAccountType: string | null;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  billingName: string | null;
  plaidLinkSessionId: string | null;
  isDefault: boolean;
  isActive: boolean;
};

type Props = {
  autopayEnabled: boolean;
  defaultPaymentMethodId: string | null;
  savedPaymentMethods: SavedPaymentMethod[];
  stripePublishableKey: string | null;
};

type FeedbackTone = "error" | "success";
type FeedbackScope = "methods" | "autopay";
type StripeMethodType = "card" | "us_bank_account";

let stripePromise: Promise<Stripe | null> | null = null;

function getStripePromise(publishableKey: string) {
  stripePromise ??= loadStripe(publishableKey);
  return stripePromise;
}

function formatCardBrand(brand: string) {
  return brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card";
}

function formatExpiry(month: number | null, year: number | null) {
  if (!month || !year) return null;
  return `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function formatMethodLabel(method: SavedPaymentMethod) {
  if (method.paymentType === "us_bank_account") {
    return `${method.bankName ?? "Bank account"} ending in ${method.last4}`;
  }

  return `${formatCardBrand(method.brand ?? "Card")} ending in ${method.last4}`;
}

function formatMethodMeta(method: SavedPaymentMethod) {
  if (method.paymentType === "us_bank_account") {
    return [
      method.bankAccountType ? method.bankAccountType.replace(/_/g, " ") : null,
      method.billingName,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return [
    formatExpiry(method.expMonth, method.expYear)
      ? `Expires ${formatExpiry(method.expMonth, method.expYear)}`
      : null,
    method.billingName,
  ]
    .filter(Boolean)
    .join(" · ");
}

function resolveDefaultPaymentMethodId(
  methods: SavedPaymentMethod[],
  defaultPaymentMethodId: string | null,
) {
  const stripeMethods = methods.filter((method) => method.paymentProvider === "stripe");

  return (
    stripeMethods.find((method) => method.id === defaultPaymentMethodId)?.id ??
    stripeMethods.find((method) => method.isDefault)?.id ??
    stripeMethods[0]?.id ??
    null
  );
}

function FeedbackMessage({
  message,
  tone,
}: {
  message: string;
  tone: FeedbackTone;
}) {
  return (
    <div
      className={[
        "rounded-lg border px-4 py-3 text-sm",
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

function StripeSetupForm({
  methodType,
  onCancel,
  onError,
  onSuccess,
}: {
  methodType: StripeMethodType;
  onCancel: () => void;
  onError: (message: string) => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    const result = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });

    if (result.error) {
      onError(result.error.message ?? "Unable to save this payment method.");
      setIsSubmitting(false);
      return;
    }

    if (result.setupIntent?.id) {
      const response = await fetch("/api/renter/payments/setup-intent/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId: result.setupIntent.id }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        onError(payload?.error ?? "The method was saved, but the app could not record it.");
        setIsSubmitting(false);
        return;
      }
    }

    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <PaymentElement options={{ layout: "tabs", wallets: { link: "never" } }} />
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || !elements || isSubmitting}
          className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSubmitting
            ? "Saving..."
            : methodType === "us_bank_account"
              ? "Save ACH Account"
              : "Save Card"}
        </button>
      </div>
    </form>
  );
}

export function PaymentMethodsClient({
  autopayEnabled: initialAutopayEnabled,
  defaultPaymentMethodId,
  savedPaymentMethods,
  stripePublishableKey,
}: Props) {
  const router = useRouter();
  const [autopayEnabled, setAutopayEnabled] = useState(initialAutopayEnabled);
  const [effectiveDefaultMethodId, setEffectiveDefaultMethodId] = useState<string | null>(() =>
    resolveDefaultPaymentMethodId(savedPaymentMethods, defaultPaymentMethodId),
  );
  const [localDefaultOverrideId, setLocalDefaultOverrideId] = useState<string | null>(null);
  const [stripeSetup, setStripeSetup] = useState<{
    clientSecret: string;
    methodType: StripeMethodType;
  } | null>(null);
  const [isPreparingStripeSetup, setIsPreparingStripeSetup] = useState<StripeMethodType | null>(null);
  const [isSavingDefault, setIsSavingDefault] = useState<string | null>(null);
  const [isSavingAutopay, setIsSavingAutopay] = useState(false);
  const [isRemovingMethod, setIsRemovingMethod] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    scope: FeedbackScope;
    tone: FeedbackTone;
  } | null>(null);

  const stripeMethods = useMemo(
    () => savedPaymentMethods.filter((method) => method.paymentProvider === "stripe"),
    [savedPaymentMethods],
  );
  const effectiveDefaultMethod =
    stripeMethods.find((method) => method.id === effectiveDefaultMethodId) ?? null;
  const canUseStripe = Boolean(stripePublishableKey);

  useEffect(() => {
    setAutopayEnabled(initialAutopayEnabled);
  }, [initialAutopayEnabled]);

  useEffect(() => {
    if (localDefaultOverrideId && stripeMethods.some((method) => method.id === localDefaultOverrideId)) {
      setEffectiveDefaultMethodId(localDefaultOverrideId);

      if (defaultPaymentMethodId === localDefaultOverrideId) {
        setLocalDefaultOverrideId(null);
      }

      return;
    }

    setEffectiveDefaultMethodId(resolveDefaultPaymentMethodId(stripeMethods, defaultPaymentMethodId));
  }, [defaultPaymentMethodId, localDefaultOverrideId, stripeMethods]);

  function clearFeedback(scope?: FeedbackScope) {
    setFeedback((current) => (!current || !scope || current.scope === scope ? null : current));
  }

  function setScopedFeedback(scope: FeedbackScope, tone: FeedbackTone, message: string) {
    setFeedback({ scope, tone, message });
  }

  async function handleAddStripeMethod(methodType: StripeMethodType) {
    clearFeedback("methods");

    if (!stripePublishableKey) {
      setScopedFeedback("methods", "error", "Online payments are not configured yet for this environment.");
      return;
    }

    setIsPreparingStripeSetup(methodType);

    try {
      const response = await fetch("/api/renter/payments/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodType: methodType }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { clientSecret?: string; error?: string }
        | null;

      if (!response.ok || !payload?.clientSecret) {
        throw new Error(payload?.error ?? "Unable to prepare payment setup.");
      }

      setStripeSetup({ clientSecret: payload.clientSecret, methodType });
    } catch (error) {
      setScopedFeedback(
        "methods",
        "error",
        error instanceof Error ? error.message : "Unable to prepare payment setup.",
      );
    } finally {
      setIsPreparingStripeSetup(null);
    }
  }

  async function handleMakeDefault(methodId: string) {
    clearFeedback("methods");
    const previousDefaultMethodId = effectiveDefaultMethodId;
    const previousLocalDefaultOverrideId = localDefaultOverrideId;
    setLocalDefaultOverrideId(methodId);
    setEffectiveDefaultMethodId(methodId);
    setIsSavingDefault(methodId);

    const response = await fetch("/api/renter/payments/default-method", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethodId: methodId }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    setIsSavingDefault(null);

    if (!response.ok) {
      setLocalDefaultOverrideId(previousLocalDefaultOverrideId);
      setEffectiveDefaultMethodId(previousDefaultMethodId);
      setScopedFeedback("methods", "error", payload?.error ?? "Unable to update the default payment method.");
      return;
    }

    setScopedFeedback("methods", "success", "Default payment method updated.");
  }

  async function handleRemoveMethod(methodId: string) {
    clearFeedback("methods");
    setIsRemovingMethod(methodId);

    const response = await fetch(`/api/renter/payments/methods/${methodId}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    setIsRemovingMethod(null);

    if (!response.ok) {
      setScopedFeedback("methods", "error", payload?.error ?? "Unable to remove this payment method.");
      return;
    }

    setScopedFeedback("methods", "success", "Payment method removed.");
    router.refresh();
  }

  async function handleToggleAutopay(enabled: boolean) {
    clearFeedback("autopay");

    if (enabled && !effectiveDefaultMethodId) {
      setScopedFeedback("autopay", "error", "Make an online payment method the default before enabling auto-pay.");
      return;
    }

    const previousAutopayState = autopayEnabled;
    setAutopayEnabled(enabled);
    setIsSavingAutopay(true);

    const response = await fetch("/api/renter/payments/autopay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        defaultPaymentMethodId: effectiveDefaultMethodId,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    setIsSavingAutopay(false);

    if (!response.ok) {
      setAutopayEnabled(previousAutopayState);
      setScopedFeedback("autopay", "error", payload?.error ?? "Unable to update auto-pay.");
      return;
    }

    setScopedFeedback("autopay", "success", enabled ? "Auto-pay enabled." : "Auto-pay disabled.");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payment Methods</h1>
          <p className="mt-1 text-slate-500">Manage saved cards, ACH accounts, default payment, and auto-pay.</p>
        </div>
        <Link
          href="/renter/payments"
          className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Back to payments
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Saved Methods</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{stripeMethods.length}</p>
          <p className="mt-1 text-sm text-slate-500">Online payment methods on file</p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Default Method</p>
          <p className="mt-3 text-xl font-bold text-slate-900">
            {effectiveDefaultMethod ? formatMethodLabel(effectiveDefaultMethod) : "No default"}
          </p>
          <p className="mt-1 text-sm text-slate-500">Used for quick payments and auto-pay</p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Auto-Pay</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{autopayEnabled ? "Active" : "Inactive"}</p>
          <p className="mt-1 text-sm text-slate-500">
            {effectiveDefaultMethodId ? "Uses your default method" : "Requires a default method"}
          </p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Saved Payment Methods</h2>
            <p className="mt-1 text-sm text-slate-500">
              Save cards and ACH bank accounts for online rent payments.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleAddStripeMethod("card")}
              disabled={isPreparingStripeSetup !== null || !canUseStripe}
              className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPreparingStripeSetup === "card" ? "Preparing..." : "Add Card"}
            </button>
            <button
              type="button"
              onClick={() => void handleAddStripeMethod("us_bank_account")}
              disabled={isPreparingStripeSetup !== null || !canUseStripe}
              className="rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPreparingStripeSetup === "us_bank_account" ? "Preparing..." : "Add ACH"}
            </button>
          </div>
        </div>

        {!canUseStripe ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Add payment processor keys to enable online payment methods.
          </div>
        ) : null}

        {stripeSetup && stripePublishableKey ? (
          <Elements
            key={stripeSetup.clientSecret}
            stripe={getStripePromise(stripePublishableKey)}
            options={{ clientSecret: stripeSetup.clientSecret }}
          >
            <StripeSetupForm
              methodType={stripeSetup.methodType}
              onCancel={() => setStripeSetup(null)}
              onError={(message) => setScopedFeedback("methods", "error", message)}
              onSuccess={() => {
                setStripeSetup(null);
                setScopedFeedback(
                  "methods",
                  "success",
                  stripeSetup.methodType === "us_bank_account" ? "ACH bank account saved." : "Card saved.",
                );
                router.refresh();
              }}
            />
          </Elements>
        ) : null}

        {feedback?.scope === "methods" ? (
          <div className="mt-5">
            <FeedbackMessage message={feedback.message} tone={feedback.tone} />
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {stripeMethods.length === 0 ? (
            <p className="text-sm text-slate-500">No saved payment methods yet.</p>
          ) : (
            stripeMethods.map((method) => {
              const isDefault = method.id === effectiveDefaultMethodId;
              const isSavingThisDefault = isSavingDefault === method.id;

              return (
                <div
                  key={method.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4"
                >
                  <div>
                    <p className="font-medium text-slate-900">{formatMethodLabel(method)}</p>
                    <p className="text-sm text-slate-500">
                      {method.paymentType === "us_bank_account"
                        ? `ACH${formatMethodMeta(method) ? ` · ${formatMethodMeta(method)}` : ""}`
                        : formatMethodMeta(method)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">
                      Online
                    </span>
                    <label
                      className={[
                        "inline-flex min-w-[154px] items-center justify-between gap-3 rounded-full border px-3 py-2 text-sm font-semibold transition-colors",
                        isDefault
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                        isSavingDefault ? "cursor-wait opacity-75" : "cursor-pointer",
                      ].join(" ")}
                    >
                      <span>{isSavingThisDefault ? "Saving..." : isDefault ? "Default method" : "Make default"}</span>
                      <input
                        type="checkbox"
                        aria-label={`${isDefault ? "Default payment method" : "Make default payment method"}: ${formatMethodLabel(method)}`}
                        checked={isDefault}
                        disabled={isSavingDefault !== null}
                        onChange={(event) => {
                          if (event.target.checked && !isDefault) {
                            void handleMakeDefault(method.id);
                          }
                        }}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={[
                          "ui-switch",
                          isDefault ? "ui-switch-on" : "",
                          isSavingDefault ? "opacity-70" : "",
                        ].join(" ")}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveMethod(method.id)}
                      disabled={isRemovingMethod === method.id}
                      className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {isRemovingMethod === method.id ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Auto-Pay Settings</h2>
            <p className="mt-1 text-sm text-slate-500">
              Automatically charge your default online payment method for new rent charges.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleAutopay(!autopayEnabled)}
            disabled={isSavingAutopay || !effectiveDefaultMethodId}
            className={[
              "ui-switch mt-1",
              autopayEnabled ? "ui-switch-on" : "",
              isSavingAutopay || !effectiveDefaultMethodId
                ? "cursor-not-allowed opacity-70"
                : "hover:ring-4 hover:ring-emerald-100",
            ].join(" ")}
            aria-pressed={autopayEnabled}
            aria-label={autopayEnabled ? "Disable auto-pay" : "Enable auto-pay"}
          />
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="font-medium text-slate-900">
            {isSavingAutopay ? "Saving auto-pay..." : autopayEnabled ? "Auto-pay is enabled" : "Enable Auto-Pay"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {effectiveDefaultMethodId
              ? "Future eligible rent charges will use your default online payment method. Processing fees still apply."
              : "Set a default online payment method before enabling auto-pay."}
          </p>
        </div>

        {feedback?.scope === "autopay" ? (
          <div className="mt-4">
            <FeedbackMessage message={feedback.message} tone={feedback.tone} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
