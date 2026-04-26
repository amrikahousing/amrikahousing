"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  customerEmail: string | null;
  currentBalance: number;
  defaultPaymentMethodId: string | null;
  defaultBillingName: string;
  nextDueDate: string | null;
  paymentMethod: string | null;
  payments: PaymentRow[];
  plaidConfigured: boolean;
  savedPaymentMethods: SavedPaymentMethod[];
  stripeConfigured: boolean;
  totalPaid: number;
};

type PaymentTab = "overview" | "pay" | "methods";
type FeedbackTone = "error" | "success";
type FeedbackScope = "pay" | "methods";
type SetupMode = "card" | "bank" | null;

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

type PlaidInstitution = {
  institution_id?: string | null;
  name?: string | null;
};

type PlaidAccount = {
  id?: string | null;
  name?: string | null;
  mask?: string | null;
  subtype?: string | null;
  type?: string | null;
};

type PlaidSuccessMetadata = {
  institution?: PlaidInstitution | null;
  accounts?: PlaidAccount[] | null;
  link_session_id?: string | null;
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

let plaidScriptPromise: Promise<void> | null = null;

function plaidWindow() {
  return window as Window & { Plaid?: PlaidFactory };
}

function loadPlaidScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (plaidWindow().Plaid) return Promise.resolve();
  if (plaidScriptPromise) return plaidScriptPromise;

  plaidScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"]',
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Plaid Link failed to load.")), { once: true });
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

function PaymentTypeIcon({ type }: { type: "card" | "bank" }) {
  if (type === "bank") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
        <rect x="4" y="3" width="10" height="18" rx="2" />
        <path d="M8 7h2M8 11h2M8 15h2M16 7h4M16 11h4M16 15h4M16 19h4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </svg>
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

function SetupPaymentMethodForm({
  billingName,
  onCancel,
  onError,
  onSaved,
  setBillingName,
}: {
  billingName: string;
  onCancel: () => void;
  onError: (message: string) => void;
  onSaved: (message: string) => void;
  setBillingName: (value: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stripe || !elements) {
      onError("Stripe has not loaded yet.");
      return;
    }

    setIsSaving(true);
    onError("");

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: {
        payment_method_data: {
          billing_details: {
            name: billingName.trim() || undefined,
          },
        },
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (result.error) {
      onError(result.error.message ?? "Unable to save this payment method.");
      setIsSaving(false);
      return;
    }

    if (!result.setupIntent?.id) {
      onError("Stripe did not return a completed setup intent.");
      setIsSaving(false);
      return;
    }

    const response = await fetch("/api/renter/payments/setup-intent/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupIntentId: result.setupIntent.id }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      onError(payload?.error ?? "Unable to save this payment method.");
      setIsSaving(false);
      return;
    }

    onSaved("Payment method saved successfully.");
    setIsSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
      <label className="space-y-1.5">
        <span className="block text-sm font-medium text-slate-700">Billing Name</span>
        <input
          type="text"
          value={billingName}
          onChange={(event) => setBillingName(event.target.value)}
          placeholder="John Doe"
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </label>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <PaymentElement
          id="renter-payment-method"
          options={{
            layout: {
              type: "accordion",
              defaultCollapsed: false,
              radios: "always",
              visibleAccordionItemsCount: 5,
            },
            paymentMethodOrder: ["card", "us_bank_account"],
            wallets: {
              link: "never",
            },
            defaultValues: {
              billingDetails: {
                name: billingName,
              },
            },
          }}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!stripe || !elements || isSaving}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSaving ? "Saving..." : "Save Payment Method"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PaymentsClient({
  autopayEnabled: initialAutopayEnabled,
  customerEmail,
  currentBalance,
  defaultPaymentMethodId,
  defaultBillingName,
  nextDueDate,
  paymentMethod,
  payments,
  plaidConfigured,
  savedPaymentMethods,
  stripeConfigured,
  totalPaid,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<PaymentTab>("overview");
  const [autopayEnabled, setAutopayEnabled] = useState(initialAutopayEnabled);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(
    defaultPaymentMethodId ?? savedPaymentMethods[0]?.id ?? null,
  );
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<Exclude<SetupMode, "bank"> | null>(null);
  const [billingName, setBillingName] = useState(defaultBillingName);
  const [isLoadingSetupIntent, setIsLoadingSetupIntent] = useState(false);
  const [isLinkingPlaidBank, setIsLinkingPlaidBank] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isSavingDefault, setIsSavingDefault] = useState<string | null>(null);
  const [isRemovingMethod, setIsRemovingMethod] = useState<string | null>(null);
  const [isUpdatingAutopay, setIsUpdatingAutopay] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    scope: FeedbackScope;
    tone: FeedbackTone;
  } | null>(null);
  const addMethodPanelRef = useRef<HTMLDivElement | null>(null);

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

  const selectedMethod =
    savedPaymentMethods.find((method) => method.id === selectedMethodId) ??
    savedPaymentMethods.find((method) => method.isDefault) ??
    savedPaymentMethods[0] ??
    null;

  const selectedCharge =
    pendingPayments.find((payment) => payment.id === selectedChargeId) ?? pendingPayments[0] ?? null;
  const cardMethods = savedPaymentMethods.filter(
    (method) => method.paymentProvider === "stripe" && method.paymentType === "card",
  );
  const achMethods = savedPaymentMethods.filter(
    (method) => method.paymentType === "us_bank_account",
  );

  useEffect(() => {
    setAutopayEnabled(initialAutopayEnabled);
  }, [initialAutopayEnabled]);

  useEffect(() => {
    setBillingName(defaultBillingName);
  }, [defaultBillingName]);

  useEffect(() => {
    setSelectedMethodId(defaultPaymentMethodId ?? savedPaymentMethods[0]?.id ?? null);
  }, [defaultPaymentMethodId, savedPaymentMethods]);

  useEffect(() => {
    if (!plaidConfigured) return;
    void loadPlaidScript().catch(() => {
      setScopedFeedback("methods", "error", "Plaid Link could not be loaded.");
    });
  }, [plaidConfigured]);

  useEffect(() => {
    setSelectedChargeId((current) => {
      if (current && pendingPayments.some((payment) => payment.id === current)) {
        return current;
      }
      return pendingPayments[0]?.id ?? null;
    });
  }, [pendingPayments]);

  useEffect(() => {
    if (!setupClientSecret) return;

    requestAnimationFrame(() => {
      addMethodPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [setupClientSecret]);

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

  async function beginAddPaymentMethod(mode: "card") {
    clearFeedback("methods");

    if (!stripeConfigured) {
      setScopedFeedback("methods", "error", "Stripe is not configured yet for this environment.");
      return;
    }

    setSetupMode(mode);
    setSetupClientSecret(null);
    setIsLoadingSetupIntent(true);

    const response = await fetch("/api/renter/payments/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethodType: "card" }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { clientSecret?: string; error?: string }
      | null;

    setIsLoadingSetupIntent(false);

    if (!response.ok || !payload?.clientSecret) {
      setScopedFeedback("methods", "error", payload?.error ?? "Unable to prepare a payment method form.");
      return;
    }

    setSetupClientSecret(payload.clientSecret);
  }

  async function handleConnectPlaidBankAccount() {
    clearFeedback("methods");

    if (!plaidConfigured) {
      setScopedFeedback("methods", "error", "Plaid is not configured yet for this environment.");
      return;
    }

    setIsLinkingPlaidBank(true);

    try {
      await loadPlaidScript();
      if (!plaidWindow().Plaid) {
        throw new Error("Plaid Link is unavailable.");
      }

      const tokenResponse = await fetch("/api/renter/payments/plaid/link-token", {
        method: "POST",
      });
      const tokenPayload = (await tokenResponse.json().catch(() => null)) as
        | { linkToken?: string; error?: string }
        | null;

      if (!tokenResponse.ok || !tokenPayload?.linkToken) {
        throw new Error(tokenPayload?.error ?? "Unable to prepare Plaid Link.");
      }
      const linkToken = tokenPayload.linkToken;

      const linkedMethod = await new Promise<{ bankName?: string | null; last4?: string | null }>(
        (resolve, reject) => {
          const handler = plaidWindow().Plaid?.create({
            token: linkToken,
            onSuccess: async (publicToken, metadata) => {
              try {
                const response = await fetch("/api/renter/payments/plaid/exchange", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ publicToken, metadata }),
                });
                const payload = (await response.json().catch(() => null)) as
                  | {
                    paymentMethod?: { bankName?: string | null; last4?: string | null };
                    error?: string;
                  }
                  | null;

                if (!response.ok || !payload?.paymentMethod) {
                  reject(new Error(payload?.error ?? "Unable to save the Plaid bank account."));
                  return;
                }

                resolve(payload.paymentMethod);
              } catch (error) {
                reject(error);
              } finally {
                handler?.destroy();
              }
            },
            onExit: (plaidError) => {
              handler?.destroy();
              reject(
                new Error(
                  plaidError
                    ? "Plaid Link was closed before the bank account was connected."
                    : "Plaid Link was closed before the bank account was connected.",
                ),
              );
            },
          });

          handler?.open();
        },
      );

      setScopedFeedback(
        "methods",
        "success",
        linkedMethod.bankName
          ? `${linkedMethod.bankName} ending in ${linkedMethod.last4 ?? "—"} linked for ACH rent payments.`
          : "Bank account linked for ACH rent payments.",
      );
      router.refresh();
    } catch (error) {
      setScopedFeedback(
        "methods",
        "error",
        error instanceof Error ? error.message : "Unable to link the Plaid bank account.",
      );
    } finally {
      setIsLinkingPlaidBank(false);
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

    if (selectedMethod.paymentProvider === "plaid") {
      if (!plaidConfigured) {
        setScopedFeedback("pay", "error", "Plaid ACH is not configured yet for this environment.");
        return;
      }

      setIsPaying(true);

      const authorizeResponse = await fetch("/api/renter/payments/plaid/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: selectedCharge.id,
          paymentMethodId: selectedMethod.id,
          amount: selectedCharge.amount.toFixed(2),
        }),
      });
      const authorizePayload = (await authorizeResponse.json().catch(() => null)) as
        | { status?: string; error?: string; failure_message?: string | null }
        | null;

      if (!authorizeResponse.ok) {
        setScopedFeedback("pay", "error", authorizePayload?.error ?? "Unable to authorize the ACH debit.");
        setIsPaying(false);
        return;
      }

      if (authorizePayload?.status === "failed") {
        setScopedFeedback(
          "pay",
          "error",
          authorizePayload.failure_message ?? "The ACH authorization was declined.",
        );
        setIsPaying(false);
        router.refresh();
        return;
      }

      const transferResponse = await fetch("/api/renter/payments/plaid/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: selectedCharge.id,
          paymentMethodId: selectedMethod.id,
          amount: selectedCharge.amount.toFixed(2),
        }),
      });
      const transferPayload = (await transferResponse.json().catch(() => null)) as
        | { status?: string; error?: string }
        | null;

      if (!transferResponse.ok) {
        setScopedFeedback("pay", "error", transferPayload?.error ?? "Unable to submit the ACH payment.");
        setIsPaying(false);
        return;
      }

      setScopedFeedback(
        "pay",
        "success",
        "ACH payment submitted. Your rent ledger will update after Plaid confirms the transfer.",
      );
      setIsPaying(false);
      router.refresh();
      return;
    }

    if (!stripeConfigured) {
      setScopedFeedback("pay", "error", "Stripe is not configured yet for this environment.");
      return;
    }

    const stripe = await stripePromise;
    if (!stripe) {
      setScopedFeedback("pay", "error", "Stripe could not be loaded in the browser.");
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
      | { clientSecret?: string; error?: string; status?: string }
      | null;

    if (!response.ok || !payload?.clientSecret) {
      setScopedFeedback("pay", "error", payload?.error ?? "Unable to prepare the payment.");
      setIsPaying(false);
      return;
    }

    if (payload.status === "succeeded" || payload.status === "processing") {
      setScopedFeedback(
        "pay",
        "success",
        payload.status === "succeeded"
          ? "Payment already succeeded. Refreshing your ledger now."
          : "Payment is processing. Refreshing your ledger now.",
      );
      setIsPaying(false);
      router.refresh();
      return;
    }

    if (selectedMethod.paymentType === "us_bank_account") {
      const bankResult = await stripe.confirmUsBankAccountPayment(payload.clientSecret);

      if (bankResult.error) {
        setScopedFeedback("pay", "error", bankResult.error.message ?? "Payment confirmation failed.");
        setIsPaying(false);
        return;
      }

      setScopedFeedback(
        "pay",
        "success",
        "Payment submitted successfully. The ledger will update after Stripe confirms it.",
      );
      setIsPaying(false);
      router.refresh();
      return;
    }

    const result = await stripe.confirmCardPayment(payload.clientSecret, {
      payment_method: selectedMethod.stripePaymentMethodId ?? undefined,
    });

    if (result.error) {
      setScopedFeedback("pay", "error", result.error.message ?? "Payment confirmation failed.");
      setIsPaying(false);
      return;
    }

    setScopedFeedback(
      "pay",
      "success",
      "Payment submitted successfully. The ledger will update after Stripe confirms it.",
    );
    setIsPaying(false);
    router.refresh();
  }

  async function handleMakeDefault(methodId: string) {
    clearFeedback("methods");
    setIsSavingDefault(methodId);

    const response = await fetch("/api/renter/payments/default-method", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethodId: methodId }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    setIsSavingDefault(null);

    if (!response.ok) {
      setScopedFeedback("methods", "error", payload?.error ?? "Unable to update the default payment method.");
      return;
    }

    setSelectedMethodId(methodId);
    setScopedFeedback("methods", "success", "Default payment method updated.");
    router.refresh();
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

  async function handleAutopayChange(nextValue: boolean) {
    clearFeedback("methods");
    setIsUpdatingAutopay(true);

    const response = await fetch("/api/renter/payments/autopay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextValue }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    setIsUpdatingAutopay(false);

    if (!response.ok) {
      setScopedFeedback("methods", "error", payload?.error ?? "Unable to update auto-pay.");
      return;
    }

    setAutopayEnabled(nextValue);
    setScopedFeedback("methods", "success", nextValue ? "Auto-pay enabled." : "Auto-pay turned off.");
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
            {autopayEnabled ? "Future rent can be charged automatically." : "Manual payments are currently enabled."}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Default Method</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{paymentMethod ?? "No method"}</p>
          <p className="mt-1 text-sm text-slate-500">
            {savedPaymentMethods.length > 0 ? "Use Plaid for ACH or Stripe for cards." : "Add a payment method to pay online."}
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
            <p className="mt-1 text-sm text-slate-500">ACH bank payments run through Plaid Transfer. Cards stay on Stripe.</p>

            <div className="mt-5 space-y-6">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-slate-900">Pay by bank (ACH via Plaid Transfer)</h3>
                    <p className="mt-1 text-sm text-slate-500">Manual one-time ACH debits from your linked bank account.</p>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {achMethods.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                      Link a bank account in the Payment Methods tab to pay rent by ACH.
                    </p>
                  ) : (
                    achMethods.map((method) => {
                      const isSelected = selectedMethod?.id === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setSelectedMethodId(method.id)}
                          className={[
                            "flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-colors",
                            isSelected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <div>
                            <p className="font-medium text-slate-900">{formatMethodLabel(method)}</p>
                            <p className="text-sm text-slate-500">One-time ACH debit via Plaid Transfer</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {method.isDefault ? (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                Default
                              </span>
                            ) : null}
                            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                              ACH
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-slate-900">Pay by card</h3>
                <p className="mt-1 text-sm text-slate-500">Use a saved card processed through Stripe.</p>
                <div className="mt-3 space-y-3">
                  {cardMethods.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                      Add a card in the Payment Methods tab to pay by card.
                    </p>
                  ) : (
                    cardMethods.map((method) => {
                      const isSelected = selectedMethod?.id === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setSelectedMethodId(method.id)}
                          className={[
                            "flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-colors",
                            isSelected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <div>
                            <p className="font-medium text-slate-900">{formatMethodLabel(method)}</p>
                            <p className="text-sm text-slate-500">{formatMethodMeta(method)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {method.isDefault ? (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                Default
                              </span>
                            ) : null}
                            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                              Card
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Selected charge</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {selectedCharge ? formatCurrency(selectedCharge.amount) : "No charge selected"}
              </p>
            </div>

            {selectedMethod?.paymentProvider === "plaid" ? (
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                Submitting this payment authorizes a one-time ACH debit for the selected rent charge.
              </div>
            ) : null}

            <button
              type="button"
              onClick={handlePayNow}
              disabled={
                isPaying ||
                !selectedCharge ||
                !selectedMethod ||
                (selectedMethod.paymentProvider === "plaid" ? !plaidConfigured : !stripeConfigured)
              }
              className="mt-5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPaying
                ? "Processing..."
                : selectedCharge
                  ? `Pay ${formatCurrency(selectedCharge.amount)}${selectedMethod?.paymentProvider === "plaid" ? " by ACH" : ""}`
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
                  Cards are saved through Stripe. ACH bank accounts are linked through Plaid Transfer for one-time rent payments.
                </p>
                <p className="mt-3 text-sm text-slate-500">
                  Add a card for card payments or link a bank account for ACH.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => beginAddPaymentMethod("card")}
                  disabled={isLoadingSetupIntent || !stripeConfigured}
                  className={[
                    "rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white",
                    setupMode === "card"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  {isLoadingSetupIntent && setupMode === "card" ? "Preparing..." : "Add New Credit Card"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleConnectPlaidBankAccount()}
                  disabled={isLinkingPlaidBank || !plaidConfigured}
                  className={[
                    "rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-slate-100",
                    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  {isLinkingPlaidBank ? "Opening Plaid..." : "Link Bank Account"}
                </button>
              </div>
            </div>
            {!setupClientSecret ? (
              <p className="mt-4 text-sm text-slate-500">
                `Add New Credit Card` opens the secure Stripe card form below. `Link Bank Account` starts the Plaid ACH flow.
              </p>
            ) : null}

            {!stripeConfigured ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to enable online payments.
              </div>
            ) : null}

            {!plaidConfigured ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Add `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` to enable ACH rent payments.
              </div>
            ) : null}

            {feedback?.scope === "methods" ? (
              <div className="mt-5">
                <FeedbackMessage message={feedback.message} tone={feedback.tone} />
              </div>
            ) : null}

            {setupMode === "card" && setupClientSecret && stripePromise ? (
              <div ref={addMethodPanelRef} className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">Add a card</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Use Stripe&apos;s secure card form below, then save it for future rent payments.
                  </p>
                </div>
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret: setupClientSecret,
                    appearance: { theme: "stripe" },
                  }}
                >
                  <SetupPaymentMethodForm
                    billingName={billingName}
                    onCancel={() => {
                      setSetupClientSecret(null);
                      setSetupMode(null);
                      setBillingName(defaultBillingName);
                    }}
                    onError={(message) => {
                      if (message) {
                        setScopedFeedback("methods", "error", message);
                      } else {
                        clearFeedback("methods");
                      }
                    }}
                    onSaved={(message) => {
                      setSetupClientSecret(null);
                      setSetupMode(null);
                      setBillingName(defaultBillingName);
                      setScopedFeedback("methods", "success", message);
                      router.refresh();
                    }}
                    setBillingName={setBillingName}
                  />
                </Elements>
              </div>
            ) : null}

            <div className="mt-6 space-y-3">
              {savedPaymentMethods.length === 0 ? (
                <p className="text-sm text-slate-500">No saved payment methods yet.</p>
              ) : (
                savedPaymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {formatMethodLabel(method)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {method.paymentProvider === "plaid"
                          ? "Plaid Transfer ACH"
                          : formatMethodMeta(method)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                          method.paymentProvider === "plaid"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-violet-100 text-violet-700",
                        ].join(" ")}
                      >
                        {method.paymentProvider === "plaid" ? "Plaid ACH" : "Stripe"}
                      </span>
                      {method.isDefault ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                          Default
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMakeDefault(method.id)}
                          disabled={isSavingDefault === method.id}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          {isSavingDefault === method.id ? "Saving..." : "Make Default"}
                        </button>
                      )}
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
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">Auto-Pay Settings</h2>
                <p className="mt-1 text-sm text-slate-500">Automatically pay rent each month using your default payment method.</p>
              </div>
              <button
                type="button"
                onClick={() => handleAutopayChange(!autopayEnabled)}
                disabled={
                  isUpdatingAutopay ||
                  !selectedMethod ||
                  selectedMethod.paymentProvider !== "stripe" ||
                  selectedMethod.paymentType !== "card"
                }
                className={[
                  "relative mt-1 inline-flex h-8 w-14 items-center rounded-full transition-colors",
                  autopayEnabled ? "bg-emerald-500" : "bg-slate-300",
                  isUpdatingAutopay ? "cursor-not-allowed opacity-70" : "",
                ].join(" ")}
                aria-pressed={autopayEnabled}
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
                <p className="font-medium text-slate-900">Enable Auto-Pay</p>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedMethod
                    ? selectedMethod.paymentProvider === "stripe" && selectedMethod.paymentType === "card"
                      ? `Future charges can use ${formatMethodLabel(selectedMethod)}.`
                      : "Auto-pay is available only for saved card payments in this version."
                    : "Select a default saved payment method before enabling auto-pay."}
                </p>
              </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
