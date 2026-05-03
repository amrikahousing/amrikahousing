import { put } from "@vercel/blob";
import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/jpg"]);
const MAX_BYTES = 20 * 1024 * 1024;
const OPEN_ENDED_PAYMENT_MONTHS = 12;

function addMonthsClamped(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTargetMonth)));
}

function buildRentPaymentDueDates(startDate: Date, endDate: Date | null) {
  const dates: Date[] = [];
  const paymentCount = endDate
    ? Math.max(
        0,
        (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
          (endDate.getUTCMonth() - startDate.getUTCMonth()) +
          1,
      )
    : OPEN_ENDED_PAYMENT_MONTHS;

  for (let i = 0; i < paymentCount; i += 1) {
    const dueDate = addMonthsClamped(startDate, i);
    if (endDate && dueDate > endDate) break;
    dates.push(dueDate);
  }

  return dates;
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
  const testMode = get("testMode") === "true";
  const leaseFile = form.get("leaseFile");

  type AdditionalTenantInput = { firstName: string; lastName: string; email: string; phone?: string };
  let parsedAdditional: AdditionalTenantInput[] = [];
  const additionalTenantsRaw = get("additionalTenants");
  if (additionalTenantsRaw) {
    try {
      const parsed = JSON.parse(additionalTenantsRaw);
      if (Array.isArray(parsed)) {
        parsedAdditional = parsed
          .filter(
            (t): t is Record<string, unknown> =>
              t !== null && typeof t === "object",
          )
          .map((t) => ({
            firstName: typeof t.firstName === "string" ? t.firstName.trim() : "",
            lastName: typeof t.lastName === "string" ? t.lastName.trim() : "",
            email: typeof t.email === "string" ? t.email.trim().toLowerCase() : "",
            phone: typeof t.phone === "string" ? t.phone.trim() : undefined,
          }))
          .filter((t) => EMAIL_PATTERN.test(t.email));
      }
    } catch {
      // ignore malformed — treat as no additional tenants
    }
  }

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
    select: { id: true, unit_number: true, status: true },
  });

  if (!unit) {
    return Response.json({ error: "Unit not found." }, { status: 404 });
  }

  const normalizedEmail = email.toLowerCase();
  const parsedDeposit =
    securityDepositRaw && !isNaN(Number(securityDepositRaw)) ? Number(securityDepositRaw) : null;
  const leaseStart = new Date(startDate);
  const leaseEnd = endDate ? new Date(endDate) : null;

  // Check for existing Clerk account unless this is a dry notification test.
  const clerk = await clerkClient();
  const existingUsers = testMode
    ? null
    : await clerk.users.getUserList({ emailAddress: [normalizedEmail] });
  const existingClerkUser = existingUsers?.data[0] ?? null;
  const clerkUserIdToLink = testMode ? null : existingClerkUser?.id ?? null;

  // Lookup existing Clerk accounts for additional tenants
  const additionalClerkUserMap = new Map<string, string | null>();
  if (!testMode && parsedAdditional.length > 0) {
    await Promise.all(
      parsedAdditional.map(async (t) => {
        const users = await clerk.users.getUserList({ emailAddress: [t.email] });
        additionalClerkUserMap.set(t.email, users.data[0]?.id ?? null);
      }),
    );
  }

  // Create tenant + lease in a transaction (no file I/O inside)
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
        status: "active",
      },
      select: { id: true },
    });

    await tx.lease_tenants.create({
      data: { lease_id: lease.id, tenant_id: tenant.id, is_primary: true },
    });

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

    // Additional tenants — upsert and link to lease
    const additionalTenantIds: string[] = [];
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
      additionalTenantIds.push(atTenant.id);
    }

    await tx.units.update({
      where: { id: unit.id },
      data: { status: "occupied", updated_at: new Date() },
    });

    return { tenantId: tenant.id, leaseId: lease.id, additionalTenantIds };
  });

  // Upload lease document now that we have the tenant ID
  if (leaseFile instanceof File && leaseFile.size > 0) {
    if (ALLOWED_MIME.has(leaseFile.type) && leaseFile.size <= MAX_BYTES) {
      try {
        const ext = leaseFile.name.split(".").pop() ?? "pdf";
        const dateStamp = new Date().toISOString().slice(0, 10);
        const path = `leases/${ctx.orgDbId}/${propertyId}/${unitId}/${result.tenantId}/lease-${dateStamp}.${ext}`;
        const blobToken =
          process.env.VERCEL_ENV === "production"
            ? process.env.BLOB_READ_WRITE_TOKEN
            : process.env.VERCEL_ENV === "preview"
              ? process.env.TEST_BLOB_READ_WRITE_TOKEN
              : process.env.DEV_BLOB_READ_WRITE_TOKEN;
        const blob = await put(path, leaseFile, { access: "private", token: blobToken });
        await prisma.leases.update({
          where: { id: result.leaseId },
          data: { document_url: blob.url },
        });
      } catch {
        // Non-fatal — lease is created, doc just won't be attached
      }
    }
  }

  // Send invite
  if (testMode) {
    return Response.json(
      {
        tenantId: result.tenantId,
        leaseId: result.leaseId,
        additionalTenantIds: result.additionalTenantIds,
        testMode: true,
        skippedInvite: normalizedEmail,
      },
      { status: 201 },
    );
  }

  const redirectUrl = new URL("/login?renter=1", request.nextUrl.origin).toString();

  // Collect all tenants that need a new Clerk invite (no existing account)
  const tenantsToInvite: string[] = [];
  const tenantsLinked: string[] = [];

  if (existingClerkUser) {
    tenantsLinked.push(normalizedEmail);
  } else {
    tenantsToInvite.push(normalizedEmail);
  }

  for (const at of parsedAdditional) {
    const atClerkId = additionalClerkUserMap.get(at.email);
    if (atClerkId) {
      tenantsLinked.push(at.email);
    } else {
      tenantsToInvite.push(at.email);
    }
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
        },
        { status: 207 },
      );
    }
  }

  if (tenantsLinked.length > 0 && tenantsToInvite.length === 0) {
    return Response.json(
      {
        tenantId: result.tenantId,
        leaseId: result.leaseId,
        additionalTenantIds: result.additionalTenantIds,
        linked: normalizedEmail,
      },
      { status: 201 },
    );
  }

  return Response.json(
    {
      tenantId: result.tenantId,
      leaseId: result.leaseId,
      additionalTenantIds: result.additionalTenantIds,
      invited: normalizedEmail,
    },
    { status: 201 },
  );
}
