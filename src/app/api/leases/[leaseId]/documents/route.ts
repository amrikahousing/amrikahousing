import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";

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

  const documents = await prisma.lease_documents.findMany({
    where: { lease_id: leaseId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      blob_url: true,
      file_name: true,
      content_type: true,
      kind: true,
      uploaded_by: true,
      created_at: true,
    },
  });

  const uploaderIds = [...new Set(documents.map((d) => d.uploaded_by).filter((id): id is string => !!id))];
  const uploaders = uploaderIds.length
    ? await prisma.users.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, first_name: true, last_name: true },
      })
    : [];
  const uploaderNames = new Map(
    uploaders.map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(" ")]),
  );

  return Response.json({
    documents: documents.map((doc) => ({
      id: doc.id,
      fileName: doc.file_name,
      contentType: doc.content_type,
      kind: doc.kind,
      uploadedBy: doc.uploaded_by ? uploaderNames.get(doc.uploaded_by) || null : null,
      createdAt: doc.created_at.toISOString(),
      isCurrent: doc.blob_url === lease.document_url,
    })),
  });
}
