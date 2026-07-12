import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  ALLOWED_LEASE_MIME,
  MAX_LEASE_FILE_BYTES,
  leaseFileExtension,
  recordLeaseDocument,
  uploadLeaseDocumentBlob,
} from "@/lib/lease-documents";
import { seedRentPayments } from "@/lib/lease-payments";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";

class RenewConflictError extends Error {}

export async function POST(request: NextRequest, context: { params: Promise<{ leaseId: string }> }) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { leaseId } = await context.params;
  const lease = await prisma.leases.findFirst({
    where: {
      id: leaseId,
      deleted_at: null,
      units: {
        properties: { organization_id: ctx.orgDbId, deleted_at: null },
        deleted_at: null,
      },
    },
    select: {
      status: true,
      unit_id: true,
      units: { select: { property_id: true } },
    },
  });

  if (!lease) {
    return Response.json({ error: "Lease not found." }, { status: 404 });
  }

  const permissionError = requirePropertyPermission(ctx, "invite_renters", lease.units.property_id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  if (lease.status === "pending_signature") {
    return Response.json(
      { error: "This lease is out for e-signature. Complete or cancel the signature request first." },
      { status: 409 },
    );
  }
  if (lease.status !== "active") {
    return Response.json({ error: "Only an active lease can be renewed." }, { status: 409 });
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

  const startDateRaw = get("startDate");
  const endDateRaw = get("endDate");
  const rentAmountRaw = get("rentAmount");
  const securityDepositRaw = get("securityDeposit");
  const monthlyRentCreditRaw = get("monthlyRentCredit");
  const leaseFile = form.get("leaseFile");

  if (!startDateRaw) {
    return Response.json({ error: "Lease start date is required." }, { status: 422 });
  }
  const startDate = new Date(startDateRaw);
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime()))) {
    return Response.json({ error: "Lease dates are invalid." }, { status: 422 });
  }
  if (endDate && endDate <= startDate) {
    return Response.json({ error: "Lease end date must be after the start date." }, { status: 422 });
  }

  const rentAmount = Number(rentAmountRaw);
  if (!rentAmountRaw || isNaN(rentAmount) || rentAmount <= 0) {
    return Response.json({ error: "A valid rent amount is required." }, { status: 422 });
  }
  const securityDeposit =
    securityDepositRaw && !isNaN(Number(securityDepositRaw)) ? Number(securityDepositRaw) : null;
  const monthlyRentCredit =
    monthlyRentCreditRaw && !isNaN(Number(monthlyRentCreditRaw)) && Number(monthlyRentCreditRaw) > 0
      ? Number(monthlyRentCreditRaw)
      : null;

  if (!(leaseFile instanceof File) || leaseFile.size === 0) {
    return Response.json({ error: "The signed lease document is required." }, { status: 422 });
  }
  if (!ALLOWED_LEASE_MIME.has(leaseFile.type)) {
    return Response.json({ error: "Lease documents must be a PDF, JPEG, or PNG." }, { status: 422 });
  }
  if (leaseFile.size > MAX_LEASE_FILE_BYTES) {
    return Response.json({ error: "Lease documents must be 20MB or smaller." }, { status: 422 });
  }

  const leaseTenants = await prisma.lease_tenants.findMany({
    where: { lease_id: leaseId },
    select: { tenant_id: true, is_primary: true },
  });
  const primaryTenant = leaseTenants.find((lt) => lt.is_primary);
  if (!primaryTenant) {
    return Response.json({ error: "The current lease has no primary tenant." }, { status: 422 });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `leases/${ctx.orgDbId}/${lease.units.property_id}/${lease.unit_id}/${primaryTenant.tenant_id}/renewal-${timestamp}.${leaseFileExtension(leaseFile.name)}`;
  const blob = await uploadLeaseDocumentBlob(path, leaseFile);

  const now = new Date();
  try {
    const newLeaseId = await prisma.$transaction(async (tx) => {
      // Concurrency guard: only one renewal can move the lease off "active".
      // Retiring first also keeps the one-active-lease-per-unit index satisfiable.
      const retired = await tx.leases.updateMany({
        where: { id: leaseId, status: "active" },
        data: { status: "ended", updated_at: now },
      });
      if (retired.count !== 1) {
        throw new RenewConflictError();
      }

      const newLease = await tx.leases.create({
        data: {
          unit_id: lease.unit_id,
          start_date: startDate,
          end_date: endDate,
          rent_amount: rentAmount,
          security_deposit: securityDeposit,
          monthly_rent_credit: monthlyRentCredit,
          status: "active",
        },
        select: { id: true },
      });

      await tx.lease_tenants.createMany({
        data: leaseTenants.map((lt) => ({
          lease_id: newLease.id,
          tenant_id: lt.tenant_id,
          is_primary: lt.is_primary,
        })),
      });

      await recordLeaseDocument(tx, {
        leaseId: newLease.id,
        blobUrl: blob.url,
        fileName: leaseFile.name,
        contentType: leaseFile.type,
        kind: "uploaded",
        uploadedBy: ctx.userDbId,
      });

      await seedRentPayments(tx, {
        leaseId: newLease.id,
        tenantId: primaryTenant.tenant_id,
        rentAmount,
        monthlyRentCredit,
        startDate,
        endDate,
      });

      await tx.units.update({
        where: { id: lease.unit_id },
        data: { status: "occupied", updated_at: now },
      });

      return newLease.id;
    });

    return Response.json({ newLeaseId, oldLeaseId: leaseId }, { status: 201 });
  } catch (err) {
    if (err instanceof RenewConflictError) {
      return Response.json(
        { error: "This lease was just changed by someone else. Refresh and try again." },
        { status: 409 },
      );
    }
    throw err;
  }
}
