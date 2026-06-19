import { put } from "@vercel/blob";
import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { getBlobToken } from "@/lib/blob-token";
import { prisma } from "@/lib/db";
import { buildRentPaymentDueDates } from "@/lib/lease-payments";
import {
  sendLeaseForSignature,
  type LeaseSignatureRecipient,
} from "@/lib/lease-signatures";
import { extractLeaseSchema, generateLease, type ExtractedLeaseSchema } from "@/lib/fill-lease";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/jpg"]);
const MAX_BYTES = 20 * 1024 * 1024;

type AdditionalTenantInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
};

function formatDateToken(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function fullName(firstName: string, lastName: string) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function parseAdditionalTenants(raw: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is Record<string, unknown> => t !== null && typeof t === "object")
      .map((t) => ({
        firstName: typeof t.firstName === "string" ? t.firstName.trim() : "",
        lastName: typeof t.lastName === "string" ? t.lastName.trim() : "",
        email: typeof t.email === "string" ? t.email.trim().toLowerCase() : "",
        phone: typeof t.phone === "string" ? t.phone.trim() : undefined,
      }))
      .filter((t) => EMAIL_PATTERN.test(t.email));
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const get = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v.trim() : null;
  };

  const leaseMode = get("leaseMode") === "generate" ? "generate" : "uploaded";
  const email = get("email");
  const firstName = get("firstName");
  const lastName = get("lastName");
  const phone = get("phone");
  const propertyId = get("propertyId");
  const unitId = get("unitId");
  const startDate = get("startDate");
  const endDate = get("endDate");
  const rentAmountRaw = get("rentAmount");
  const securityDepositRaw = get("securityDeposit");
  const templateId = get("templateId");
  const testMode = get("testMode") === "true";
  const leaseFile = form.get("leaseFile");
  const parsedAdditional = parseAdditionalTenants(get("additionalTenants"));

  if (!email || !EMAIL_PATTERN.test(email)) {
    return Response.json({ error: "A valid email address is required." }, { status: 422 });
  }
  if (!firstName) {
    return Response.json({ error: "First name is required." }, { status: 422 });
  }
  if (!lastName) {
    return Response.json({ error: "Last name is required." }, { status: 422 });
  }
  if (!propertyId) {
    return Response.json({ error: "propertyId is required." }, { status: 422 });
  }
  if (!unitId) {
    return Response.json({ error: "unitId is required." }, { status: 422 });
  }
  if (!startDate) {
    return Response.json({ error: "Lease start date is required." }, { status: 422 });
  }
  if (leaseMode === "generate" && !endDate) {
    return Response.json({ error: "Lease end date is required for e-sign leases." }, { status: 422 });
  }

  const parsedRent = Number(rentAmountRaw);
  if (!rentAmountRaw || isNaN(parsedRent) || parsedRent <= 0) {
    return Response.json({ error: "A valid rent amount is required." }, { status: 422 });
  }

  const permissionError = requirePropertyPermission(ctx, "invite_renters", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const unit = await prisma.units.findFirst({
    where: {
      id: unitId,
      property_id: propertyId,
      deleted_at: null,
      properties: { organization_id: ctx.orgDbId, deleted_at: null },
    },
    select: {
      id: true,
      unit_number: true,
      status: true,
      rent_amount: true,
      bedrooms: true,
      bathrooms: true,
      square_feet: true,
      properties: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          zip: true,
          property_manager_email: true,
          organizations: {
            select: { name: true, email: true, phone: true },
          },
        },
      },
    },
  });

  if (!unit) {
    return Response.json({ error: "Unit not found." }, { status: 404 });
  }

  const normalizedEmail = email.toLowerCase();
  const parsedDeposit =
    securityDepositRaw && !isNaN(Number(securityDepositRaw)) ? Number(securityDepositRaw) : null;
  const leaseStart = new Date(startDate);
  const leaseEnd = endDate ? new Date(endDate) : null;
  if (Number.isNaN(leaseStart.getTime()) || (leaseEnd && Number.isNaN(leaseEnd.getTime()))) {
    return Response.json({ error: "Lease dates are invalid." }, { status: 422 });
  }
  if (leaseEnd && leaseEnd < leaseStart) {
    return Response.json({ error: "Lease end date must be after the start date." }, { status: 422 });
  }

  const activeTemplate =
    leaseMode === "generate"
      ? await prisma.lease_templates.findFirst({
          where: {
            organization_id: ctx.orgDbId,
            property_id: propertyId,
            ...(templateId ? { id: templateId } : { is_active: true }),
          },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            name: true,
            file_name: true,
            content_type: true,
            blob_url: true,
            lease_schema: true,
          },
        })
      : null;

  if (leaseMode === "generate" && !activeTemplate) {
    return Response.json(
      { error: "Upload or select a lease template before generating an e-sign lease." },
      { status: 422 },
    );
  }

  const manager = ctx.userDbId
    ? await prisma.users.findUnique({
        where: { id: ctx.userDbId },
        select: { email: true, first_name: true, last_name: true },
      })
    : null;
  const managerEmail =
    manager?.email ||
    unit.properties.organizations.email ||
    unit.properties.property_manager_email ||
    null;
  if (leaseMode === "generate" && !managerEmail) {
    return Response.json(
      { error: "Add a manager or organization email before sending leases for e-signature." },
      { status: 422 },
    );
  }

  const clerk = await clerkClient();
  const existingUsers = testMode
    ? null
    : await clerk.users.getUserList({ emailAddress: [normalizedEmail] });
  const existingClerkUser = existingUsers?.data[0] ?? null;
  const clerkUserIdToLink = testMode ? null : existingClerkUser?.id ?? null;

  const additionalClerkUserMap = new Map<string, string | null>();
  if (!testMode && parsedAdditional.length > 0) {
    await Promise.all(
      parsedAdditional.map(async (t) => {
        const users = await clerk.users.getUserList({ emailAddress: [t.email] });
        additionalClerkUserMap.set(t.email, users.data[0]?.id ?? null);
      }),
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingTenant = await tx.tenants.findUnique({
      where: { organization_id_email: { organization_id: ctx.orgDbId, email: normalizedEmail } },
      select: { id: true },
    });

    const tenant = existingTenant
      ? await tx.tenants.update({
          where: { id: existingTenant.id },
          data: {
            first_name: firstName,
            last_name: lastName,
            ...(phone ? { phone } : {}),
            ...(clerkUserIdToLink ? { clerk_user_id: clerkUserIdToLink } : {}),
            deleted_at: null,
            updated_at: new Date(),
          },
          select: { id: true },
        })
      : await tx.tenants.create({
          data: {
            organization_id: ctx.orgDbId,
            email: normalizedEmail,
            first_name: firstName,
            last_name: lastName,
            ...(phone ? { phone } : {}),
            ...(clerkUserIdToLink ? { clerk_user_id: clerkUserIdToLink } : {}),
          },
          select: { id: true },
        });

    const existingSharedUser = await tx.users.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, role: true },
    });

    if (clerkUserIdToLink || existingSharedUser) {
      const sharedUserData = {
        email: normalizedEmail,
        organization_id: ctx.orgDbId,
        first_name: firstName,
        last_name: lastName,
        ...(clerkUserIdToLink ? { clerk_user_id: clerkUserIdToLink } : {}),
        role:
          existingSharedUser?.role && existingSharedUser.role !== "renter"
            ? existingSharedUser.role
            : "renter",
        updated_at: new Date(),
      };
      if (existingSharedUser) {
        await tx.users.update({ where: { id: existingSharedUser.id }, data: sharedUserData });
      } else if (clerkUserIdToLink) {
        await tx.users.create({ data: { ...sharedUserData, clerk_user_id: clerkUserIdToLink } });
      }
    }

    const lease = await tx.leases.create({
      data: {
        unit_id: unit.id,
        start_date: leaseStart,
        end_date: leaseEnd,
        rent_amount: parsedRent,
        security_deposit: parsedDeposit,
        status: leaseMode === "generate" ? "pending_signature" : "active",
      },
      select: { id: true },
    });

    await tx.lease_tenants.create({
      data: { lease_id: lease.id, tenant_id: tenant.id, is_primary: true },
    });

    const additionalTenants: Array<AdditionalTenantInput & { id: string }> = [];
    for (const at of parsedAdditional) {
      const atClerkId = additionalClerkUserMap.get(at.email) ?? null;
      const existingAt = await tx.tenants.findUnique({
        where: { organization_id_email: { organization_id: ctx.orgDbId, email: at.email } },
        select: { id: true },
      });
      const atTenant = existingAt
        ? await tx.tenants.update({
            where: { id: existingAt.id },
            data: {
              first_name: at.firstName || undefined,
              last_name: at.lastName || undefined,
              ...(at.phone ? { phone: at.phone } : {}),
              ...(atClerkId ? { clerk_user_id: atClerkId } : {}),
              deleted_at: null,
              updated_at: new Date(),
            },
            select: { id: true },
          })
        : await tx.tenants.create({
            data: {
              organization_id: ctx.orgDbId,
              email: at.email,
              first_name: at.firstName,
              last_name: at.lastName,
              ...(at.phone ? { phone: at.phone } : {}),
              ...(atClerkId ? { clerk_user_id: atClerkId } : {}),
            },
            select: { id: true },
          });

      await tx.lease_tenants.create({
        data: { lease_id: lease.id, tenant_id: atTenant.id, is_primary: false },
      });
      additionalTenants.push({ ...at, id: atTenant.id });
    }

    if (leaseMode === "uploaded") {
      const rentPaymentDueDates = buildRentPaymentDueDates(leaseStart, leaseEnd);
      if (rentPaymentDueDates.length > 0) {
        await tx.payments.createMany({
          data: rentPaymentDueDates.map((dueDate) => ({
            lease_id: lease.id,
            tenant_id: tenant.id,
            amount: parsedRent,
            type: "rent",
            status: "pending",
            due_date: dueDate,
            notes: "Monthly rent",
          })),
        });
      }

      await tx.units.update({
        where: { id: unit.id },
        data: { status: "occupied", updated_at: new Date() },
      });
    } else {
      await tx.lease_signature_requests.create({
        data: {
          lease_id: lease.id,
          lease_template_id: activeTemplate!.id,
          status: "creating",
          recipients: [],
        },
      });
    }

    return {
      tenantId: tenant.id,
      leaseId: lease.id,
      additionalTenantIds: additionalTenants.map((t) => t.id),
      additionalTenants,
    };
  });

  if (leaseMode === "uploaded" && leaseFile instanceof File && leaseFile.size > 0) {
    if (ALLOWED_MIME.has(leaseFile.type) && leaseFile.size <= MAX_BYTES) {
      try {
        const ext = leaseFile.name.split(".").pop() ?? "pdf";
        const dateStamp = new Date().toISOString().slice(0, 10);
        const path = `leases/${ctx.orgDbId}/${propertyId}/${unitId}/${result.tenantId}/lease-${dateStamp}.${ext}`;
        const blob = await put(path, leaseFile, { access: "private", token: getBlobToken() });
        await prisma.leases.update({
          where: { id: result.leaseId },
          data: { document_url: blob.url },
        });
      } catch {
        // Non-fatal: the lease is created; managers can re-upload later.
      }
    }
  }

  let docusealSubmissionId: string | null = null;
  if (leaseMode === "generate") {
    const tenantRecipients: LeaseSignatureRecipient[] = [
      {
        kind: "tenant",
        tenantId: result.tenantId,
        email: normalizedEmail,
        firstName,
        lastName,
        role: "Tenant 1",
      },
      ...result.additionalTenants.map((tenant, index) => ({
        kind: "tenant" as const,
        tenantId: tenant.id,
        email: tenant.email,
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        role: `Tenant ${index + 2}`,
      })),
    ];
    const recipients: LeaseSignatureRecipient[] = [
      ...tenantRecipients,
      {
        kind: "manager",
        email: managerEmail!,
        firstName: manager?.first_name ?? unit.properties.organizations.name ?? "Property",
        lastName: manager?.last_name ?? "Manager",
        role: "Manager",
      },
    ];

    await prisma.lease_signature_requests.update({
      where: { lease_id: result.leaseId },
      data: { recipients: recipients as unknown as object, updated_at: new Date() },
    });

    try {
      const prop = unit.properties;
      const fullAddress = [prop.address, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
      let schema: ExtractedLeaseSchema;
      if (activeTemplate!.lease_schema) {
        schema = activeTemplate!.lease_schema as unknown as ExtractedLeaseSchema;
      } else {
        schema = await extractLeaseSchema(activeTemplate!.blob_url);
        await prisma.lease_templates.update({
          where: { id: activeTemplate!.id },
          data: { lease_schema: schema as object, updated_at: new Date() },
        });
      }
      const leaseData = {
        primaryTenant: { firstName, lastName, email: normalizedEmail },
        additionalTenants: parsedAdditional.map((t) => ({
          firstName: t.firstName,
          lastName: t.lastName,
          email: t.email,
        })),
        propertyName: prop.name,
        propertyAddress: fullAddress,
        unitNumber: unit.unit_number ?? "",
        startDate: startDate!,
        endDate: endDate ?? "",
        rentAmount: String(parsedRent),
        securityDeposit: parsedDeposit ? String(parsedDeposit) : undefined,
      };
      const docxBuffer = await generateLease(schema, leaseData, activeTemplate!.blob_url);

      docusealSubmissionId = await sendLeaseForSignature({
        leaseId: result.leaseId,
        template: activeTemplate!,
        recipients,
        filledPdfBytes: docxBuffer,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send the lease for e-signature.";
      await prisma.lease_signature_requests.update({
        where: { lease_id: result.leaseId },
        data: { status: "error", error: message, last_synced_at: new Date(), updated_at: new Date() },
      });
      return Response.json(
        {
          error: `Tenant record created, but e-sign send failed: ${message}`,
          tenantId: result.tenantId,
          leaseId: result.leaseId,
          additionalTenantIds: result.additionalTenantIds,
        },
        { status: 207 },
      );
    }
  }

  if (testMode) {
    return Response.json(
      {
        tenantId: result.tenantId,
        leaseId: result.leaseId,
        additionalTenantIds: result.additionalTenantIds,
        docusealSubmissionId,
        leaseMode,
        testMode: true,
        skippedInvite: normalizedEmail,
      },
      { status: 201 },
    );
  }

  const redirectUrl = new URL("/login?renter=1", request.nextUrl.origin).toString();
  const tenantsToInvite: string[] = [];
  const tenantsLinked: string[] = [];

  if (existingClerkUser) tenantsLinked.push(normalizedEmail);
  else tenantsToInvite.push(normalizedEmail);

  for (const at of parsedAdditional) {
    const atClerkId = additionalClerkUserMap.get(at.email);
    if (atClerkId) tenantsLinked.push(at.email);
    else tenantsToInvite.push(at.email);
  }

  if (tenantsToInvite.length > 0) {
    try {
      const existingInvites = await clerk.invitations.getInvitationList({ status: "pending" });
      const pendingEmailSet = new Set(existingInvites.data.map((inv) => inv.emailAddress.toLowerCase()));

      await Promise.all(
        tenantsToInvite.map(async (invEmail) => {
          if (pendingEmailSet.has(invEmail)) {
            const pending = existingInvites.data.find(
              (inv) => inv.emailAddress.toLowerCase() === invEmail,
            );
            if (pending) await clerk.invitations.revokeInvitation(pending.id);
          }
          await clerk.invitations.createInvitation({
            emailAddress: invEmail,
            redirectUrl,
            publicMetadata: { role: "renter" },
          });
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send invitation email.";
      return Response.json(
        {
          error: `Renter onboarded but invite email failed: ${message}`,
          tenantId: result.tenantId,
          leaseId: result.leaseId,
          additionalTenantIds: result.additionalTenantIds,
          docusealSubmissionId,
        },
        { status: 207 },
      );
    }
  }

  return Response.json(
    {
      tenantId: result.tenantId,
      leaseId: result.leaseId,
      additionalTenantIds: result.additionalTenantIds,
      docusealSubmissionId,
      leaseMode,
      sentForSignature: leaseMode === "generate",
      ...(tenantsLinked.length > 0 && tenantsToInvite.length === 0
        ? { linked: normalizedEmail }
        : { invited: normalizedEmail }),
    },
    { status: 201 },
  );
}
