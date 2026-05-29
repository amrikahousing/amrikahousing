import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { syncDocuSealSignatureRequest } from "@/lib/lease-signatures";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

export async function POST(_request: NextRequest, context: { params: Promise<{ leaseId: string }> }) {
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
      id: true,
      units: { select: { property_id: true } },
      lease_signature_requests: {
        select: { provider_document_id: true },
        take: 1,
      },
    },
  });

  if (!lease) {
    return Response.json({ error: "Lease not found." }, { status: 404 });
  }

  const permissionError = requirePropertyPermission(ctx, "invite_renters", lease.units.property_id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const documentId = lease.lease_signature_requests[0]?.provider_document_id;
  if (!documentId) {
    return Response.json({ error: "No signature request exists for this lease." }, { status: 404 });
  }

  const result = await syncDocuSealSignatureRequest(documentId);
  return Response.json(result);
}
