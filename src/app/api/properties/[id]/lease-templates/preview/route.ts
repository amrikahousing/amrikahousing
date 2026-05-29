export const maxDuration = 120;

import { NextRequest } from "next/server";
import {
  extractErrorMessage,
  extractLeaseSchema,
  generateTokenizedTemplate,
  type ExtractedLeaseSchema,
} from "@/lib/fill-lease";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id: propertyId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  let body: {
    blobUrl?: string;
    schema?: ExtractedLeaseSchema | null;
    organizationName?: string;
    landlordSignatory?: string;
    propertyManagerName?: string;
    propertyManagerEmail?: string;
    propertyManagerPhone?: string;
    tenantPaidUtilities?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.blobUrl) {
    return Response.json({ error: "Template file is required." }, { status: 422 });
  }

  try {
    const property = await prisma.properties.findFirst({
      where: { id: propertyId, organization_id: ctx.orgDbId, deleted_at: null },
      select: { name: true, address: true, city: true, state: true, zip: true },
    });

    const schema = body.schema ?? await extractLeaseSchema(body.blobUrl);
    if (body.organizationName) schema.landlordName = body.organizationName;
    if (body.landlordSignatory) schema.landlordSignatory = body.landlordSignatory;
    if (body.propertyManagerName) schema.propertyManagerName = body.propertyManagerName;
    if (body.propertyManagerEmail) schema.propertyManagerEmail = body.propertyManagerEmail;
    if (body.propertyManagerPhone) schema.propertyManagerPhone = body.propertyManagerPhone;
    if (body.tenantPaidUtilities) schema.tenantPaidUtilities = body.tenantPaidUtilities;
    if (property) {
      schema.propertyName = property.name;
      schema.propertyAddress = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
      schema.propertyStreet = property.address;
      schema.propertyCity = property.city;
      schema.propertyState = property.state;
      schema.propertyZip = property.zip;
    }
    const docxBuffer = await generateTokenizedTemplate(schema, body.blobUrl);
    const mammoth = await import("mammoth");
    let { value: previewHtml } = await mammoth.convertToHtml({ buffer: docxBuffer });

    // Substitute form-entered party values directly so they show as real text in the preview
    const substitutions: [string, string][] = [
      ["{{organization_name}}", body.organizationName ?? ""],
      ["{{landlord_signatory}}", body.landlordSignatory ?? ""],
      ["{{property_manager_name}}", body.propertyManagerName ?? ""],
      ["{{property_manager_email}}", body.propertyManagerEmail ?? ""],
    ];
    for (const [token, value] of substitutions) {
      if (value) previewHtml = previewHtml.split(token).join(value);
    }

    return Response.json({
      previewHtml,
      fileBase64: docxBuffer.toString("base64"),
      schema,
    });
  } catch (err) {
    console.error("[lease-template-preview]", err);
    return Response.json({ error: extractErrorMessage(err) || "Could not preview this template." }, { status: 500 });
  }
}
