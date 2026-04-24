import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { RenterShell } from "@/components/RenterShell";
import { getPortalAccessState } from "@/lib/portal-access";
import { getRenterSupportContact } from "@/lib/renter-portal";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";
import { MessagesClient } from "./MessagesClient";

export default async function RenterMessagesPage() {
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
        maintenance_requests: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            title: true,
            status: true,
            scheduled_date: true,
            updated_at: true,
          },
        },
        payments: {
          where: { status: "pending" },
          orderBy: { due_date: "asc" },
          take: 1,
          select: {
            amount: true,
            due_date: true,
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

  if (!tenant) {
    redirect("/renter");
  }

  const support = await getRenterSupportContact(tenant.organization_id);
  const recentMaintenance = tenant.maintenance_requests[0] ?? null;
  const pendingPayment = tenant.payments[0] ?? null;
  const welcomeSentAt = recentMaintenance?.updated_at.toISOString() ?? "2026-04-18T10:30:00.000Z";
  const paymentReminderSentAt = pendingPayment?.due_date
    ? new Date(new Date(pendingPayment.due_date).getTime() - 1000 * 60 * 60 * 24).toISOString()
    : "2026-04-20T09:00:00.000Z";

  const seededMessages = [
    recentMaintenance
      ? {
          id: "maintenance-update",
          sender: "manager" as const,
          body: recentMaintenance.scheduled_date
            ? `Your request "${recentMaintenance.title}" is ${recentMaintenance.status.replace("_", " ")}. We have it scheduled for ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(recentMaintenance.scheduled_date))}.`
            : `We received your request "${recentMaintenance.title}" and the team is reviewing it now.`,
          sentAt: recentMaintenance.updated_at.toISOString(),
        }
      : null,
    {
      id: "welcome-thread",
      sender: "manager" as const,
      body: `Hi${tenant.first_name ? ` ${tenant.first_name}` : ""}! Message us here any time you need help with rent, lease questions, or maintenance.`,
      sentAt: welcomeSentAt,
    },
    pendingPayment
      ? {
          id: "payment-reminder",
          sender: "manager" as const,
          body: `Friendly reminder that your next payment of ${new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(Number(pendingPayment.amount))} is coming up${pendingPayment.due_date ? ` on ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(pendingPayment.due_date))}` : ""}.`,
          sentAt: paymentReminderSentAt,
        }
      : null,
  ].filter(Boolean);

  return (
    <RenterShell user={shellUser}>
      <MessagesClient
        initialMessages={seededMessages}
        managerName={support.managerName ?? support.organizationName ?? "Property Manager"}
        organizationName={support.organizationName}
        emergencyPhone={support.organizationPhone}
        managerPhone={support.organizationPhone}
        managerEmail={support.managerEmail ?? support.organizationEmail}
      />
    </RenterShell>
  );
}
