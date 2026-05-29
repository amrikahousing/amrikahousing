import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

type RouteContext = { params: Promise<{ id: string; templateId: string; clauseId: string }> };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRisk(value: unknown) {
  const risk = clean(value).toLowerCase();
  return risk === "low" || risk === "medium" || risk === "high" ? risk : null;
}

async function requireClause(context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) return { error: Response.json({ error: ctx.error }, { status: ctx.status }) };

  const { id: propertyId, templateId, clauseId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", propertyId);
  if (permissionError) {
    return { error: Response.json({ error: permissionError.error }, { status: permissionError.status }) };
  }

  const clause = await prisma.lease_template_clauses.findFirst({
    where: {
      id: clauseId,
      lease_template_id: templateId,
      property_id: propertyId,
      organization_id: ctx.orgDbId,
    },
    select: { id: true },
  });
  if (!clause) {
    return { error: Response.json({ error: "Clause not found." }, { status: 404 }) };
  }

  return { ctx, propertyId, templateId, clauseId };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const allowed = await requireClause(context);
  if ("error" in allowed) return allowed.error;

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

  const clause = await prisma.lease_template_clauses.update({
    where: { id: allowed.clauseId },
    data: {
      title,
      body: clean(body?.body) || null,
      summary: clean(body?.summary) || null,
      risk_level: normalizeRisk(body?.riskLevel),
      explanation: clean(body?.explanation) || null,
      updated_at: new Date(),
    },
  });

  return Response.json({ clause });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const allowed = await requireClause(context);
  if ("error" in allowed) return allowed.error;

  await prisma.lease_template_clauses.delete({ where: { id: allowed.clauseId } });
  return new Response(null, { status: 204 });
}
