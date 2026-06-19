import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";
import { sendSms, toE164, smsStatusCallbackUrl, type SendResult } from "@/lib/messaging";

type NamedParts = { first_name?: string | null; last_name?: string | null } | null | undefined;

function fullName(parts: NamedParts): string | null {
  if (!parts) return null;
  const name = [parts.first_name, parts.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

type RecipientType = "maintenance_staff" | "property_manager" | "owner" | "admin" | "tenant";

/**
 * Escalation chain for "who to text" when a new maintenance request comes in.
 * Resolves the FIRST reachable contact in priority order:
 *   1. maintenance staff assigned to the property
 *   2. a property_manager-role user assigned to the property
 *   3. an owner / landlord of the property
 *   4. an org admin (final catch-all)
 * Each candidate phone is normalized to E.164; returns null if none usable.
 *
 * Tiers 1 & 2 resolve from real `users` rows assigned via `property_assignments`
 * (consistent with Access Management), NOT the free-text contact columns on the
 * property — those are display-only and can be stale.
 */
async function resolveCreationRecipient(
  requestId: string,
  organizationId: string,
): Promise<{ phone: string; recipientType: RecipientType; name: string | null } | null> {
  const req = await prisma.maintenance_requests.findFirst({
    where: { id: requestId, organization_id: organizationId },
    select: {
      units: { select: { property_id: true } },
    },
  });
  if (!req) return null;

  const propertyId = req.units.property_id;

  // Tier 1 — maintenance staff assigned to this property
  const staffAssignment = await prisma.property_assignments.findFirst({
    where: {
      property_id: propertyId,
      users: { role: "maintenance_staff", is_active: true, phone: { not: null } },
    },
    select: {
      users: { select: { phone: true, first_name: true, last_name: true } },
    },
  });
  const staffPhone = toE164(staffAssignment?.users.phone);
  if (staffPhone) {
    return { phone: staffPhone, recipientType: "maintenance_staff", name: fullName(staffAssignment?.users) };
  }

  // Tier 2 — property_manager-role user assigned to this property
  const pmAssignment = await prisma.property_assignments.findFirst({
    where: {
      property_id: propertyId,
      users: { role: "property_manager", is_active: true, phone: { not: null } },
    },
    select: {
      users: { select: { phone: true, first_name: true, last_name: true } },
    },
  });
  const pmPhone = toE164(pmAssignment?.users.phone);
  if (pmPhone) {
    return { phone: pmPhone, recipientType: "property_manager", name: fullName(pmAssignment?.users) };
  }

  // Tier 3 — owner / landlord
  const ownership = await prisma.property_ownerships.findFirst({
    where: { property_id: propertyId, owners: { phone: { not: null } } },
    select: { owners: { select: { phone: true, first_name: true, last_name: true } } },
  });
  const ownerPhone = toE164(ownership?.owners.phone);
  if (ownerPhone) {
    return { phone: ownerPhone, recipientType: "owner", name: fullName(ownership?.owners) };
  }

  // Tier 4 — org admin
  const admin = await prisma.users.findFirst({
    where: { organization_id: organizationId, role: "admin", is_active: true, phone: { not: null } },
    select: { phone: true, first_name: true, last_name: true },
  });
  const adminPhone = toE164(admin?.phone);
  if (adminPhone) {
    return { phone: adminPhone, recipientType: "admin", name: fullName(admin) };
  }

  return null;
}

async function logNotification(input: {
  organizationId: string;
  tenantId?: string | null;
  recipientType: RecipientType | null;
  toPhone: string;
  body: string;
  relatedType?: string | null;
  relatedId?: string | null;
  result?: SendResult;
  status?: string;
}) {
  const status = input.result ? input.result.status : input.status ?? "skipped";
  const providerSid = input.result?.status === "sent" ? input.result.sid : null;
  // Persist the failure/skip reason so problems are diagnosable from the DB
  // rather than only from server logs ("sent" results carry no reason).
  const errorReason =
    input.result && input.result.status !== "sent" ? input.result.reason : null;
  try {
    await prisma.notifications_sent.create({
      data: {
        organization_id: input.organizationId,
        tenant_id: input.tenantId ?? null,
        channel: "sms",
        recipient_type: input.recipientType ?? null,
        to_phone: input.toPhone,
        body: input.body,
        provider_sid: providerSid,
        status,
        error_reason: errorReason,
        related_type: input.relatedType ?? null,
        related_id: input.relatedId ?? null,
      },
    });
  } catch (err) {
    // Logging must never break the notification flow.
    console.error("[notifications] failed to write notifications_sent", err);
  }
}

/**
 * New maintenance request → text the property's first reachable manager/owner/admin.
 */
export const notifyMaintenanceCreated = inngest.createFunction(
  {
    id: "notify-maintenance-created",
    name: "Notify on maintenance request created",
    triggers: [{ event: "maintenance/request.created" }],
  },
  async ({ event }) => {
    const { requestId, organizationId } = event.data as {
      requestId: string;
      organizationId: string;
    };

    const req = await prisma.maintenance_requests.findFirst({
      where: { id: requestId, organization_id: organizationId },
      select: {
        title: true,
        priority: true,
        tenants: { select: { first_name: true, last_name: true } },
      },
    });
    if (!req) return { skipped: "request_not_found" };

    const recipient = await resolveCreationRecipient(requestId, organizationId);
    const submitter = fullName(req.tenants) ?? "a tenant";
    const body =
      `New maintenance request${req.priority === "emergency" ? " (EMERGENCY)" : ""}: ` +
      `"${req.title}" submitted by ${submitter}.`;

    if (!recipient) {
      await logNotification({
        organizationId,
        recipientType: null,
        toPhone: "",
        body,
        relatedType: "maintenance_request",
        relatedId: requestId,
        status: "skipped",
      });
      return { skipped: "no_recipient" };
    }

    const result = await sendSms({ to: recipient.phone, body, statusCallback: smsStatusCallbackUrl() });
    await logNotification({
      organizationId,
      recipientType: recipient.recipientType,
      toPhone: recipient.phone,
      body,
      relatedType: "maintenance_request",
      relatedId: requestId,
      result,
    });
    return result;
  },
);

function buildStatusBody(title: string, toStatus: string, note?: string | null): string {
  const map: Record<string, string> = {
    in_progress: `Your maintenance request "${title}" is now in progress.`,
    pending_acceptance: `Work on your maintenance request "${title}" is complete — please confirm it in the app.`,
    completed: `Your maintenance request "${title}" has been completed.`,
    rejected: `Your maintenance request "${title}" has been closed.`,
  };
  const base = map[toStatus] ?? `Update on your maintenance request "${title}".`;
  const trimmedNote = note?.trim();
  return trimmedNote ? `${base} ${trimmedNote}` : base;
}

/**
 * Maintenance status change → text the tenant who submitted it.
 */
export const notifyMaintenanceStatusChanged = inngest.createFunction(
  {
    id: "notify-maintenance-status-changed",
    name: "Notify tenant on maintenance status change",
    triggers: [{ event: "maintenance/status.changed" }],
  },
  async ({ event }) => {
    const { requestId, organizationId, toStatus, note } = event.data as {
      requestId: string;
      organizationId: string;
      toStatus: string;
      note?: string | null;
    };

    const req = await prisma.maintenance_requests.findFirst({
      where: { id: requestId, organization_id: organizationId },
      select: {
        title: true,
        tenants: { select: { id: true, phone: true } },
      },
    });
    if (!req?.tenants) return { skipped: "no_tenant" };

    const body = buildStatusBody(req.title, toStatus, note);
    const phone = toE164(req.tenants.phone);

    if (!phone) {
      await logNotification({
        organizationId,
        tenantId: req.tenants.id,
        recipientType: "tenant",
        toPhone: req.tenants.phone ?? "",
        body,
        relatedType: "maintenance_request",
        relatedId: requestId,
        status: "skipped",
      });
      return { skipped: "invalid_phone" };
    }

    const result = await sendSms({ to: phone, body, statusCallback: smsStatusCallbackUrl() });
    await logNotification({
      organizationId,
      tenantId: req.tenants.id,
      recipientType: "tenant",
      toPhone: phone,
      body,
      relatedType: "maintenance_request",
      relatedId: requestId,
      result,
    });
    return result;
  },
);
