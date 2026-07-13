export const maxDuration = 300;
export const runtime = "nodejs";

import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getBlobToken } from "@/lib/blob-token";
import { buildCorrectedTemplateDocx, extractLeaseSchema, rewriteClausesInDocx } from "@/lib/fill-lease";
import { findCanonicalForLabel } from "@/lib/lease-canonical-clauses";
import { rewriteLeaseClauses, type ClauseRewriteResult } from "@/lib/lease-clause-rewrite";
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
  // The review payload comes from an LLM tool call — a field can occasionally
  // arrive as a non-array despite the schema, so coerce before filtering.
  const arr = <T,>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);
  const pickBy = <T>(items: T[], key: (item: T) => string, chosen?: string[]) => {
    const set = new Set((chosen ?? []).map((s) => s.trim().toLowerCase()));
    return arr(items).filter((item) => set.has(key(item)));
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

  const state = property?.state ?? undefined;

  // Standard/state-law findings covered by a curated canonical clause are inserted
  // deterministically (exact vetted text, {{tokens}} intact) rather than via an AI
  // rewrite that can drop a token or drift in wording. Pull those out so the AI only
  // handles the subjective findings (risky wording, readability, non-canonical gaps).
  const canonicalAdditions: Array<{ title: string; body: string }> = [];
  const seenCanonical = new Set<string>();
  const takeCanonical = (clause: ReturnType<typeof findCanonicalForLabel>) => {
    if (clause && !seenCanonical.has(clause.topic)) {
      seenCanonical.add(clause.topic);
      canonicalAdditions.push({ title: clause.title, body: clause.body });
    }
    return Boolean(clause);
  };
  const missingForAI = missingConcepts.filter((m) => !takeCanonical(findCanonicalForLabel(state, "missing", m.concept)));
  const stateLawForAI = stateLawNotes.filter((s) => !takeCanonical(findCanonicalForLabel(state, "stateLaw", s.area)));

  const aiWorkCount =
    riskyClauses.length + missingForAI.length + stateLawForAI.length + readabilitySuggestions.length;

  let result: ClauseRewriteResult;
  if (aiWorkCount > 0) {
    result = await rewriteLeaseClauses({
      currentClauses,
      riskyClauses,
      missingConcepts: missingForAI,
      stateLawNotes: stateLawForAI,
      readabilitySuggestions,
      state,
    });
    if (result.clauses.length === 0) {
      return Response.json({ error: "The rewrite produced no clauses." }, { status: 502 });
    }
  } else {
    // Everything selected is handled by canonical clauses — skip the AI rewrite.
    result = {
      clauses: currentClauses.map((c) => ({
        title: c.title,
        body: c.body,
        changeNote: "",
        isNew: false,
        isRewritten: false,
        riskLevel: "low" as const,
      })),
      droppedTokenTitles: [],
      unmatchedRewriteTitles: [],
      changedCount: 0,
    };
  }

  // Split the AI result into rewrites (existing clauses whose wording changed) and
  // additions (brand-new clauses), then append the deterministic canonical clauses.
  const rewrites = result.clauses
    .filter((c) => c.isRewritten)
    .map((c) => ({ title: c.title, body: c.body }));
  const additions = [
    ...result.clauses.filter((c) => c.isNew).map((c) => ({ title: c.title, body: c.body })),
    ...canonicalAdditions,
  ];

  // Build the review that ships inside the corrected file (and updates the UI).
  // Applying fixes resolves the whole review sheet: selected items are fixed, and
  // items the user saw but chose NOT to fix are dismissed — hidden entirely, so a
  // re-upload of this exact file comes back clean instead of re-flagging them.
  // (Editing the file in Word breaks the marker hash and triggers a fresh review.)
  // Clauses whose fix FAILED are re-flagged after the document build below.
  const fixedTitles = new Set(riskyClauses.map((c) => lc(c.title)));
  const droppedTitles = new Set(result.droppedTokenTitles.map((t) => t.toLowerCase()));

  const nextReview: ReviewData = {
    ...review,
    clauseSummaries: arr(review.clauseSummaries).map((c) => {
      const t = lc(c.title);
      if (droppedTitles.has(t)) return c; // fix failed (token dropped) — stays flagged
      if (fixedTitles.has(t)) return { ...c, riskLevel: "low" };
      const level = lc(c.riskLevel);
      return level === "medium" || level === "high" ? { ...c, riskLevel: "low", skipped: true } : c;
    }),
    missingConcepts: [],
    stateLawNotes: [],
    readabilitySuggestions: [],
  };

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
      // Both miss types mean "this clause was NOT fixed in place — edit it manually":
      // titles the model returned that match no extracted clause, and titles whose
      // paragraphs couldn't be located in the document XML.
      unmatchedTitles = [...new Set([...result.unmatchedRewriteTitles, ...edited.unmatchedTitles])];
      fileName = body.fileName ?? "lease-template.docx";
    } else {
      const correctedClauses = result.clauses.map((c, index) => ({ title: c.title, body: c.body, order: index }));
      docxBuffer = await buildCorrectedTemplateDocx(correctedClauses);
      unmatchedTitles = result.unmatchedRewriteTitles;
      fileName = `${(body.fileName ?? "lease-template").replace(/\.[^.]+$/, "")} (fixed).docx`;
    }
    // A clause whose in-place fix failed still has its original wording in the
    // document — restore its original review entry so it stays flagged instead of
    // shipping as "low" inside the marker.
    const failedTitles = new Set(unmatchedTitles.map((t) => t.trim().toLowerCase()));
    if (failedTitles.size > 0) {
      const originalByTitle = new Map(arr(review.clauseSummaries).map((c) => [lc(c.title), c] as const));
      nextReview.clauseSummaries = arr(nextReview.clauseSummaries).map((c) =>
        failedTitles.has(lc(c.title)) ? originalByTitle.get(lc(c.title)) ?? c : c,
      );
    }
    const stillRisky = arr(nextReview.clauseSummaries).some(
      (c) => lc(c.riskLevel) === "medium" || lc(c.riskLevel) === "high",
    );
    nextReview.overallRiskLevel = stillRisky ? review.overallRiskLevel ?? "medium" : "low";
    // nextReview is returned to the UI so it reflects the fixes immediately, but it is
    // NOT embedded in the file — a re-upload runs a fresh AI review to verify the fixes.
    fileBase64 = docxBuffer.toString("base64");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `lease-templates/${ctx.orgDbId}/${propertyId}/template-fixed-${stamp}.docx`;
    const blob = await put(path, docxBuffer, { access: "private", token: getBlobToken() });
    correctedBlobUrl = blob.url;
  } catch (err) {
    console.error("[lease-fix] failed to build/upload corrected template:", err);
    return Response.json({ error: "Could not build the corrected template document." }, { status: 500 });
  }

  return Response.json({
    blobUrl: correctedBlobUrl,
    fileBase64,
    contentType,
    fileName,
    review: nextReview,
    clauses: result.clauses,
    droppedTokenTitles: result.droppedTokenTitles,
    unmatchedTitles,
    changedCount: result.changedCount + canonicalAdditions.length,
  });
}
