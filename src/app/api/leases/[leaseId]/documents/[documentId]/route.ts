import { get } from "@vercel/blob";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getBlobToken } from "@/lib/blob-token";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ leaseId: string; documentId: string }> },
) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { leaseId, documentId } = await context.params;
  const document = await prisma.lease_documents.findFirst({
    where: {
      id: documentId,
      lease_id: leaseId,
      leases: {
        units: {
          properties: { organization_id: ctx.orgDbId, deleted_at: null },
          deleted_at: null,
        },
      },
    },
    select: {
      blob_url: true,
      file_name: true,
      content_type: true,
      leases: { select: { units: { select: { property_id: true } } } },
    },
  });

  if (!document) {
    return Response.json({ error: "Lease document not found." }, { status: 404 });
  }

  const permissionError = requirePropertyPermission(
    ctx,
    "view_properties",
    document.leases.units.property_id,
  );
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const blob = await get(document.blob_url, {
    access: "private",
    token: getBlobToken(),
    useCache: false,
  });
  if (!blob?.stream) {
    return Response.json({ error: "Lease document unavailable." }, { status: 502 });
  }

  return new Response(blob.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": blob.blob.contentType || document.content_type || "application/pdf",
      "Content-Disposition": `inline; filename="${document.file_name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
