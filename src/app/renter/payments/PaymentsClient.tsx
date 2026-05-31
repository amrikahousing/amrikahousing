"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MonthlyRentBreakdown } from "@/components/MonthlyRentBreakdown";
import type { MonthlyBreakdownRow } from "@/lib/rent-credit";

type PaymentRow = {
  id: string;
  amount: number;
  type: string;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  notes: string | null;
  latestAttemptStatus: string | null;
  latestAttemptMethodType: "card" | "us_bank_account" | null;
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
  monthlyBreakdown: MonthlyBreakdownRow[];
  defaultPaymentMethodId: string | null;
  nextDueDate: string | null;
  paymentMethod: string | null;
  payments: PaymentRow[];
  savedPaymentMethods: SavedPaymentMethod[];
  stripePublishableKey: string | null;
  totalPaid: number;
};

type FeedbackTone = "error" | "success";
type FeedbackScope = "pay";
type SubmittedPayment = {
  methodType: SavedPaymentMethod["paymentType"];
  status: string | null;
};

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
  submitted: "bg-sky-50 text-sky-700 border-sky-200",
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

function formatMethodLabel(method: SavedPaymentMethod) {
  if (method.paymentType === "us_bank_account") {
    return `${method.bankName ?? "Bank account"} ending in ${method.last4}`;
  }

  return `${formatCardBrand(method.brand ?? "Card")} ending in ${method.last4}`;
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

function isSubmittedAttemptStatus(status: string | null) {
  return Boolean(status && !["requires_payment_method", "canceled", "failed"].includes(status));
}

function isPaidAttemptStatus(status: string | null) {
  return status === "succeeded";
}

function isPaidPayment(payment: PaymentRow) {
  return (
    payment.status === "paid" ||
    payment.status === "completed" ||
    Boolean(payment.paidAt) ||
    isPaidAttemptStatus(payment.latestAttemptStatus)
  );
}

function getChargeKey(payment: PaymentRow) {
  if (!payment.dueDate) return null;
  return `${payment.type}:${payment.dueDate.slice(0, 10)}:${payment.amount.toFixed(2)}`;
}

function getPaidChargeKeys(payments: PaymentRow[]) {
  return new Set(
    payments
      .filter(isPaidPayment)
      .map(getChargeKey)
      .filter((key): key is string => Boolean(key)),
  );
}

function isPayablePayment(payment: PaymentRow, paidChargeKeys: Set<string>) {
  if (payment.status !== "pending") return false;
  if (isPaidPayment(payment)) return false;
  if (isSubmittedAttemptStatus(payment.latestAttemptStatus)) return false;

  const chargeKey = getChargeKey(payment);
  return !chargeKey || !paidChargeKeys.has(chargeKey);
}

function paymentDisplayStatus(payment: PaymentRow) {
  if (isPaidPayment(payment)) {
    return { key: "paid", label: "Paid" };
  }

  if (payment.status === "pending" && isSubmittedAttemptStatus(payment.latestAttemptStatus)) {
    return { key: "submitted", label: "Submitted" };
  }

  if (payment.status === "pending") {
    return { key: "pending", label: "Unpaid" };
  }

  return { key: payment.status, label: payment.status };
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

export function PaymentsClient({
  autopayEnabled: initialAutopayEnabled,
  currentBalance,
  monthlyBreakdown,
  defaultPaymentMethodId,
  nextDueDate,
  paymentMethod,
  payments,
  savedPaymentMethods,
  stripePublishableKey,
  totalPaid,
}: Props) {
  const router = useRouter();
  const [autopayEnabled, setAutopayEnabled] = useState(initialAutopayEnabled);
  const [effectiveDefaultMethodId, setEffectiveDefaultMethodId] = useState<string | null>(() =>
    resolveDefaultPaymentMethodId(savedPaymentMethods, defaultPaymentMethodId),
  );
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(
    resolveDefaultPaymentMethodId(savedPaymentMethods, defaultPaymentMethodId),
  );
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [submittedPayments, setSubmittedPayments] = useState<Record<string, SubmittedPayment>>({});
  const [feedback, setFeedback] = useState<{
    message: string;
    scope: FeedbackScope;
    tone: FeedbackTone;
  } | null>(null);

  const pendingPayments = useMemo(
    () => {
      const paidChargeKeys = getPaidChargeKeys(payments);
      return payments.filter((payment) => isPayablePayment(payment, paidChargeKeys));
    },
    [payments],
  );
  const serverSubmittedPayments = useMemo(
    () =>
      Object.fromEntries(
        payments
          .filter(
            (payment) =>
              payment.status === "pending" &&
              isSubmittedAttemptStatus(payment.latestAttemptStatus),
          )
          .map((payment) => [
            payment.id,
            {
              methodType: payment.latestAttemptMethodType ?? "card",
              status: payment.latestAttemptStatus,
            } satisfies SubmittedPayment,
          ]),
      ),
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
    selectedChargeId ? pendingPayments.find((payment) => payment.id === selectedChargeId) ?? null : null;
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
    const resolvedDefaultMethodId = resolveDefaultPaymentMethodId(stripeMethods, defaultPaymentMethodId);
    setEffectiveDefaultMethodId(resolvedDefaultMethodId);
    setSelectedMethodId(resolvedDefaultMethodId);
  }, [defaultPaymentMethodId, stripeMethods]);

  useEffect(() => {
    setSelectedChargeId((current) => {
      if (current && pendingPayments.some((payment) => payment.id === current)) {
        return current;
      }
      return null;
    });
  }, [pendingPayments]);

  useEffect(() => {
    setSubmittedPayments((current) => {
      const pendingIds = new Set(pendingPayments.map((payment) => payment.id));
      const localSubmitted = Object.fromEntries(
        Object.entries(current).filter(([paymentId]) => pendingIds.has(paymentId)),
      );
      return {
        ...localSubmitted,
        ...serverSubmittedPayments,
      };
    });
  }, [pendingPayments, serverSubmittedPayments]);

  const selectedChargeSubmitted = selectedCharge
    ? submittedPayments[selectedCharge.id] ?? null
    : null;

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

    if (submittedPayments[selectedCharge.id]) {
      setScopedFeedback("pay", "success", "This payment was already submitted. We are updating your ledger now.");
      return;
    }

    if (selectedMethod.paymentProvider === "stripe") {
      if (!stripePublishableKey) {
        setScopedFeedback("pay", "error", "Online payments are not configured yet for this environment.");
        return;
      }

      setIsPaying(true);
      const submittedMethodType = selectedMethod.paymentType;
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

      setSubmittedPayments((current) => ({
        ...current,
        [selectedCharge.id]: {
          methodType: submittedMethodType,
          status: payload?.status ?? null,
        },
      }));
      setScopedFeedback(
        "pay",
        "success",
        submittedMethodType === "us_bank_account"
          ? "ACH payment submitted. Your ledger will update after the payment is confirmed."
          : payload?.status === "succeeded"
            ? "Card payment received. Updating your ledger now."
            : "Card payment submitted. Updating your ledger now.",
      );
      setIsPaying(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payments</h1>
          <p className="mt-1 text-slate-500">Review charges, pay rent, and manage saved methods.</p>
        </div>
        <Link
          href="/renter/payment-methods"
          className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Manage payment methods
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Current Balance</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{formatCurrency(currentBalance)}</p>
          <p className="mt-1 text-sm text-slate-500">
            {nextDueDate ? `Next due ${formatDate(nextDueDate)}` : "No due date scheduled"}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Unpaid</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{pendingPayments.length}</p>
          <p className="mt-1 text-sm text-slate-500">
            {overdueCount > 0 ? `${overdueCount} overdue` : "No overdue charges"}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Paid to Date</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{formatCurrency(totalPaid)}</p>
          <p className="mt-1 text-sm text-slate-500">Recorded in payment history</p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Default Method</p>
          <p className="mt-3 text-xl font-bold text-slate-900">
            {effectiveDefaultMethod ? formatMethodLabel(effectiveDefaultMethod) : paymentMethod ?? "No method"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {autopayEnabled ? "Auto-pay active" : "Auto-pay inactive"}
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.72fr)]">
          <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Unpaid Charges</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Select a charge to choose a payment method and review the total.
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                {pendingPayments.length} unpaid
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {pendingPayments.length === 0 ? (
                <p className="text-sm text-slate-500">You have no pending charges right now.</p>
              ) : (
                pendingPayments.map((payment) => {
                  const isSelected = selectedCharge?.id === payment.id;
                  const submittedPayment = submittedPayments[payment.id];
                  return (
                    <button
                      key={payment.id}
                      type="button"
                      onClick={() => {
                        if (!isPaying) setSelectedChargeId(payment.id);
                      }}
                      disabled={isPaying}
                      className={[
                        "flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-colors",
                        isSelected ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:bg-slate-50",
                        isPaying ? "cursor-not-allowed opacity-70" : "",
                      ].join(" ")}
                    >
                      <div>
                        <p className="font-medium text-slate-900">{paymentTypeLabels[payment.type] ?? payment.type}</p>
                        <p className="text-sm text-slate-500">Due {formatDate(payment.dueDate)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {submittedPayment ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                            Submitted
                          </span>
                        ) : null}
                        <p className="font-semibold text-slate-900">{formatCurrency(payment.amount)}</p>
                        <span className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
                          Pay
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </article>

          {selectedCharge ? (
          <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-6 xl:self-start">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">
                  Pay {paymentTypeLabels[selectedCharge.type] ?? selectedCharge.type}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Due {formatDate(selectedCharge.dueDate)} · {formatCurrency(selectedCharge.amount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedChargeId(null)}
                disabled={isPaying}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            </div>

            <h3 className="mt-6 text-sm font-semibold text-slate-900">Payment Method</h3>

            <div className="mt-5 space-y-3">
              {stripeMethods.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                  Add a card or ACH account to pay online.
                </p>
              ) : (
                stripeMethods.map((method) => {
                  const isSelected = selectedMethod?.id === method.id;
                  const isDefault = method.id === effectiveDefaultMethodId;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => {
                        if (!isPaying && !selectedChargeSubmitted) setSelectedMethodId(method.id);
                      }}
                      disabled={isPaying || Boolean(selectedChargeSubmitted)}
                      className={[
                        "flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-colors",
                        isSelected ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:bg-slate-50",
                        isPaying || selectedChargeSubmitted ? "cursor-not-allowed opacity-70" : "",
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
                !canUseStripe ||
                Boolean(selectedChargeSubmitted)
              }
              className="mt-5 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPaying
                ? "Processing..."
                : selectedChargeSubmitted
                  ? selectedChargeSubmitted.methodType === "us_bank_account"
                    ? "ACH submitted"
                    : "Payment submitted"
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
          ) : (
            <article className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
              <div>
                <h2 className="font-semibold text-slate-900">Choose a charge to pay</h2>
                <p className="mt-2 max-w-sm text-sm text-slate-500">
                  Your payment methods, fee estimate, and final Pay button will appear here after you select a charge.
                </p>
              </div>
            </article>
          )}
      </section>

      {monthlyBreakdown.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900">Monthly Breakdown</h2>
            <p className="mt-1 text-sm text-slate-500">
              A rent credit is applied to your lease. Here is what you pay each month.
            </p>
          </div>
          <div className="p-5">
            <MonthlyRentBreakdown rows={monthlyBreakdown} />
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">Payment History</h2>
          <p className="mt-1 text-sm text-slate-500">Paid, submitted, and unpaid charges all appear here.</p>
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
                  <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((payment) => {
                  const displayStatus = paymentDisplayStatus(payment);
                  const isPayable = pendingPayments.some((pendingPayment) => pendingPayment.id === payment.id);
                  return (
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
                            "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            paymentStatusColors[displayStatus.key] ??
                              "bg-slate-100 text-slate-600 border-slate-200",
                          ].join(" ")}
                        >
                          {displayStatus.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{payment.paymentMethod ?? "—"}</td>
                      <td className="px-5 py-4 text-right">
                        {isPayable ? (
                          <button
                            type="button"
                            onClick={() => setSelectedChargeId(payment.id)}
                            disabled={isPaying}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Pay
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
