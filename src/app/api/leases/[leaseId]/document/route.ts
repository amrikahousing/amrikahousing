import { get } from "@vercel/blob";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getBlobToken } from "@/lib/blob-token";
import {
  ALLOWED_LEASE_MIME,
  MAX_LEASE_FILE_BYTES,
  leaseFileExtension,
  recordLeaseDocument,
  uploadLeaseDocumentBlob,
} from "@/lib/lease-documents";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";

function fileNameFromUrl(url: string) {
  const pathname = new URL(url).pathname;
  return pathname.split("/").pop() || "lease-agreement.pdf";
}

export async function GET(_request: NextRequest, context: { params: Promise<{ leaseId: string }> }) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { leaseId } = await context.params;
  const lease = await prisma.leases.findFirst({
    where: {
      id: leaseId,
      units: {
        properties: { organization_id: ctx.orgDbId, deleted_at: null },
        deleted_at: null,
      },
    },
    select: {
      document_url: true,
      units: { select: { property_id: true } },
    },
  });

  if (!lease) {
    return Response.json({ error: "Lease not found." }, { status: 404 });
  }

  const permissionError = requirePropertyPermission(ctx, "view_properties", lease.units.property_id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  if (!lease.document_url) {
    return Response.json({ error: "No lease document is available." }, { status: 404 });
  }

  const blob = await get(lease.document_url, {
    access: "private",
    token: getBlobToken(),
    useCache: false,
  });
  if (!blob?.stream) {
    return Response.json({ error: "Lease document unavailable." }, { status: 502 });
  }

  return new Response(blob.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": blob.blob.contentType || "application/pdf",
      "Content-Disposition": `inline; filename="${fileNameFromUrl(lease.document_url)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

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
    return Response.json({ error: "Only an active lease's document can be replaced." }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "A lease document file is required." }, { status: 422 });
  }
  if (!ALLOWED_LEASE_MIME.has(file.type)) {
    return Response.json({ error: "Lease documents must be a PDF, JPEG, or PNG." }, { status: 422 });
  }
  if (file.size > MAX_LEASE_FILE_BYTES) {
    return Response.json({ error: "Lease documents must be 20MB or smaller." }, { status: 422 });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `leases/${ctx.orgDbId}/${lease.units.property_id}/${lease.unit_id}/manual/lease-${timestamp}.${leaseFileExtension(file.name)}`;
  const blob = await uploadLeaseDocumentBlob(path, file);

  const document = await prisma.$transaction((tx) =>
    recordLeaseDocument(tx, {
      leaseId,
      blobUrl: blob.url,
      fileName: file.name,
      contentType: file.type,
      kind: "uploaded",
      uploadedBy: ctx.userDbId,
    }),
  );

  return Response.json({ documentId: document.id }, { status: 201 });
}
