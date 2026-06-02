export const maxDuration = 180;

import mammoth from "mammoth";
import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { getBlobToken } from "@/lib/blob-token";
import {
  buildLeaseTemplateReviewSystemPrompt,
  buildLeaseTemplateReviewUserPrompt,
  leaseTemplateReviewTool,
} from "@/lib/lease-extract-prompt";
import { extractLeaseSchema, extractLeaseSchemaFromText } from "@/lib/fill-lease";
import { registerSchemaExtraction } from "@/lib/lease-schema-cache";
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
  // Optional: text already extracted in the browser via pdfjs/mammoth.
  // When present, we skip Phase 1 (Claude PDF-to-text) and only run Phase 2 (pairs).
  const clientExtractedTextRaw = form.get("clientExtractedText");
  const clientExtractedText = typeof clientExtractedTextRaw === "string" && clientExtractedTextRaw.trim().length > 100
    ? clientExtractedTextRaw
    : null;
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

  // Kick off schema extraction in the BACKGROUND. Two paths:
  //   1. FAST: client extracted the text already → only run Phase 2 (pairs)  → ~15-30s
  //   2. SLOW: no client text → full server pipeline with Claude Phase 1+2   → ~45-80s
  const isDocxFile = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const schemaPromise = (clientExtractedText
    ? extractLeaseSchemaFromText(clientExtractedText, isDocxFile ? "docx" : "pdf")
    : extractLeaseSchema({ buffer })
  ).catch((err) => {
    console.error("[lease-pre-review] schema extraction failed:", err);
    return null;
  });
  registerSchemaExtraction(blob.url, schemaPromise);

  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  let userContent: unknown[];

  // Prefer client-extracted text when available — even for PDFs. This is a huge
  // speedup: Claude reviews plain text in ~5-8s instead of re-parsing a 20-page
  // PDF (which can take 30s+ via the document API).
  if (clientExtractedText) {
    userContent = [
      {
        type: "text",
        text: buildLeaseTemplateReviewUserPrompt({ hasDocxText: true, text: clientExtractedText.slice(0, 16_000) }),
      },
    ];
  } else if (isDocx) {
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

  // Only wait for the AI clause review here. Schema extraction continues in the
  // background; clients pick it up via the preview route which awaits the cached promise.
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
    // Schema is being extracted in background — client should call preview later;
    // preview route will await the cached extraction promise.
    schemaPending: true,
  });
}
