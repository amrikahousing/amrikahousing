import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { RenterShell } from "@/components/RenterShell";
import { getPortalAccessState } from "@/lib/portal-access";
import { getPlaidConfig } from "@/lib/plaid";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";
import { getTenantPaymentProfile } from "@/lib/renter-payments";
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

export default async function RenterPaymentsPage() {
  const { userId, orgId } = await auth();
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
                  },
                },
              },
            },
          },
        },
      },
    })
    : null;

  const shellUser = {
    email: identity.sharedUser?.email ?? identity.clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    firstName: identity.sharedUser?.first_name ?? identity.clerkUser?.firstName ?? tenant?.first_name ?? null,
    imageUrl: identity.clerkUser?.imageUrl ?? null,
    portal: "renter" as const,
    ...(await getPortalAccessState({
      userId,
      orgId,
      email: identity.sharedUser?.email ?? identity.clerkUser?.primaryEmailAddress?.emailAddress ?? null,
    })),
  };

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
  const plaidConfigured = !("error" in getPlaidConfig());

  const allPayments =
    tenant?.lease_tenants.flatMap((lt) => lt.leases.payments) ?? [];

  const paidPayments = allPayments.filter(
    (p) => p.status === "paid" || p.status === "completed",
  );
  const pendingPayments = allPayments.filter((p) => p.status === "pending");
  const totalPaid = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const defaultMethod = savedPaymentMethods.find((method) => method.isDefault) ?? null;
  const latestMethod = defaultMethod
    ? formatSavedMethodLabel(defaultMethod)
    : allPayments.find((payment) => payment.payment_method)?.payment_method ?? null;
  const nextPending = pendingPayments.find((payment) => payment.due_date) ?? pendingPayments[0] ?? null;
  return (
    <RenterShell user={shellUser}>
      <PaymentsClient
        currentBalance={totalPending}
        totalPaid={totalPaid}
        autopayEnabled={paymentProfile?.renter_payment_settings?.autopay_enabled ?? false}
        defaultPaymentMethodId={paymentProfile?.renter_payment_settings?.default_payment_method_id ?? null}
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
        }))}
        savedPaymentMethods={savedPaymentMethods}
        plaidConfigured={plaidConfigured}
        stripePublishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
      />
    </RenterShell>
  );
}
