export const maxDuration = 120;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { extractLeaseSchema } from "@/lib/fill-lease";
import { syncLeaseTemplateClauses } from "@/lib/lease-template-clauses";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

type RouteContext = { params: Promise<{ id: string; templateId: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id: propertyId, templateId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "AI extraction is not configured." }, { status: 503 });
  }

  const template = await prisma.lease_templates.findFirst({
    where: { id: templateId, property_id: propertyId, organization_id: ctx.orgDbId },
    select: { id: true, blob_url: true, content_type: true },
  });
  if (!template) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  let schema;
  try {
    schema = await extractLeaseSchema(template.blob_url);
  } catch (err) {
    console.error("[re-extract] extractLeaseSchema failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "AI extraction failed." },
      { status: 500 },
    );
  }

  await prisma.lease_templates.update({
    where: { id: templateId },
    data: { lease_schema: schema as object, updated_at: new Date() },
  });

  await syncLeaseTemplateClauses({
    templateId,
    organizationId: ctx.orgDbId,
    propertyId,
    schema,
  }).catch((err) => console.error("[re-extract] syncLeaseTemplateClauses failed:", err));

  return Response.json({ pairs: schema.pairs });
}
