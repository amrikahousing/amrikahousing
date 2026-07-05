export const maxDuration = 300;
export const runtime = "nodejs";

import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getBlobToken } from "@/lib/blob-token";
import { buildCorrectedTemplateDocx, extractLeaseSchema, rewriteClausesInDocx } from "@/lib/fill-lease";
import { rewriteLeaseClauses, type ClauseRewriteInput } from "@/lib/lease-clause-rewrite";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type RouteContext = { params: Promise<{ id: string }> };

type ReviewData = {
  clauseSummaries?: Array<{ title?: string; summary?: string; riskLevel?: string; explanation?: string }>;
  missingConcepts?: Array<{ concept?: string; importance?: string; description?: string }>;
  stateLawNotes?: Array<{ area?: string; note?: string; risk?: string }>;
  readabilitySuggestions?: Array<{ section?: string; issue?: string; suggestion?: string }>;
  overallRiskLevel?: string;
  [key: string]: unknown;
};

type FixBody = {
  blobUrl?: string;
  fileName?: string;
  review?: ReviewData;
  selections?: {
    clauseTitles?: string[];
    missingConcepts?: string[];
    stateLawAreas?: string[];
    readabilitySections?: string[];
  };
};

function lc(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    return await handlePost(request, context);
  } catch (err) {
    console.error("[lease-fix] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return Response.json({ error: message }, { status: 500 });
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

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OLLAMA_BASE_URL) {
    return Response.json({ error: "AI clause rewrite is not configured." }, { status: 503 });
  }

  const body = ((await request.json().catch(() => ({}))) ?? {}) as FixBody;
  if (!body.blobUrl) {
    return Response.json({ error: "Template file is required." }, { status: 422 });
  }
  console.log("[lease-fix] START", JSON.stringify({ fileName: body.fileName, selections: body.selections }));

  const property = await prisma.properties.findFirst({
    where: { id: propertyId, organization_id: ctx.orgDbId, deleted_at: null },
    select: { state: true },
  });

  // Clause bodies (with {{tokens}}) come from extracting the uploaded file.
  let schema;
  try {
    schema = await extractLeaseSchema(body.blobUrl);
  } catch (err) {
    console.error("[lease-fix] schema extraction failed:", err);
    return Response.json(
      { error: "Could not read the template's clauses. Try re-uploading the file." },
      { status: 422 },
    );
  }

  const review = (body.review ?? {}) as ReviewData;
  const currentClauses = (schema.clauses ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ title: c.title, body: c.body ?? "" }));

  const sel = body.selections ?? {};
  const pickBy = <T>(items: T[], key: (item: T) => string, chosen?: string[]) => {
    const set = new Set((chosen ?? []).map((s) => s.trim().toLowerCase()));
    return items.filter((item) => set.has(key(item)));
  };

  const riskyClauses = pickBy(review.clauseSummaries ?? [], (c) => lc(c.title), sel.clauseTitles).map((c) => ({
    title: c.title ?? "",
    summary: c.summary,
    explanation: c.explanation,
    riskLevel: c.riskLevel,
  }));
  const missingConcepts = pickBy(review.missingConcepts ?? [], (m) => lc(m.concept), sel.missingConcepts).map((m) => ({
    concept: m.concept ?? "",
    importance: m.importance,
    description: m.description,
  }));
  const stateLawNotes = pickBy(review.stateLawNotes ?? [], (s) => lc(s.area), sel.stateLawAreas).map((s) => ({
    area: s.area ?? "",
    note: s.note,
    risk: s.risk,
  }));
  const readabilitySuggestions = pickBy(review.readabilitySuggestions ?? [], (r) => lc(r.section), sel.readabilitySections).map((r) => ({
    section: r.section,
    issue: r.issue,
    suggestion: r.suggestion,
  }));

  const totalFindings =
    riskyClauses.length + missingConcepts.length + stateLawNotes.length + readabilitySuggestions.length;
  if (totalFindings === 0) {
    return Response.json({ error: "No findings were selected to fix." }, { status: 422 });
  }

  const rewriteInput: ClauseRewriteInput = {
    currentClauses,
    riskyClauses,
    missingConcepts,
    stateLawNotes,
    readabilitySuggestions,
    state: property?.state ?? undefined,
  };

  const result = await rewriteLeaseClauses(rewriteInput);
  if (result.clauses.length === 0) {
    return Response.json({ error: "The rewrite produced no clauses." }, { status: 502 });
  }

  // Split the merged result into "rewrites" (existing clauses whose wording changed)
  // and "additions" (brand-new clauses) so we can edit the original file in place.
  const origBodyByTitle = new Map(currentClauses.map((c) => [c.title.trim().toLowerCase(), c.body] as const));
  const rewrites = result.clauses
    .filter((c) => !c.isNew && c.body !== (origBodyByTitle.get(c.title.trim().toLowerCase()) ?? c.body))
    .map((c) => ({ title: c.title, body: c.body }));
  const additions = result.clauses.filter((c) => c.isNew).map((c) => ({ title: c.title, body: c.body }));

  // For a DOCX upload, edit the ORIGINAL file in place so all formatting is kept.
  // For a PDF upload there is no editable .docx, so rebuild a clean one from clauses.
  let correctedBlobUrl: string;
  let fileBase64: string;
  let unmatchedTitles: string[] = [];
  const contentType = DOCX_MIME;
  let fileName: string;
  try {
    let docxBuffer: Buffer;
    if (schema.originalFormat === "docx") {
      const token = getBlobToken();
      const blobRes = await fetch(body.blobUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!blobRes.ok) throw new Error("Could not fetch the original template file.");
      const originalBuffer = Buffer.from(await blobRes.arrayBuffer());
      const edited = await rewriteClausesInDocx(originalBuffer, rewrites, additions);
      docxBuffer = edited.buffer;
      unmatchedTitles = edited.unmatchedTitles;
      fileName = body.fileName ?? "lease-template.docx";
    } else {
      const correctedClauses = result.clauses.map((c, index) => ({ title: c.title, body: c.body, order: index }));
      docxBuffer = await buildCorrectedTemplateDocx(correctedClauses);
      fileName = `${(body.fileName ?? "lease-template").replace(/\.[^.]+$/, "")} (fixed).docx`;
    }
    fileBase64 = docxBuffer.toString("base64");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `lease-templates/${ctx.orgDbId}/${propertyId}/template-fixed-${stamp}.docx`;
    const blob = await put(path, docxBuffer, { access: "private", token: getBlobToken() });
    correctedBlobUrl = blob.url;
  } catch (err) {
    console.error("[lease-fix] failed to build/upload corrected template:", err);
    return Response.json({ error: "Could not build the corrected template document." }, { status: 500 });
  }

  // Reflect the fixes in the review payload so the review UI shows the clauses passing.
  const fixedTitles = new Set(riskyClauses.map((c) => lc(c.title)));
  const droppedTitles = new Set(result.droppedTokenTitles.map((t) => t.toLowerCase()));
  const addressedConcepts = new Set(missingConcepts.map((m) => lc(m.concept)));
  const addressedAreas = new Set(stateLawNotes.map((s) => lc(s.area)));
  const addressedSections = new Set(readabilitySuggestions.map((r) => lc(r.section)));

  const nextReview: ReviewData = {
    ...review,
    clauseSummaries: (review.clauseSummaries ?? []).map((c) =>
      fixedTitles.has(lc(c.title)) && !droppedTitles.has(lc(c.title)) ? { ...c, riskLevel: "low" } : c,
    ),
    missingConcepts: (review.missingConcepts ?? []).filter((m) => !addressedConcepts.has(lc(m.concept))),
    stateLawNotes: (review.stateLawNotes ?? []).filter((s) => !addressedAreas.has(lc(s.area))),
    readabilitySuggestions: (review.readabilitySuggestions ?? []).filter((r) => !addressedSections.has(lc(r.section))),
  };
  const stillRisky = (nextReview.clauseSummaries ?? []).some(
    (c) => lc(c.riskLevel) === "medium" || lc(c.riskLevel) === "high",
  );
  nextReview.overallRiskLevel = stillRisky ? review.overallRiskLevel ?? "medium" : "low";

  return Response.json({
    blobUrl: correctedBlobUrl,
    fileBase64,
    contentType,
    fileName,
    review: nextReview,
    clauses: result.clauses,
    droppedTokenTitles: result.droppedTokenTitles,
    unmatchedTitles,
    changedCount: result.changedCount,
  });
}
