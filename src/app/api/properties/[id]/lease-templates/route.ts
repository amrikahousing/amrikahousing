export const maxDuration = 120;

import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { getBlobToken } from "@/lib/blob-token";
import { prisma } from "@/lib/db";
import { extractLeaseSchema } from "@/lib/fill-lease";
import { syncLeaseTemplateClauses } from "@/lib/lease-template-clauses";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const ALLOWED_TEMPLATE_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/rtf",
]);
const MAX_TEMPLATE_BYTES = 50 * 1024 * 1024;

function templateJson(template: {
  id: string;
  name: string;
  file_name: string;
  content_type: string;
  blob_url: string;
  is_active: boolean;
  created_at: Date;
}) {
  return {
    id: template.id,
    name: template.name,
    fileName: template.file_name,
    contentType: template.content_type,
    blobUrl: template.blob_url,
    isActive: template.is_active,
    createdAt: template.created_at.toISOString(),
  };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id: propertyId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "invite_renters", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const templates = await prisma.lease_templates.findMany({
    where: {
      organization_id: ctx.orgDbId,
      property_id: propertyId,
    },
    orderBy: [{ is_active: "desc" }, { created_at: "desc" }],
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

  return Response.json({ templates: templates.map(templateJson) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id: propertyId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const property = await prisma.properties.findFirst({
    where: { id: propertyId, organization_id: ctx.orgDbId, deleted_at: null },
    select: { id: true },
  });
  if (!property) {
    return Response.json({ error: "Property not found." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  const nameRaw = form.get("name");
  if (!(file instanceof File) || file.size <= 0) {
    return Response.json({ error: "Lease template file is required." }, { status: 422 });
  }
  if (!ALLOWED_TEMPLATE_MIME.has(file.type) || file.size > MAX_TEMPLATE_BYTES) {
    return Response.json(
      { error: "Upload a PDF, DOCX, or RTF template under 50MB." },
      { status: 422 },
    );
  }

  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim()
      : file.name.replace(/\.[^.]+$/, "") || "Lease template";
  const ext = file.name.split(".").pop() ?? "pdf";
  const dateStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `lease-templates/${ctx.orgDbId}/${propertyId}/template-${dateStamp}.${ext}`;
  const blob = await put(path, file, { access: "private", token: getBlobToken() });

  const template = await prisma.$transaction(async (tx) => {
    await tx.lease_templates.updateMany({
      where: { organization_id: ctx.orgDbId, property_id: propertyId, is_active: true },
      data: { is_active: false, updated_at: new Date() },
    });

    return tx.lease_templates.create({
      data: {
        organization_id: ctx.orgDbId,
        property_id: propertyId,
        name,
        file_name: file.name,
        content_type: file.type,
        blob_url: blob.url,
        is_active: true,
        created_by: ctx.userDbId,
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

  // Extract schema synchronously so fill requests are always instant
  try {
    const schema = await extractLeaseSchema(blob.url);
    await prisma.lease_templates.update({
      where: { id: template.id },
      data: { lease_schema: schema as object, updated_at: new Date() },
    });
    await syncLeaseTemplateClauses({
      templateId: template.id,
      organizationId: ctx.orgDbId,
      propertyId,
      schema,
    });
  } catch (err) {
    console.error("[lease-template] schema extraction failed:", err);
    // Non-fatal — user can still generate a lease, extraction will retry on first fill
  }

  return Response.json({ template: templateJson(template) }, { status: 201 });
}
