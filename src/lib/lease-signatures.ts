import { get, put } from "@vercel/blob";
import { prisma } from "./db";
import { getBlobToken } from "./blob-token";
import { buildRentPaymentDueDates } from "./lease-payments";
import { computeNetRent } from "./rent-credit";
import {
  createDocuSealSubmission,
  downloadDocuSealDocument,
  getDocuSealSubmission,
  normalizeDocuSealStatus,
} from "./docuseal";

export type LeaseSignatureRecipient = {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId?: string;
  kind: "tenant" | "manager";
};

type LeaseTemplateForSignature = {
  id: string;
  name: string;
  file_name: string;
  content_type: string;
  blob_url: string;
};

type SendLeaseForSignatureInput = {
  leaseId: string;
  template: LeaseTemplateForSignature;
  recipients: LeaseSignatureRecipient[];
  filledPdfBytes?: Buffer;
};

async function fileFromTemplate(template: LeaseTemplateForSignature) {
  const blob = await get(template.blob_url, {
    access: "private",
    token: getBlobToken(),
    useCache: false,
  });
  if (!blob?.stream) {
    throw new Error("Lease template file is not available.");
  }
  return new File([await new Response(blob.stream).arrayBuffer()], template.file_name, {
    type: blob.blob.contentType || template.content_type || "application/pdf",
  });
}

function detectFilledMime(buf: Buffer): string {
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/pdf";
}

export async function sendLeaseForSignature(input: SendLeaseForSignatureInput) {
  const file = input.filledPdfBytes
    ? new File([input.filledPdfBytes.buffer as ArrayBuffer], input.template.file_name, { type: detectFilledMime(input.filledPdfBytes) })
    : await fileFromTemplate(input.template);
  const primaryTenant = input.recipients.find((r) => r.kind === "tenant");
  const docName = `Lease - ${[primaryTenant?.firstName, primaryTenant?.lastName].filter(Boolean).join(" ")}`.trim();

  const submission = await createDocuSealSubmission({
    file,
    name: docName,
    recipients: input.recipients.map((r) => ({
      email: r.email,
      name: [r.firstName, r.lastName].filter(Boolean).join(" "),
      role: r.role,
    })),
  });

  const submissionId = String(submission.id);

  await prisma.lease_signature_requests.update({
    where: { lease_id: input.leaseId },
    data: {
      provider_document_id: submissionId,
      status: "sent",
      sent_at: new Date(),
      last_synced_at: new Date(),
      updated_at: new Date(),
    },
  });

  return submissionId;
}

async function storeCompletedDocument(leaseId: string, submissionId: string) {
  const file = await downloadDocuSealDocument(submissionId);
  const path = `leases/signed/${leaseId}/docuseal-completed-${new Date().toISOString().slice(0, 10)}.pdf`;
  const blob = await put(path, file, { access: "private", token: getBlobToken() });
  await prisma.leases.update({
    where: { id: leaseId },
    data: { document_url: blob.url, updated_at: new Date() },
  });
}

export async function activateLeaseAfterSignature(leaseId: string) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const lease = await tx.leases.findUnique({
      where: { id: leaseId },
      select: {
        id: true,
        unit_id: true,
        start_date: true,
        end_date: true,
        rent_amount: true,
        monthly_rent_credit: true,
        status: true,
        lease_tenants: {
          select: { tenant_id: true, is_primary: true },
        },
      },
    });

    if (!lease) throw new Error("Lease not found.");

    await tx.lease_signature_requests.update({
      where: { lease_id: leaseId },
      data: {
        status: "completed",
        completed_at: now,
        last_synced_at: now,
        updated_at: now,
      },
    });

    if (lease.status === "active") return;

    const primaryTenantId = lease.lease_tenants?.tenant_id;
    const existingPaymentCount = await tx.payments.count({ where: { lease_id: leaseId } });
    const dueDates = buildRentPaymentDueDates(lease.start_date, lease.end_date);
    if (existingPaymentCount === 0 && primaryTenantId && dueDates.length > 0) {
      const rent = Number(lease.rent_amount);
      const credit = Number(lease.monthly_rent_credit ?? 0);
      await tx.payments.createMany({
        // Month 1 is billed at full rent; the credit applies from month 2 onward.
        data: dueDates.map((dueDate, index) => {
          const applyCredit = index > 0 && credit > 0;
          const amount = applyCredit ? computeNetRent(rent, credit) : rent;
          return {
            lease_id: leaseId,
            tenant_id: primaryTenantId,
            amount,
            type: "rent",
            status: "pending",
            due_date: dueDate,
            notes: applyCredit ? `Monthly rent (credit $${credit.toFixed(2)} applied)` : "Monthly rent",
          };
        }),
      });
    }

    await tx.leases.update({
      where: { id: leaseId },
      data: { status: "active", updated_at: now },
    });
    await tx.units.update({
      where: { id: lease.unit_id },
      data: { status: "occupied", updated_at: now },
    });
  });
}

export async function syncDocuSealSignatureRequest(providerDocumentId: string, rawStatus?: string | null) {
  const request = await prisma.lease_signature_requests.findFirst({
    where: { provider_document_id: providerDocumentId },
    select: { lease_id: true, status: true },
  });
  if (!request) return { synced: false, reason: "not_found" };

  const normalized = rawStatus
    ? normalizeDocuSealStatus(rawStatus)
    : normalizeDocuSealStatus((await getDocuSealSubmission(providerDocumentId)).status);

  if (normalized === "completed") {
    await activateLeaseAfterSignature(request.lease_id);
    try {
      await storeCompletedDocument(request.lease_id, providerDocumentId);
    } catch {
      // Signed status is authoritative; document storage can be retried later.
    }
    return { synced: true, status: normalized };
  }

  await prisma.lease_signature_requests.update({
    where: { lease_id: request.lease_id },
    data: { status: normalized, last_synced_at: new Date(), updated_at: new Date() },
  });

  return { synced: true, status: normalized };
}
