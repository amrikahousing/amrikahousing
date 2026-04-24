import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { RenterShell } from "@/components/RenterShell";
import { getPortalAccessState } from "@/lib/portal-access";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";
import { PaymentsClient } from "./PaymentsClient";

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

  const allPayments =
    tenant?.lease_tenants.flatMap((lt) => lt.leases.payments) ?? [];

  const paidPayments = allPayments.filter(
    (p) => p.status === "paid" || p.status === "completed",
  );
  const pendingPayments = allPayments.filter((p) => p.status === "pending");
  const totalPaid = paidPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const latestMethod =
    allPayments.find((payment) => payment.payment_method)?.payment_method ?? null;
  const nextPending = pendingPayments.find((payment) => payment.due_date) ?? pendingPayments[0] ?? null;
  const rentAmount = tenant?.lease_tenants[0]?.leases.rent_amount
    ? Number(tenant.lease_tenants[0].leases.rent_amount)
    : null;

  return (
    <RenterShell user={shellUser}>
      <PaymentsClient
        currentBalance={totalPending}
        totalPaid={totalPaid}
        paymentMethod={latestMethod}
        nextDueDate={nextPending?.due_date?.toISOString() ?? null}
        rentAmount={rentAmount}
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
      />
    </RenterShell>
  );
}
