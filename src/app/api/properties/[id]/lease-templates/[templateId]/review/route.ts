export const maxDuration = 120;

import mammoth from "mammoth";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getBlobToken } from "@/lib/blob-token";
import {
  buildLeaseTemplateReviewSystemPrompt,
  buildLeaseTemplateReviewUserPrompt,
  leaseTemplateReviewTool,
} from "@/lib/lease-extract-prompt";
import { syncLeaseTemplateClauses } from "@/lib/lease-template-clauses";
import { syncStateSpecificLeaseClauses } from "@/lib/lease-state-clauses";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const SUPPORTED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

type RouteContext = { params: Promise<{ id: string; templateId: string }> };

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

type AnthropicMessageResponse = {
  content: AnthropicContentBlock[];
  stop_reason: string;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    return await handlePost(context);
  } catch (err) {
    console.error("[lease-review] Unhandled error:", err);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

async function handlePost(context: RouteContext) {
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
    return Response.json({ error: "AI review is not configured." }, { status: 503 });
  }

  const template = await prisma.lease_templates.findFirst({
    where: { id: templateId, property_id: propertyId, organization_id: ctx.orgDbId },
    select: {
      blob_url: true,
      content_type: true,
      name: true,
      review_data: true,
      lease_schema: true,
      properties: { select: { state: true } },
    },
  });
  if (!template) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  if (template.review_data) {
    return Response.json(template.review_data);
  }

  if (!SUPPORTED_MIME.has(template.content_type)) {
    return Response.json(
      { error: "AI review supports PDF and DOCX templates. Re-upload your template in one of those formats." },
      { status: 422 },
    );
  }

  const token = getBlobToken();
  const blobRes = await fetch(template.blob_url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!blobRes.ok) {
    console.error("[lease-review] Blob fetch failed:", blobRes.status);
    return Response.json({ error: "Could not retrieve template file." }, { status: 502 });
  }

  const buffer = Buffer.from(await blobRes.arrayBuffer());

  const isDocx = template.content_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  let userContent: unknown[];

  if (isDocx) {
    let extractedText: string;
    try {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value.trim().slice(0, 16_000);
    } catch (err) {
      console.error("[lease-review] DOCX text extraction failed:", err);
      return Response.json({ error: "Could not read this DOCX file. Try re-uploading or converting to PDF." }, { status: 422 });
    }
    if (!extractedText) {
      return Response.json({ error: "No readable text found in this DOCX file." }, { status: 422 });
    }
    userContent = [
      {
        type: "text",
        text: buildLeaseTemplateReviewUserPrompt({ hasDocxText: true, text: extractedText }),
      },
    ];
  } else {
    userContent = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      },
      {
        type: "text",
        text: buildLeaseTemplateReviewUserPrompt({ hasDocxText: false }),
      },
    ];
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      tools: [leaseTemplateReviewTool],
      tool_choice: { type: "tool", name: leaseTemplateReviewTool.name },
      system: buildLeaseTemplateReviewSystemPrompt(),
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[lease-review] Anthropic API error:", response.status, errText);
    return Response.json({ error: "Could not analyze this lease template." }, { status: 502 });
  }

  const message = (await response.json()) as AnthropicMessageResponse;
  if (message.stop_reason === "max_tokens") {
    console.error("[lease-review] Response truncated — increase max_tokens or reduce input");
    return Response.json({ error: "The lease document is too large to review in one pass. Try uploading a shorter document." }, { status: 422 });
  }
  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    return Response.json({ error: "Could not extract review data from this document." }, { status: 422 });
  }

  await prisma.lease_templates.update({
    where: { id: templateId },
    data: { review_data: toolUse.input as object, updated_at: new Date() },
  }).catch((err) => console.error("[lease-review] Failed to cache review:", err));
  await syncLeaseTemplateClauses({
    templateId,
    organizationId: ctx.orgDbId,
    propertyId,
    schema: template.lease_schema as never,
    reviewData: toolUse.input as object,
  }).catch((err) => console.error("[lease-review] Failed to sync clauses:", err));
  await syncStateSpecificLeaseClauses({
    organizationId: ctx.orgDbId,
    propertyState: template.properties.state,
    reviewData: toolUse.input as object,
  }).catch((err) => console.error("[lease-review] Failed to sync state clauses:", err));

  return Response.json(toolUse.input);
}
