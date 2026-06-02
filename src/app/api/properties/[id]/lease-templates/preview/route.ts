export const maxDuration = 120;

import { NextRequest } from "next/server";
import {
  extractErrorMessage,
  extractLeaseSchema,
  generateTokenizedTemplate,
  generateTaggableHtml,
  tokenizedTextToHtml,
  type ExtractedLeaseSchema,
} from "@/lib/fill-lease";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";
import { escapeHtmlText, sanitizeLeasePreviewHtml, sanitizeTaggableHtml } from "@/lib/lease-preview-html";
import { getSchemaExtraction } from "@/lib/lease-schema-cache";

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
    const [property, cachedTemplate] = await Promise.all([
      prisma.properties.findFirst({
        where: { id: propertyId, organization_id: ctx.orgDbId, deleted_at: null },
        select: { name: true, address: true, city: true, state: true, zip: true },
      }),
      // Use the cached schema from DB — avoids re-running AI extraction (30-60s) on every preview
      prisma.lease_templates.findFirst({
        where: { blob_url: body.blobUrl, organization_id: ctx.orgDbId },
        select: { lease_schema: true },
      }),
    ]);

    // Resolve schema in priority order:
    //   1. Already saved to DB (lease_templates row)
    //   2. Provided by client in request body (passed from pre-review response)
    //   3. Awaiting the in-memory promise from a background pre-review extraction
    const cachedSchema = cachedTemplate?.lease_schema as ExtractedLeaseSchema | null | undefined;
    let schema: ExtractedLeaseSchema | null = cachedSchema ?? body.schema ?? null;

    if (!schema) {
      const pending = getSchemaExtraction(body.blobUrl);
      if (pending) {
        try {
          schema = await pending;
        } catch {
          schema = null;
        }
      }
    }

    const mammoth = await import("mammoth");

    // If no schema is available yet (extraction failed or not run yet during upload),
    // return a best-effort raw preview — fast, no AI needed.
    // Never re-run extractLeaseSchema here: extraction belongs only in the upload/confirm flow.
    if (!schema) {
      const { get } = await import("@vercel/blob");
      const { getBlobToken } = await import("@/lib/blob-token");
      const blob = await get(body.blobUrl, { access: "private", token: getBlobToken(), useCache: false });
      if (!blob?.stream) return Response.json({ error: "Template file is unavailable." }, { status: 500 });
      const rawBuffer = Buffer.from(await new Response(blob.stream).arrayBuffer());

      // Detect format by magic bytes: PK header = DOCX/zip, %PDF = PDF
      const isDocx = rawBuffer[0] === 0x50 && rawBuffer[1] === 0x4b;
      const isPdf  = rawBuffer.slice(0, 4).toString("ascii") === "%PDF";

      let previewHtml = "";
      if (isDocx) {
        const { value } = await mammoth.convertToHtml({ buffer: rawBuffer });
        previewHtml = sanitizeLeasePreviewHtml(value);
      } else if (isPdf) {
        // PDF can't be rendered by mammoth — show a readable placeholder so the
        // manager still sees the document name and knows extraction is in progress.
        previewHtml = `<p style="padding:2rem;color:#64748b;font-size:.9rem;">
          PDF document uploaded — field detection is being processed in the background.
          The document will be shown with coloured chips once ready (usually under a minute).
          You can continue to the next step and come back to Tags to review.
        </p>`;
      }

      return Response.json({
        previewHtml,
        taggableHtml: null,
        fileBase64: null,
        schema: null,
        schemaNotReady: true,
      });
    }

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
    // Decide rendering path:
    //   - DOCX original  → fill the actual DOCX with tokens, convert with mammoth (preserves formatting)
    //   - PDF original   → render the tokenized text directly as HTML (mammoth can't read PDFs;
    //                      the synthetic-clauses fallback produces empty docs when heading
    //                      detection misses, which is common for pdfjs-extracted text)
    let rawHtmlBase: string;
    let docxBuffer: Buffer | null = null;

    if (schema.originalFormat === "pdf" && schema.tokenizedText) {
      rawHtmlBase = tokenizedTextToHtml(schema.tokenizedText);
    } else {
      docxBuffer = await generateTokenizedTemplate(schema, body.blobUrl);
      const { value } = await mammoth.convertToHtml({ buffer: docxBuffer });
      rawHtmlBase = value;
    }

    // taggableHtml: built from raw HTML (tokens still present as text)
    const taggableHtml = sanitizeTaggableHtml(generateTaggableHtml(rawHtmlBase));

    // previewHtml: party values substituted as real text for the review step
    let previewRaw = rawHtmlBase;
    const substitutions: [string, string][] = [
      ["{{organization_name}}", body.organizationName ?? ""],
      ["{{landlord_signatory}}", body.landlordSignatory ?? ""],
      ["{{property_manager_name}}", body.propertyManagerName ?? ""],
      ["{{property_manager_email}}", body.propertyManagerEmail ?? ""],
    ];
    for (const [token, value] of substitutions) {
      if (value) previewRaw = previewRaw.split(token).join(escapeHtmlText(value));
    }
    const previewHtml = sanitizeLeasePreviewHtml(previewRaw);

    return Response.json({
      previewHtml,
      taggableHtml,
      fileBase64: docxBuffer ? docxBuffer.toString("base64") : null,
      schema,
      schemaNotReady: false,
    });
  } catch (err) {
    console.error("[lease-template-preview]", err);
    return Response.json({ error: extractErrorMessage(err) || "Could not preview this template." }, { status: 500 });
  }
}
