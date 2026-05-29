export const maxDuration = 120;

import mammoth from "mammoth";
import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { getBlobToken } from "@/lib/blob-token";
import {
  buildLeaseTemplateReviewSystemPrompt,
  buildLeaseTemplateReviewUserPrompt,
  leaseTemplateReviewTool,
} from "@/lib/lease-extract-prompt";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_BYTES = 50 * 1024 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

type AnthropicMessageResponse = {
  content: AnthropicContentBlock[];
  stop_reason: string;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    return await handlePost(request, context);
  } catch (err) {
    console.error("[lease-pre-review] Unhandled error:", err);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

async function handlePost(request: NextRequest, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id: propertyId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "AI review is not configured." }, { status: 503 });
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
  if (!ALLOWED_MIME.has(file.type) || file.size > MAX_BYTES) {
    return Response.json(
      { error: "Upload a PDF or DOCX template under 50MB for AI review." },
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

  // Read file bytes before uploading (put() may consume the stream)
  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to blob so it's ready to persist if user confirms
  const blob = await put(path, Buffer.from(buffer), { access: "private", token: getBlobToken() });

  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  let userContent: unknown[];

  if (isDocx) {
    let extractedText: string;
    try {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value.trim().slice(0, 16_000);
    } catch (err) {
      console.error("[lease-pre-review] DOCX text extraction failed:", err);
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
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[lease-pre-review] Anthropic API error:", response.status, errText);
    return Response.json({ error: "Could not analyze this lease template." }, { status: 502 });
  }

  const message = (await response.json()) as AnthropicMessageResponse;
  if (message.stop_reason === "max_tokens") {
    console.error("[lease-pre-review] Response truncated — increase max_tokens or reduce input");
    return Response.json({ error: "The lease document is too large to review in one pass. Try uploading a shorter document." }, { status: 422 });
  }

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    return Response.json({ error: "Could not extract review data from this document." }, { status: 422 });
  }

  return Response.json({
    review: toolUse.input,
    blobUrl: blob.url,
    contentType: file.type,
    fileName: file.name,
    name,
  });
}
