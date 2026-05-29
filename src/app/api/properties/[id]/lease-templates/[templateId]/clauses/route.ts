import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

type RouteContext = { params: Promise<{ id: string; templateId: string }> };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRisk(value: unknown) {
  const risk = clean(value).toLowerCase();
  return risk === "low" || risk === "medium" || risk === "high" ? risk : null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id: propertyId, templateId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const template = await prisma.lease_templates.findFirst({
    where: { id: templateId, property_id: propertyId, organization_id: ctx.orgDbId },
    select: { id: true },
  });
  if (!template) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    body?: unknown;
    summary?: unknown;
    riskLevel?: unknown;
    explanation?: unknown;
  } | null;
  const title = clean(body?.title);
  if (!title) {
    return Response.json({ error: "Clause title is required." }, { status: 422 });
  }

  const last = await prisma.lease_template_clauses.findFirst({
    where: { lease_template_id: templateId },
    orderBy: { sort_order: "desc" },
    select: { sort_order: true },
  });

  const clause = await prisma.lease_template_clauses.create({
    data: {
      lease_template_id: templateId,
      organization_id: ctx.orgDbId,
      property_id: propertyId,
      title,
      body: clean(body?.body) || null,
      summary: clean(body?.summary) || null,
      risk_level: normalizeRisk(body?.riskLevel),
      explanation: clean(body?.explanation) || null,
      sort_order: (last?.sort_order ?? -1) + 1,
      source: "manual",
    },
  });

  return Response.json({ clause }, { status: 201 });
}
