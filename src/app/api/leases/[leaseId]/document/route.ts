import { get } from "@vercel/blob";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getBlobToken } from "@/lib/blob-token";
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
