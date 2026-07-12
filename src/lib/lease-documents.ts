import { put } from "@vercel/blob";
import type { Prisma } from "@/generated/prisma/client";
import { getBlobToken } from "./blob-token";

export const ALLOWED_LEASE_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
]);
export const MAX_LEASE_FILE_BYTES = 20 * 1024 * 1024;

export function leaseFileExtension(fileName: string) {
  const ext = fileName.split(".").pop();
  return ext && ext.length <= 5 ? ext.toLowerCase() : "pdf";
}

export async function uploadLeaseDocumentBlob(path: string, file: File) {
  return put(path, file, {
    access: "private",
    token: getBlobToken(),
    addRandomSuffix: true,
  });
}

export type LeaseDocumentKind = "uploaded" | "docuseal";

type RecordLeaseDocumentInput = {
  leaseId: string;
  blobUrl: string;
  fileName: string;
  contentType: string;
  kind: LeaseDocumentKind;
  uploadedBy?: string | null;
};

/**
 * Every write to leases.document_url must go through here so the append-only
 * lease_documents history stays in sync with the current-document pointer.
 */
export async function recordLeaseDocument(
  tx: Prisma.TransactionClient,
  input: RecordLeaseDocumentInput,
) {
  const document = await tx.lease_documents.create({
    data: {
      lease_id: input.leaseId,
      blob_url: input.blobUrl,
      file_name: input.fileName,
      content_type: input.contentType,
      kind: input.kind,
      uploaded_by: input.uploadedBy ?? null,
    },
    select: { id: true },
  });
  await tx.leases.update({
    where: { id: input.leaseId },
    data: { document_url: input.blobUrl, updated_at: new Date() },
  });
  return document;
}
