import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";
import { getTenantPaymentProfile } from "@/lib/renter-payments";
import { buildMonthlyBreakdown } from "@/lib/rent-credit";
import { PaymentsClient } from "./PaymentsClient";

type SavedPaymentMethodView = {
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

function formatSavedMethodLabel(method: {
  paymentType: string;
  brand: string | null;
  bankName: string | null;
  last4: string;
}) {
  if (method.paymentType === "us_bank_account") {
    return `${method.bankName ?? "Bank account"} ending in ${method.last4}`;
  }

  const brand = method.brand ? method.brand.charAt(0).toUpperCase() + method.brand.slice(1) : "Card";
  return `${brand} ending in ${method.last4}`;
}

function isSubmittedAttemptStatus(status: string | null | undefined) {
  return Boolean(status && !["requires_payment_method", "canceled", "failed"].includes(status));
}

function isPaidAttemptStatus(status: string | null | undefined) {
  return status === "succeeded";
}

function isPaidPayment(payment: {
  status: string;
  paid_at: Date | null;
  payment_attempts: { status: string }[];
}) {
  return (
    payment.status === "paid" ||
    payment.status === "completed" ||
    Boolean(payment.paid_at) ||
    isPaidAttemptStatus(payment.payment_attempts[0]?.status)
  );
}

function getChargeKey(payment: {
  amount: { toFixed(scale?: number): string };
  type: string;
  due_date: Date | null;
}) {
  if (!payment.due_date) return null;
  return `${payment.type}:${payment.due_date.toISOString().slice(0, 10)}:${payment.amount.toFixed(2)}`;
}

function getPaidChargeKeys<
  T extends {
    amount: { toFixed(scale?: number): string };
    type: string;
    status: string;
    due_date: Date | null;
    paid_at: Date | null;
    payment_attempts: { status: string }[];
  },
>(payments: T[]) {
  return new Set(
    payments
      .filter(isPaidPayment)
      .map(getChargeKey)
      .filter((key): key is string => Boolean(key)),
  );
}

function isPayablePayment(
  payment: {
    amount: { toFixed(scale?: number): string };
    type: string;
    status: string;
    due_date: Date | null;
    paid_at: Date | null;
    payment_attempts: { status: string }[];
  },
  paidChargeKeys: Set<string>,
) {
  if (payment.status !== "pending") return false;
  if (isPaidPayment(payment)) return false;
  if (isSubmittedAttemptStatus(payment.payment_attempts[0]?.status)) return false;

  const chargeKey = getChargeKey(payment);
  return !chargeKey || !paidChargeKeys.has(chargeKey);
}

export default async function RenterPaymentsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const identity = await resolveSharedUserIdentity(userId);
  const tenant = identity.email
    ? await prisma.tenants.findFirst({
      where: {
        email: identity.email,
        deleted_at: null,
        ...(identity.sharedUser?.organization_id
          ? { organization_id: identity.sharedUser.organization_id }
          : {}),
      },
      select: {
        id: true,
        first_name: true,
        organization_id: true,
        lease_tenants: {
          select: {
            leases: {
              select: {
                rent_amount: true,
                status: true,
                payments: {
                  orderBy: { due_date: "desc" },
                  select: {
                    id: true,
                    amount: true,
                    type: true,
                    status: true,
                    due_date: true,
                    paid_at: true,
                    payment_method: true,
                    notes: true,
                    payment_attempts: {
                      orderBy: { created_at: "desc" },
                      take: 1,
                      select: {
                        status: true,
                        renter_payment_methods: {
                          select: {
                            payment_type: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    : null;

  const paymentProfile = tenant
    ? await getTenantPaymentProfile({
        userId,
        tenantId: tenant.id,
        organizationId: tenant.organization_id,
        sharedUserId: identity.sharedUser?.id ?? null,
      })
    : null;
  const savedPaymentMethods: SavedPaymentMethodView[] =
    paymentProfile?.paymentMethods.map((method) => ({
      ...method,
      paymentProvider: method.paymentProvider === "plaid" ? "plaid" : "stripe",
      paymentType: method.paymentType === "us_bank_account" ? "us_bank_account" : "card",
    })) ?? [];
  const stripePaymentMethods = savedPaymentMethods.filter((method) => method.paymentProvider === "stripe");

  const allPayments =
    tenant?.lease_tenants.flatMap((lt) => lt.leases.payments) ?? [];

  const paidPayments = allPayments.filter(isPaidPayment);
  const paidChargeKeys = getPaidChargeKeys(allPayments);
  const pendingPayments = allPayments.filter((payment) => isPayablePayment(payment, paidChargeKeys));
  const totalPaid = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const defaultPaymentMethodId = paymentProfile?.renter_payment_settings?.default_payment_method_id ?? null;
  const defaultMethod =
    stripePaymentMethods.find((method) => method.id === defaultPaymentMethodId) ??
    stripePaymentMethods.find((method) => method.isDefault) ??
    null;
  const latestMethod = defaultMethod
    ? formatSavedMethodLabel(defaultMethod)
    : allPayments.find((payment) => payment.payment_method)?.payment_method ?? null;
  const nextPending = pendingPayments.find((payment) => payment.due_date) ?? pendingPayments[0] ?? null;

  // Monthly rent breakdown — surfaced only when a credit is in effect on the lease.
  const leases = tenant?.lease_tenants.map((lt) => lt.leases) ?? [];
  const breakdownLease =
    leases.find((lease) => lease.payments.some((p) => p.type === "rent")) ?? leases[0] ?? null;
  const monthlyBreakdown = breakdownLease
    ? buildMonthlyBreakdown(
        Number(breakdownLease.rent_amount),
        breakdownLease.payments
          .filter((p) => p.type === "rent")
          .map((p) => ({ amount: Number(p.amount), dueDate: p.due_date?.toISOString() ?? null })),
      )
    : [];
  const hasRentCredit = monthlyBreakdown.some((row) => row.creditApplied > 0);
  return (
    <PaymentsClient
        currentBalance={totalPending}
        totalPaid={totalPaid}
        autopayEnabled={paymentProfile?.renter_payment_settings?.autopay_enabled ?? false}
        monthlyBreakdown={hasRentCredit ? monthlyBreakdown : []}
        defaultPaymentMethodId={defaultMethod?.id ?? null}
        paymentMethod={latestMethod}
        nextDueDate={nextPending?.due_date?.toISOString() ?? null}
        payments={allPayments.map((payment) => ({
          id: payment.id,
          amount: Number(payment.amount),
          type: payment.type,
          status: payment.status,
          dueDate: payment.due_date?.toISOString() ?? null,
          paidAt: payment.paid_at?.toISOString() ?? null,
          paymentMethod: payment.payment_method ?? null,
          notes: payment.notes ?? null,
          latestAttemptStatus: payment.payment_attempts[0]?.status ?? null,
          latestAttemptMethodType:
            payment.payment_attempts[0]?.renter_payment_methods?.payment_type === "us_bank_account"
              ? "us_bank_account"
              : payment.payment_attempts[0]?.renter_payment_methods?.payment_type
                ? "card"
                : null,
        }))}
        savedPaymentMethods={savedPaymentMethods}
        stripePublishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
    />
  );
}
