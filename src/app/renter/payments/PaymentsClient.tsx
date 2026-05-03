"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type PaymentRow = {
  id: string;
  amount: number;
  type: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  notes: string | null;
};

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
  currentBalance: number;
  defaultPaymentMethodId: string | null;
  nextDueDate: string | null;
  paymentMethod: string | null;
  payments: PaymentRow[];
  savedPaymentMethods: SavedPaymentMethod[];
  stripePublishableKey: string | null;
  totalPaid: number;
};

type PaymentTab = "overview" | "pay" | "methods";
type FeedbackTone = "error" | "success";
type FeedbackScope = "pay" | "methods";
type StripeMethodType = "card" | "us_bank_account";

let stripePromise: Promise<Stripe | null> | null = null;

function getStripePromise(publishableKey: string) {
  stripePromise ??= loadStripe(publishableKey);
  return stripePromise;
}

const paymentTypeLabels: Record<string, string> = {
  rent: "Rent",
  security_deposit: "Security Deposit",
  late_fee: "Late Fee",
  utility: "Utility",
  other: "Other",
};

const paymentStatusColors: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function estimateProcessingFee(amount: number, paymentType: SavedPaymentMethod["paymentType"]) {
  if (paymentType === "us_bank_account") {
    return roundCurrency(Math.min(amount * 0.008, 5));
  }

  return roundCurrency(amount * 0.029 + 0.3);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
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
      <PaymentElement />
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
          className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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

export function PaymentsClient({
  autopayEnabled: initialAutopayEnabled,
  currentBalance,
  defaultPaymentMethodId,
  nextDueDate,
  paymentMethod,
  payments,
  savedPaymentMethods,
  stripePublishableKey,
  totalPaid,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<PaymentTab>("overview");
  const [autopayEnabled, setAutopayEnabled] = useState(initialAutopayEnabled);
  const [effectiveDefaultMethodId, setEffectiveDefaultMethodId] = useState<string | null>(() =>
    resolveDefaultPaymentMethodId(savedPaymentMethods, defaultPaymentMethodId),
  );
  const [localDefaultOverrideId, setLocalDefaultOverrideId] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(
    resolveDefaultPaymentMethodId(savedPaymentMethods, defaultPaymentMethodId),
  );
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [stripeSetup, setStripeSetup] = useState<{
    clientSecret: string;
    methodType: StripeMethodType;
  } | null>(null);
  const [isPreparingStripeSetup, setIsPreparingStripeSetup] = useState<StripeMethodType | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isSavingDefault, setIsSavingDefault] = useState<string | null>(null);
  const [isSavingAutopay, setIsSavingAutopay] = useState(false);
  const [isRemovingMethod, setIsRemovingMethod] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    scope: FeedbackScope;
    tone: FeedbackTone;
  } | null>(null);

  const pendingPayments = useMemo(
    () => payments.filter((payment) => payment.status === "pending"),
    [payments],
  );

  const overdueCount = useMemo(
    () =>
      payments.filter(
        (payment) =>
          payment.status === "pending" && payment.dueDate && new Date(payment.dueDate) < new Date(),
      ).length,
    [payments],
  );

  const selectedCharge =
    pendingPayments.find((payment) => payment.id === selectedChargeId) ?? pendingPayments[0] ?? null;
  const stripeMethods = useMemo(
    () => savedPaymentMethods.filter((method) => method.paymentProvider === "stripe"),
    [savedPaymentMethods],
  );
  const selectedMethod =
    stripeMethods.find((method) => method.id === selectedMethodId) ??
    stripeMethods.find((method) => method.id === effectiveDefaultMethodId) ??
    stripeMethods[0] ??
    null;
  const effectiveDefaultMethod =
    stripeMethods.find((method) => method.id === effectiveDefaultMethodId) ?? null;
  const estimatedProcessingFee =
    selectedCharge && selectedMethod
      ? estimateProcessingFee(selectedCharge.amount, selectedMethod.paymentType)
      : 0;
  const estimatedPaymentTotal = selectedCharge
    ? roundCurrency(selectedCharge.amount + estimatedProcessingFee)
    : 0;
  const canUseStripe = Boolean(stripePublishableKey);

  useEffect(() => {
    setAutopayEnabled(initialAutopayEnabled);
  }, [initialAutopayEnabled]);

  useEffect(() => {
    if (localDefaultOverrideId && stripeMethods.some((method) => method.id === localDefaultOverrideId)) {
      setEffectiveDefaultMethodId(localDefaultOverrideId);
      setSelectedMethodId(localDefaultOverrideId);

      if (defaultPaymentMethodId === localDefaultOverrideId) {
        setLocalDefaultOverrideId(null);
      }

      return;
    }

    const resolvedDefaultMethodId = resolveDefaultPaymentMethodId(stripeMethods, defaultPaymentMethodId);
    setEffectiveDefaultMethodId(resolvedDefaultMethodId);
    setSelectedMethodId(resolvedDefaultMethodId);
  }, [defaultPaymentMethodId, localDefaultOverrideId, stripeMethods]);

  useEffect(() => {
    setSelectedChargeId((current) => {
      if (current && pendingPayments.some((payment) => payment.id === current)) {
        return current;
      }
      return pendingPayments[0]?.id ?? null;
    });
  }, [pendingPayments]);

  function clearFeedback(scope?: FeedbackScope) {
    setFeedback((current) => {
      if (!current) return null;
      if (!scope || current.scope === scope) return null;
      return current;
    });
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

  async function handlePayNow() {
    clearFeedback("pay");

    if (!selectedCharge) {
      setScopedFeedback("pay", "error", "Choose an outstanding charge before paying.");
      return;
    }

    if (!selectedMethod) {
      setScopedFeedback("pay", "error", "Add a saved payment method before paying online.");
      return;
    }

    if (selectedMethod.paymentProvider === "stripe") {
      if (!stripePublishableKey) {
        setScopedFeedback("pay", "error", "Online payments are not configured yet for this environment.");
        return;
      }

      setIsPaying(true);
      const response = await fetch("/api/renter/payments/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: selectedCharge.id,
          paymentMethodId: selectedMethod.id,
          amount: selectedCharge.amount.toFixed(2),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { clientSecret?: string | null; status?: string; error?: string }
        | null;

      if (!response.ok) {
        setScopedFeedback("pay", "error", payload?.error ?? "Unable to submit the online payment.");
        setIsPaying(false);
        return;
      }

      if (payload?.status === "requires_action" && payload.clientSecret) {
        const stripe = await getStripePromise(stripePublishableKey);
        if (!stripe) {
          setScopedFeedback("pay", "error", "The payment form could not be loaded.");
          setIsPaying(false);
          return;
        }

        const confirmation = await stripe.confirmPayment({
          clientSecret: payload.clientSecret,
          redirect: "if_required",
        });

        if (confirmation.error) {
          setScopedFeedback("pay", "error", confirmation.error.message ?? "Unable to confirm this payment.");
          setIsPaying(false);
          return;
        }
      }

      setScopedFeedback(
        "pay",
        "success",
        selectedMethod.paymentType === "us_bank_account"
          ? "ACH payment submitted. Your ledger will update after the payment is confirmed."
          : "Card payment submitted.",
      );
      setIsPaying(false);
      router.refresh();
    }
  }

  async function handleMakeDefault(methodId: string) {
    clearFeedback("methods");
    const previousDefaultMethodId = effectiveDefaultMethodId;
    const previousLocalDefaultOverrideId = localDefaultOverrideId;
    setLocalDefaultOverrideId(methodId);
    setEffectiveDefaultMethodId(methodId);
    setSelectedMethodId(methodId);
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
    clearFeedback("methods");

    if (enabled && !effectiveDefaultMethodId) {
      setScopedFeedback("methods", "error", "Make an online payment method the default before enabling auto-pay.");
      return;
    }

    const previousAutopayState = autopayEnabled;
    setAutopayEnabled(enabled);
    setIsSavingAutopay(true);

    const response = await fetch("/api/renter/payments/autopay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    setIsSavingAutopay(false);

    if (!response.ok) {
      setAutopayEnabled(previousAutopayState);
      setScopedFeedback("methods", "error", payload?.error ?? "Unable to update auto-pay.");
      return;
    }

    setScopedFeedback("methods", "success", enabled ? "Auto-pay enabled." : "Auto-pay disabled.");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payments</h1>
        <p className="mt-1 text-slate-500">Manage your rent payments and saved payment methods.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Current Balance</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{formatCurrency(currentBalance)}</p>
          <p className="mt-1 text-sm text-slate-500">
            {nextDueDate ? `Due ${formatDate(nextDueDate)}` : "No due date scheduled"}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Auto-Pay Status</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{autopayEnabled ? "Active" : "Inactive"}</p>
          <p className="mt-1 text-sm text-slate-500">
            {autopayEnabled ? "Enabled for your default method." : "Submit rent manually online."}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Default Method</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {effectiveDefaultMethod ? formatMethodLabel(effectiveDefaultMethod) : paymentMethod ?? "No method"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {stripeMethods.length > 0 ? "Use a saved online payment method." : "Add a payment method to pay online."}
          </p>
        </article>
      </section>

      <div className="grid gap-2 rounded-xl bg-slate-800 p-1 text-sm font-medium text-slate-300 md:grid-cols-3">
        {[
          ["overview", "Overview"],
          ["pay", "Make Payment"],
          ["methods", "Payment Methods"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value as PaymentTab)}
            className={[
              "rounded-lg px-4 py-2.5 transition-colors",
              tab === value
                ? "bg-sky-600 text-white shadow-lg shadow-sky-950/20"
                : "hover:bg-slate-700 hover:text-white",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-6">
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-slate-900">Overview</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Next Due</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{formatDate(nextDueDate)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Paid to Date</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Overdue</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{overdueCount}</p>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-slate-900">Upcoming Charges</h2>
              <div className="mt-4 space-y-3">
                {pendingPayments.length === 0 ? (
                  <p className="text-sm text-slate-500">No upcoming charges.</p>
                ) : (
                  pendingPayments.slice(0, 3).map((payment) => (
                    <div key={payment.id} className="rounded-xl border border-slate-100 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">
                            {paymentTypeLabels[payment.type] ?? payment.type}
                          </p>
                          <p className="text-sm text-slate-500">Due {formatDate(payment.dueDate)}</p>
                        </div>
                        <p className="font-semibold text-slate-900">{formatCurrency(payment.amount)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900">Payment History</h2>
            </div>
            {payments.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No payment records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Type</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Amount</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Due Date</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Paid On</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Status</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-medium text-slate-900">
                          {paymentTypeLabels[payment.type] ?? payment.type}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-900">{formatCurrency(payment.amount)}</td>
                        <td className="px-5 py-4 text-slate-600">{formatDate(payment.dueDate)}</td>
                        <td className="px-5 py-4 text-slate-600">{formatDate(payment.paidAt)}</td>
                        <td className="px-5 py-4">
                          <span
                            className={[
                              "rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                              paymentStatusColors[payment.status] ??
                                "bg-slate-100 text-slate-600 border-slate-200",
                            ].join(" ")}
                          >
                            {payment.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-500">{payment.paymentMethod ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === "pay" ? (
        <section className="space-y-6">
          <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900">Outstanding Charges</h2>
            <p className="mt-1 text-sm text-slate-500">Choose the charge you want to pay.</p>
            <div className="mt-5 space-y-3">
              {pendingPayments.length === 0 ? (
                <p className="text-sm text-slate-500">You have no pending charges right now.</p>
              ) : (
                pendingPayments.map((payment) => {
                  const isSelected = selectedCharge?.id === payment.id;
                  return (
                    <button
                      key={payment.id}
                      type="button"
                      onClick={() => setSelectedChargeId(payment.id)}
                      className={[
                        "flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-colors",
                        isSelected ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div>
                        <p className="font-medium text-slate-900">{paymentTypeLabels[payment.type] ?? payment.type}</p>
                        <p className="text-sm text-slate-500">Due {formatDate(payment.dueDate)}</p>
                      </div>
                      <p className="font-semibold text-slate-900">{formatCurrency(payment.amount)}</p>
                    </button>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900">Choose How To Pay</h2>
            <p className="mt-1 text-sm text-slate-500">Choose a saved card or ACH bank account.</p>

            <div className="mt-5 space-y-3">
              {stripeMethods.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                  Add a card or ACH account in the Payment Methods tab to pay online.
                </p>
              ) : (
                stripeMethods.map((method) => {
                  const isSelected = selectedMethod?.id === method.id;
                  const isDefault = method.id === effectiveDefaultMethodId;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedMethodId(method.id)}
                      className={[
                        "flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-colors",
                        isSelected ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div>
                        <p className="font-medium text-slate-900">{formatMethodLabel(method)}</p>
                        <p className="text-sm text-slate-500">
                          {method.paymentType === "us_bank_account"
                            ? "ACH bank payment"
                            : "Card payment"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isDefault ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                            Default
                          </span>
                        ) : null}
                        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                          Online
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Payment breakdown</p>
              {selectedCharge ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-600">Rent charge</span>
                    <span className="font-medium text-slate-900">{formatCurrency(selectedCharge.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-600">
                      Estimated processing fee
                      {selectedMethod?.paymentType === "us_bank_account"
                        ? " (0.8%, capped at $5.00)"
                        : " (2.9% + $0.30)"}
                    </span>
                    <span className="font-medium text-slate-900">{formatCurrency(estimatedProcessingFee)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2">
                    <span className="font-semibold text-slate-900">Estimated total</span>
                    <span className="text-lg font-semibold text-slate-900">
                      {formatCurrency(estimatedPaymentTotal)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-lg font-semibold text-slate-900">No charge selected</p>
              )}
            </div>

            {selectedMethod ? (
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                Processing fees are added to your rent payment: cards are typically 2.9% + $0.30, and ACH bank payments are typically 0.8% capped at $5.00. The final total may vary by payment type.
              </div>
            ) : null}

            <button
              type="button"
              onClick={handlePayNow}
              disabled={
                isPaying ||
                !selectedCharge ||
                !selectedMethod ||
                !canUseStripe
              }
              className="mt-5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPaying
                ? "Processing..."
                : selectedCharge
                  ? `Pay ${formatCurrency(estimatedPaymentTotal)}`
                  : "Choose a charge"}
            </button>
            {feedback?.scope === "pay" ? (
              <div className="mt-3 max-w-xl">
                <FeedbackMessage message={feedback.message} tone={feedback.tone} />
              </div>
            ) : null}
          </article>
        </section>
      ) : null}

      {tab === "methods" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">Payment Methods</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Save cards and ACH bank accounts for online rent payments.
                </p>
                <p className="mt-3 text-sm text-slate-500">
                  Your default method is applied to upcoming rent payments.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleAddStripeMethod("card")}
                  disabled={isPreparingStripeSetup !== null || !canUseStripe}
                  className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isPreparingStripeSetup === "card" ? "Preparing..." : "Add Card"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddStripeMethod("us_bank_account")}
                  disabled={isPreparingStripeSetup !== null || !canUseStripe}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
                      stripeSetup.methodType === "us_bank_account"
                        ? "ACH bank account saved."
                        : "Card saved.",
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
                        <p className="font-medium text-slate-900">
                          {formatMethodLabel(method)}
                        </p>
                        <p className="text-sm text-slate-500">
                          {method.paymentType === "us_bank_account"
                            ? `ACH${formatMethodMeta(method) ? ` · ${formatMethodMeta(method)}` : ""}`
                            : formatMethodMeta(method)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700"
                        >
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
                              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                              isDefault
                                ? "border-emerald-500 bg-emerald-500"
                                : "border-slate-300 bg-slate-100",
                              isSavingDefault ? "opacity-70" : "",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform",
                                isDefault ? "translate-x-5" : "translate-x-1",
                              ].join(" ")}
                            />
                          </span>
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
                  "relative mt-1 inline-flex h-8 w-14 items-center rounded-full transition-colors",
                  autopayEnabled ? "bg-emerald-500" : "bg-slate-300",
                  isSavingAutopay || !effectiveDefaultMethodId
                    ? "cursor-not-allowed opacity-70"
                    : "hover:ring-4 hover:ring-emerald-100",
                ].join(" ")}
                aria-pressed={autopayEnabled}
                aria-label={autopayEnabled ? "Disable auto-pay" : "Enable auto-pay"}
              >
                <span
                  className={[
                    "inline-block h-6 w-6 rounded-full bg-white transition-transform",
                    autopayEnabled ? "translate-x-7" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
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
          </section>
        </div>
      ) : null}
    </div>
  );
}
