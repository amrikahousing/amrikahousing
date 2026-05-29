import { del } from "@vercel/blob";
import { NextRequest } from "next/server";
import { getBlobToken } from "@/lib/blob-token";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; templateId: string }> }) {
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
    select: { id: true, lease_schema: true },
  });
  if (!template) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  const schema = template.lease_schema as { pairs?: Array<{ search: string; token: string }> } | null;
  return Response.json({ pairs: schema?.pairs ?? null });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; templateId: string }> }) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id: propertyId, templateId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const body = await request.json().catch(() => null) as { name?: unknown; isActive?: unknown; pairs?: unknown } | null;
  const template = await prisma.lease_templates.findFirst({
    where: { id: templateId, property_id: propertyId, organization_id: ctx.orgDbId },
    select: { id: true, lease_schema: true },
  });
  if (!template) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  const isActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : undefined;
  const pairs = Array.isArray(body?.pairs)
    ? (body.pairs as unknown[]).filter(
        (p) => p && typeof p === "object" &&
          typeof (p as Record<string, unknown>).search === "string" &&
          typeof (p as Record<string, unknown>).token === "string",
      )
    : undefined;

  const updatedSchema = pairs !== undefined
    ? { ...((template.lease_schema as Record<string, unknown>) ?? {}), pairs } as object
    : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (isActive) {
      await tx.lease_templates.updateMany({
        where: { organization_id: ctx.orgDbId, property_id: propertyId, is_active: true },
        data: { is_active: false, updated_at: new Date() },
      });
    }

    return tx.lease_templates.update({
      where: { id: templateId },
      data: {
        ...(name ? { name } : {}),
        ...(isActive !== undefined ? { is_active: isActive } : {}),
        ...(updatedSchema ? { lease_schema: updatedSchema } : {}),
        updated_at: new Date(),
      },
      select: {
        id: true,
        name: true,
        file_name: true,
        content_type: true,
        blob_url: true,
        is_active: true,
        created_at: true,
      },
    });
  });

  return Response.json({
    template: {
      id: updated.id,
      name: updated.name,
      fileName: updated.file_name,
      contentType: updated.content_type,
      blobUrl: updated.blob_url,
      isActive: updated.is_active,
      createdAt: updated.created_at.toISOString(),
    },
  });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; templateId: string }> }) {
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
    select: { id: true, blob_url: true },
  });
  if (!template) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  await prisma.lease_templates.delete({ where: { id: template.id } });
  await del(template.blob_url, { token: getBlobToken() }).catch(() => undefined);

  return new Response(null, { status: 204 });
}
