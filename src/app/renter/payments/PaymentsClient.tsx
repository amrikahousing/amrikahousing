"use client";

import { useMemo, useState } from "react";

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

type Props = {
  currentBalance: number;
  totalPaid: number;
  paymentMethod: string | null;
  nextDueDate: string | null;
  rentAmount: number | null;
  payments: PaymentRow[];
};

type PaymentTab = "overview" | "pay" | "autopay";
type SavedPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  cardholder: string;
};

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
    maximumFractionDigits: 0,
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

export function PaymentsClient({
  currentBalance,
  totalPaid,
  paymentMethod,
  nextDueDate,
  rentAmount,
  payments,
}: Props) {
  const [tab, setTab] = useState<PaymentTab>("overview");
  const [amount, setAmount] = useState(currentBalance || rentAmount || 0);
  const [autopayEnabled, setAutopayEnabled] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [savedMethods, setSavedMethods] = useState<SavedPaymentMethod[]>(
    paymentMethod
      ? [
          {
            id: "existing-method",
            brand: paymentMethod.split(" ").at(0) ?? "Card",
            last4: /\d{4}$/.exec(paymentMethod)?.[0] ?? "4242",
            expiry: "12/27",
            cardholder: "Primary Cardholder",
          },
        ]
      : [],
  );
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(
    paymentMethod ? "existing-method" : null,
  );
  const activePaymentMethod =
    savedMethods.find((method) => method.id === selectedMethodId) ?? savedMethods[0] ?? null;

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

  function formatCardNumber(value: string) {
    return value
      .replace(/\D/g, "")
      .slice(0, 16)
      .replace(/(.{4})/g, "$1 ")
      .trim();
  }

  function formatExpiry(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  function addPaymentMethod() {
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length < 12 || expiryDate.length < 4 || cvc.length < 3 || !cardholderName.trim()) {
      return;
    }

    const nextMethod: SavedPaymentMethod = {
      id: `method-${Date.now()}`,
      brand: digits.startsWith("4") ? "Visa" : digits.startsWith("5") ? "Mastercard" : "Card",
      last4: digits.slice(-4),
      expiry: expiryDate,
      cardholder: cardholderName.trim(),
    };

    setSavedMethods((current) => [nextMethod, ...current.filter((method) => method.last4 !== nextMethod.last4)]);
    setSelectedMethodId(nextMethod.id);
    setCardNumber("");
    setExpiryDate("");
    setCvc("");
    setCardholderName("");
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Payments</h1>
        <p className="mt-1 text-slate-500">Manage your rent payments and payment settings.</p>
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
            {autopayEnabled ? "Next payment is scheduled automatically." : "Manual payments are currently enabled."}
          </p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Payment Method</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{paymentMethod ?? "No method"}</p>
          <p className="mt-1 text-sm text-slate-500">
            {paymentMethod ? "Default method on file." : "Add a payment method with management."}
          </p>
        </article>
      </section>

      <div className="grid gap-2 rounded-xl bg-slate-800 p-1 text-sm font-medium text-slate-300 md:grid-cols-3">
        {[
          ["overview", "Overview"],
          ["pay", "Make Payment"],
          ["autopay", "Setup Auto-Pay"],
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
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Make a Payment</h2>
          <p className="mt-1 text-sm text-slate-500">Use the amount on file to prepare your payment.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-700">Amount</span>
              <input
                type="number"
                value={amount}
                min={0}
                onChange={(event) => setAmount(Number(event.target.value))}
                className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </label>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-slate-700">Payment Method</span>
              <div className="rounded-lg border border-slate-300 px-3 py-3 text-sm text-slate-700">
                {activePaymentMethod
                  ? `${activePaymentMethod.brand} ending in ${activePaymentMethod.last4}`
                  : "No payment method saved"}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="mt-5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Pay {formatCurrency(amount)}
          </button>
        </section>
      ) : null}

      {tab === "autopay" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900">Payment Methods</h2>
            <p className="mt-1 text-sm text-slate-500">Add or manage your payment methods.</p>

            <div className="mt-6 space-y-4">
              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-slate-700">Card Number</span>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(event) => setCardNumber(formatCardNumber(event.target.value))}
                  placeholder="4242 4242 4242 4242"
                  className="h-12 w-full rounded-lg border border-slate-300 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="block text-sm font-medium text-slate-700">Expiry Date</span>
                  <input
                    type="text"
                    value={expiryDate}
                    onChange={(event) => setExpiryDate(formatExpiry(event.target.value))}
                    placeholder="MM/YY"
                    className="h-12 w-full rounded-lg border border-slate-300 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="block text-sm font-medium text-slate-700">CVC</span>
                  <input
                    type="text"
                    value={cvc}
                    onChange={(event) => setCvc(event.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="123"
                    className="h-12 w-full rounded-lg border border-slate-300 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </label>
              </div>

              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-slate-700">Cardholder Name</span>
                <input
                  type="text"
                  value={cardholderName}
                  onChange={(event) => setCardholderName(event.target.value)}
                  placeholder="John Doe"
                  className="h-12 w-full rounded-lg border border-slate-300 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>

              <button
                type="button"
                onClick={addPaymentMethod}
                className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                Add Payment Method
              </button>
            </div>

            {savedMethods.length > 0 ? (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Saved Methods</h3>
                {savedMethods.map((method) => {
                  const isActive = activePaymentMethod?.id === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedMethodId(method.id)}
                      className={[
                        "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                        isActive
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {method.brand} ending in {method.last4}
                        </p>
                        <p className="text-sm text-slate-500">
                          Expires {method.expiry} · {method.cardholder}
                        </p>
                      </div>
                      {isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          Default
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-900">Auto-Pay Settings</h2>
                <p className="mt-1 text-sm text-slate-500">Automatically pay rent each month.</p>
              </div>
              <button
                type="button"
                onClick={() => setAutopayEnabled((value) => !value)}
                className={[
                  "relative mt-1 inline-flex h-8 w-14 items-center rounded-full transition-colors",
                  autopayEnabled ? "bg-emerald-500" : "bg-slate-300",
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

            <div className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-4">
              <div>
                <p className="font-medium text-slate-900">Enable Auto-Pay</p>
                <p className="mt-1 text-sm text-slate-500">
                  Automatically charge on the 1st of each month using{" "}
                  {activePaymentMethod
                    ? `${activePaymentMethod.brand} ending in ${activePaymentMethod.last4}`
                    : "your default payment method"}.
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

    </div>
  );
}
