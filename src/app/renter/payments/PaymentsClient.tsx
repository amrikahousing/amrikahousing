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
  stripePaymentMethodId: string;
  paymentType: "card" | "us_bank_account";
  brand: string | null;
  bankName: string | null;
  bankAccountType: string | null;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  billingName: string | null;
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
  savedPaymentMethods: SavedPaymentMethod[];
  stripeConfigured: boolean;
  totalPaid: number;
};

type PaymentTab = "overview" | "pay" | "methods";
type FeedbackTone = "error" | "success";
type FeedbackScope = "pay" | "methods";
type SetupMode = "card" | "bank" | null;
type BankAccountChoice = "checking" | "savings";
type AchEntryMode = "link" | "manual";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

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

function validateBankBillingFields(args: {
  billingName: string;
  bankEmail: string;
  bankAddressLine1: string;
  bankCity: string;
  bankState: string;
  bankPostalCode: string;
  achEntryMode: AchEntryMode;
}) {
  if (args.achEntryMode === "link") {
    return null;
  }

  if (!args.billingName.trim()) return "Account holder name is required.";
  if (!args.bankEmail.trim()) return "Email is required to save a bank account.";
  if (!args.bankAddressLine1.trim() || !args.bankCity.trim() || !args.bankState.trim() || !args.bankPostalCode.trim()) {
    return "Address, city, state, and ZIP code are required for bank verification.";
  }

  return null;
}

function isDismissedBankLinkError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("payment method of type us_bank_account was expected to be present") ||
    normalized.includes("does not have a payment method") ||
    normalized.includes("none was provided")
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
  const [setupMode, setSetupMode] = useState<SetupMode>(null);
  const [billingName, setBillingName] = useState(defaultBillingName);
  const [bankEmail, setBankEmail] = useState(customerEmail ?? "");
  const [bankAddressLine1, setBankAddressLine1] = useState("");
  const [bankCity, setBankCity] = useState("");
  const [bankState, setBankState] = useState("");
  const [bankPostalCode, setBankPostalCode] = useState("");
  const [achEntryMode, setAchEntryMode] = useState<AchEntryMode>("link");
  const [manualRoutingNumber, setManualRoutingNumber] = useState("");
  const [manualAccountNumber, setManualAccountNumber] = useState("");
  const [bankAccountChoice, setBankAccountChoice] = useState<BankAccountChoice>("checking");
  const [isLoadingSetupIntent, setIsLoadingSetupIntent] = useState(false);
  const [isSavingBankAccount, setIsSavingBankAccount] = useState(false);
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

  useEffect(() => {
    setAutopayEnabled(initialAutopayEnabled);
  }, [initialAutopayEnabled]);

  useEffect(() => {
    setBillingName(defaultBillingName);
  }, [defaultBillingName]);

  useEffect(() => {
    setBankEmail(customerEmail ?? "");
  }, [customerEmail]);

  useEffect(() => {
    setSelectedMethodId(defaultPaymentMethodId ?? savedPaymentMethods[0]?.id ?? null);
  }, [defaultPaymentMethodId, savedPaymentMethods]);

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

  async function beginAddPaymentMethod(mode: Exclude<SetupMode, null>) {
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
      body: JSON.stringify({ paymentMethodType: mode === "bank" ? "us_bank_account" : "card" }),
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

  async function completeBankSetup(setupIntentId: string, successMessage: string) {
    const completeResponse = await fetch("/api/renter/payments/setup-intent/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupIntentId }),
    });
    const completePayload = (await completeResponse.json().catch(() => null)) as { error?: string } | null;

    if (!completeResponse.ok) {
      throw new Error(completePayload?.error ?? "Unable to save this bank account.");
    }

    setScopedFeedback("methods", "success", successMessage);
    router.refresh();
  }

  async function handleAddBankAccount(entryMode: AchEntryMode = achEntryMode) {
    clearFeedback("methods");

    if (!stripeConfigured) {
      setScopedFeedback("methods", "error", "Stripe is not configured yet for this environment.");
      return;
    }

    const billingError = validateBankBillingFields({
      billingName,
      bankEmail,
      bankAddressLine1,
      bankCity,
      bankState,
      bankPostalCode,
      achEntryMode: entryMode,
    });
    if (billingError) {
      setScopedFeedback("methods", "error", billingError);
      return;
    }

    const stripe = await stripePromise;
    if (!stripe) {
      setScopedFeedback("methods", "error", "Stripe could not be loaded in the browser.");
      return;
    }

    setIsSavingBankAccount(true);

    try {
      const response = await fetch("/api/renter/payments/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodType: "us_bank_account" }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { clientSecret?: string; error?: string }
        | null;

      if (!response.ok || !payload?.clientSecret) {
        throw new Error(payload?.error ?? "Unable to prepare bank account setup.");
      }

      if (entryMode === "link") {
        const collectResult = await stripe.collectBankAccountForSetup({
          clientSecret: payload.clientSecret,
          params: {
            payment_method_type: "us_bank_account",
            payment_method_data: {
              billing_details: {
                name: billingName.trim(),
                email: bankEmail.trim(),
                address: {
                  line1: bankAddressLine1.trim(),
                  city: bankCity.trim(),
                  state: bankState.trim(),
                  postal_code: bankPostalCode.trim(),
                  country: "US",
                },
              },
            },
          },
        });

        if (collectResult.error) {
          throw new Error(collectResult.error.message ?? "Unable to collect bank account details.");
        }

        const confirmResult = await stripe.confirmUsBankAccountSetup(payload.clientSecret);
        if (confirmResult.error) {
          if (isDismissedBankLinkError(confirmResult.error.message ?? "")) {
            return;
          }

          throw new Error(confirmResult.error.message ?? "Unable to save this bank account.");
        }

        if (!confirmResult.setupIntent?.id) {
          throw new Error("Stripe did not return a completed bank account setup.");
        }

        await completeBankSetup(confirmResult.setupIntent.id, "Bank account linked successfully.");
      } else {
        if (!manualRoutingNumber.trim() || !manualAccountNumber.trim()) {
          throw new Error("Routing number and account number are required for manual bank entry.");
        }

        const confirmResult = await stripe.confirmUsBankAccountSetup(payload.clientSecret, {
          payment_method: {
            billing_details: {
              name: billingName.trim(),
              email: bankEmail.trim(),
              address: {
                line1: bankAddressLine1.trim(),
                city: bankCity.trim(),
                state: bankState.trim(),
                postal_code: bankPostalCode.trim(),
                country: "US",
              },
            },
            us_bank_account: {
              routing_number: manualRoutingNumber.trim(),
              account_number: manualAccountNumber.trim(),
              account_holder_type: "individual",
              account_type: bankAccountChoice,
            },
          },
        });

        if (confirmResult.error) {
          throw new Error(confirmResult.error.message ?? "Unable to save this bank account.");
        }

        if (!confirmResult.setupIntent?.id) {
          throw new Error("Stripe did not return a completed manual bank setup.");
        }

        await completeBankSetup(confirmResult.setupIntent.id, "Bank account added successfully.");
      }
    } catch (error) {
      setScopedFeedback(
        "methods",
        "error",
        error instanceof Error ? error.message : "Unable to save this bank account.",
      );
    } finally {
      setIsSavingBankAccount(false);
    }
  }

  async function handlePayNow() {
    clearFeedback("pay");

    if (!stripeConfigured) {
      setScopedFeedback("pay", "error", "Stripe is not configured yet for this environment.");
      return;
    }

    if (!selectedCharge) {
      setScopedFeedback("pay", "error", "Choose an outstanding charge before paying.");
      return;
    }

    if (!selectedMethod) {
      setScopedFeedback("pay", "error", "Add a saved payment method before paying online.");
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
      payment_method: selectedMethod.stripePaymentMethodId,
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
            {savedPaymentMethods.length > 0 ? "Saved securely through Stripe." : "Add a payment method to pay online."}
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
            <h2 className="font-semibold text-slate-900">Saved Payment Method</h2>
            <p className="mt-1 text-sm text-slate-500">Use one of your securely stored payment methods.</p>
            <div className="mt-5 space-y-3">
              {savedPaymentMethods.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Add a saved payment method in the Payment Methods tab before paying online.
                </p>
              ) : (
                savedPaymentMethods.map((method) => {
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
                        <p className="font-medium text-slate-900">
                          {formatMethodLabel(method)}
                        </p>
                        <p className="text-sm text-slate-500">{formatMethodMeta(method)}</p>
                      </div>
                      {method.isDefault ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          Default
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Selected charge</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {selectedCharge ? formatCurrency(selectedCharge.amount) : "No charge selected"}
              </p>
            </div>

            <button
              type="button"
              onClick={handlePayNow}
              disabled={isPaying || !selectedCharge || !selectedMethod || !stripeConfigured}
              className="mt-5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPaying
                ? "Processing..."
                : selectedCharge
                  ? `Pay ${formatCurrency(selectedCharge.amount)}`
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
                  Cards and bank accounts are collected and tokenized by Stripe. Raw payment details never touch this app.
                </p>
                <p className="mt-3 text-sm text-slate-500">
                  Add a new card or connect a bank account with the fewest possible steps.
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
                  onClick={() => {
                    clearFeedback("methods");
                    setSetupClientSecret(null);
                    setSetupMode("bank");
                  }}
                  disabled={!stripeConfigured}
                  className={[
                    "rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-slate-100",
                    setupMode === "bank"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  Add New Bank Account
                </button>
              </div>
            </div>
            {!setupClientSecret && setupMode !== "bank" ? (
              <p className="mt-4 text-sm text-slate-500">
                `Add New Credit Card` opens the secure Stripe card form below. `Add New Bank Account` starts the ACH setup flow.
              </p>
            ) : null}

            {!stripeConfigured ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to enable online payments.
              </div>
            ) : null}

            {feedback?.scope === "methods" ? (
              <div className="mt-5">
                <FeedbackMessage message={feedback.message} tone={feedback.tone} />
              </div>
            ) : null}

            {setupMode === "bank" ? (
              <div ref={addMethodPanelRef} className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-slate-900">Add Bank Account</h3>
                  <p className="mt-1 text-sm text-slate-600">Link instantly with Stripe or enter routing details manually.</p>
                </div>

                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Choose how you want to continue.</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAchEntryMode("link");
                          void handleAddBankAccount("link");
                        }}
                        disabled={isSavingBankAccount || !stripeConfigured}
                        className="flex items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-6 py-5 text-left text-lg font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <PaymentTypeIcon type="bank" />
                        <span>{isSavingBankAccount && achEntryMode === "link" ? "Opening Stripe..." : "Link Bank Account"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearFeedback("methods");
                          setAchEntryMode("manual");
                        }}
                        className={[
                          "flex items-center justify-center gap-3 rounded-2xl border px-6 py-5 text-left text-lg font-semibold transition",
                          achEntryMode === "manual"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100",
                        ].join(" ")}
                      >
                        <PaymentTypeIcon type="bank" />
                        <span>Add Manually</span>
                      </button>
                    </div>
                  </div>

                  {achEntryMode === "manual" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="block text-xs font-semibold text-slate-600">Routing Number</span>
                        <input
                          type="text"
                          value={manualRoutingNumber}
                          onChange={(event) => setManualRoutingNumber(event.target.value)}
                          placeholder="110000000"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs font-semibold text-slate-600">Account Number</span>
                        <input
                          type="text"
                          value={manualAccountNumber}
                          onChange={(event) => setManualAccountNumber(event.target.value)}
                          placeholder="000123456789"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </label>
                      <div className="space-y-1 md:col-span-2">
                        <span className="block text-xs font-semibold text-slate-600">Account Type</span>
                        <div className="flex gap-2">
                          {(["checking", "savings"] as const).map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setBankAccountChoice(option)}
                              className={[
                                "flex-1 rounded-xl border py-2.5 text-sm font-semibold transition",
                                bankAccountChoice === option
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                              ].join(" ")}
                            >
                              {option === "checking" ? "Checking" : "Savings"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="space-y-1 md:col-span-2">
                        <span className="block text-xs font-semibold text-slate-600">Account Holder Name</span>
                        <input
                          type="text"
                          value={billingName}
                          onChange={(event) => setBillingName(event.target.value)}
                          placeholder="John Doe"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </label>
                      <label className="space-y-1 md:col-span-2">
                        <span className="block text-xs font-semibold text-slate-600">Email</span>
                        <input
                          type="email"
                          value={bankEmail}
                          onChange={(event) => setBankEmail(event.target.value)}
                          placeholder="you@example.com"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </label>
                      <label className="space-y-1 md:col-span-2">
                        <span className="block text-xs font-semibold text-slate-600">Street Address</span>
                        <input
                          type="text"
                          value={bankAddressLine1}
                          onChange={(event) => setBankAddressLine1(event.target.value)}
                          placeholder="123 Main St"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-xs font-semibold text-slate-600">City</span>
                        <input
                          type="text"
                          value={bankCity}
                          onChange={(event) => setBankCity(event.target.value)}
                          placeholder="New York"
                          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </label>
                      <div className="flex gap-2">
                        <label className="w-20 shrink-0 space-y-1">
                          <span className="block text-xs font-semibold text-slate-600">State</span>
                          <input
                            type="text"
                            value={bankState}
                            onChange={(event) => setBankState(event.target.value)}
                            placeholder="NY"
                            maxLength={2}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm uppercase text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </label>
                        <label className="min-w-0 flex-1 space-y-1">
                          <span className="block text-xs font-semibold text-slate-600">ZIP</span>
                          <input
                            type="text"
                            value={bankPostalCode}
                            onChange={(event) => setBankPostalCode(event.target.value)}
                            placeholder="10001"
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  {achEntryMode === "manual" ? (
                    <button
                      type="button"
                      onClick={() => void handleAddBankAccount("manual")}
                      disabled={isSavingBankAccount || !stripeConfigured}
                      className="flex-1 rounded-2xl bg-emerald-500 px-6 py-5 text-lg font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isSavingBankAccount ? "Saving Bank Account..." : "Save Bank Account"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSetupMode(null)}
                    className="rounded-2xl border border-slate-300 px-6 py-5 text-lg font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
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
                      <p className="text-sm text-slate-500">{formatMethodMeta(method)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
                disabled={isUpdatingAutopay}
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
                    ? `Future charges can use ${formatMethodLabel(selectedMethod)}.`
                    : "Select a default saved payment method before enabling auto-pay."}
                </p>
              </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
