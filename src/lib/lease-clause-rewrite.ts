// ─── AI clause rewrite ───────────────────────────────────────────────────────
// Given a template's current clauses plus the review findings the user chose to
// fix, ask the model for ONLY the changed clauses (rewrites) and any brand-new
// clauses (additions) — not the whole set. We merge those into the original
// clause list server-side. Returning just the deltas keeps the model's output
// small so it doesn't truncate at max_tokens (which produced empty results when
// we asked it to echo every clause).
//
// The generated lease is rebuilt from these clause bodies, so every {{token}}
// placeholder MUST survive a rewrite — a dropped token means a tenant-data field
// silently disappears from the lease.

import { llmFetchWithTools } from "@/lib/llm";

export interface RewriteClause {
  title: string;
  body: string;
}

export interface RewriteRiskyClause {
  title: string;
  summary?: string;
  explanation?: string;
  riskLevel?: string;
}

export interface RewriteMissingConcept {
  concept: string;
  importance?: string;
  description?: string;
}

export interface RewriteStateLawNote {
  area: string;
  note?: string;
  risk?: string;
}

export interface RewriteReadabilitySuggestion {
  section?: string;
  issue?: string;
  suggestion?: string;
}

export interface ClauseRewriteInput {
  currentClauses: RewriteClause[];
  riskyClauses: RewriteRiskyClause[];
  missingConcepts: RewriteMissingConcept[];
  stateLawNotes: RewriteStateLawNote[];
  readabilitySuggestions: RewriteReadabilitySuggestion[];
  state?: string;
}

export interface RewrittenClause {
  title: string;
  body: string;
  changeNote: string;
  isNew: boolean;
  /** True when the model rewrote this existing clause (distinguishes it from an
   *  unchanged clause — callers must not infer this by comparing bodies, because
   *  duplicate titles make body-by-title lookups ambiguous). */
  isRewritten: boolean;
  riskLevel: "low" | "medium" | "high";
}

export interface ClauseRewriteResult {
  clauses: RewrittenClause[];
  /** Titles of clauses whose rewrite was rejected because it dropped a {{token}}. */
  droppedTokenTitles: string[];
  /** Rewrite titles that matched no existing clause — the originals were kept unchanged. */
  unmatchedRewriteTitles: string[];
  /** How many clauses were rewritten / added (for user feedback). */
  changedCount: number;
}

// The rewrites' title field is enum-locked to the extracted clause titles: a title
// the merge can't match would otherwise leave the risky original in the document
// while a near-duplicate "fixed" clause gets appended elsewhere.
function buildRewriteTool(clauseTitles: string[]) {
  const titleSchema: Record<string, unknown> = {
    type: "string",
    description: "The exact title of the existing clause being rewritten.",
  };
  if (clauseTitles.length > 0) titleSchema.enum = clauseTitles;
  return {
    name: "emit_clause_fixes",
    description:
      "Return ONLY the clauses that changed (rewrites) and any new clauses to add (additions). Do NOT echo unchanged clauses.",
    input_schema: {
      type: "object",
      properties: {
        rewrites: {
          type: "array",
          description: "Existing clauses you rewrote. Match each to an existing clause by its exact title.",
          items: {
            type: "object",
            properties: {
              title: titleSchema,
              body: {
                type: "string",
                description: "The full rewritten clause text. Preserve every {{token}} from the original clause exactly.",
              },
              changeNote: { type: "string", description: "One short sentence on what was fixed." },
            },
            required: ["title", "body", "changeNote"],
          },
        },
        additions: {
          type: "array",
          description: "Brand-new clauses to add (for missing provisions or state-law requirements).",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Heading for the new clause." },
              body: { type: "string", description: "Full clause text. Use {{tokens}} for any variable data." },
              afterTitle: {
                type: "string",
                description: "Title of the existing clause this should be inserted AFTER, or empty string to append at the end.",
              },
              changeNote: { type: "string", description: "One short sentence on why this clause was added." },
            },
            required: ["title", "body", "afterTitle", "changeNote"],
          },
        },
      },
      required: ["rewrites", "additions"],
    },
  };
}

function buildSystemPrompt(state?: string) {
  return [
    "You are a senior landlord-side residential-lease attorney revising a lease TEMPLATE (reused across many tenants).",
    "Fix the flagged problems. Return ONLY the deltas: rewritten existing clauses and brand-new clauses — never echo unchanged clauses.",
    "",
    "Rules:",
    "1. Rewrite each flagged risky/unclear clause so it is legally sound, enforceable, plainly worded, and" +
      (state ? ` compliant with ${state} landlord-tenant law.` : " compliant with applicable state landlord-tenant law."),
    "2. For each selected 'missing provision' or 'state-law requirement': if an existing clause already covers that subject, REWRITE that clause to satisfy it; only ADD a new clause when nothing in the lease covers the subject. Never create a second clause on a subject the lease already has (e.g. never add 'SECURITY DEPOSIT — COMPLIANCE' when a SECURITY DEPOSIT clause exists — rewrite the existing one instead).",
    "3. For each selected 'readability' item, rewrite the referenced clause more clearly without changing its legal meaning.",
    "4. CRITICAL — PLACEHOLDER SAFETY: clause bodies contain {{double_brace}} tokens (e.g. {{tenant_name}}, {{rent_amount}}). These are filled with real data later. Keep every {{token}} that appears in an original clause, spelled exactly the same. Never remove, rename, or invent {{tokens}}.",
    "5. Keep it a template: never insert tenant-specific values — use {{tokens}} for anything variable.",
    "6. Only touch what the user selected. Do not rewrite clauses that were not flagged.",
    "7. A rewrite's title must be one of the CURRENT CLAUSES titles, copied exactly. If a flagged problem sits inside a larger clause, rewrite that whole clause (fixing only the flagged part). Never emit a rewrite or addition that restates a provision the lease already contains.",
  ].join("\n");
}

function buildUserPrompt(input: ClauseRewriteInput) {
  const parts: string[] = [];

  parts.push("CURRENT CLAUSES (title, then body):");
  if (input.currentClauses.length === 0) {
    parts.push("(none extracted)");
  } else {
    input.currentClauses.forEach((c, i) => {
      parts.push(`\n[${i + 1}] ${c.title}\n${c.body || "(empty)"}`);
    });
  }

  if (input.riskyClauses.length) {
    parts.push("\n\nRISKY / PROBLEM CLAUSES TO REWRITE:");
    input.riskyClauses.forEach((c) => {
      parts.push(`- "${c.title}"${c.riskLevel ? ` [${c.riskLevel}]` : ""}: ${c.explanation || c.summary || "improve this clause"}`);
    });
  }

  if (input.missingConcepts.length) {
    parts.push("\n\nMISSING PROVISIONS TO SATISFY (rewrite the covering clause if one exists, else add one new clause):");
    input.missingConcepts.forEach((m) => {
      parts.push(`- ${m.concept}${m.importance ? ` [${m.importance}]` : ""}: ${m.description || ""}`);
    });
  }

  if (input.stateLawNotes.length) {
    parts.push("\n\nSTATE-LAW REQUIREMENTS TO SATISFY (add or amend a clause):");
    input.stateLawNotes.forEach((s) => {
      parts.push(`- ${s.area}${s.risk ? ` [${s.risk}]` : ""}: ${s.note || ""}`);
    });
  }

  if (input.readabilitySuggestions.length) {
    parts.push("\n\nREADABILITY IMPROVEMENTS:");
    input.readabilitySuggestions.forEach((r) => {
      parts.push(`- ${r.section ? `${r.section}: ` : ""}${r.issue || ""}${r.suggestion ? ` → ${r.suggestion}` : ""}`);
    });
  }

  parts.push(
    "\n\nReturn only the rewrites and additions via the emit_clause_fixes tool. Preserve every {{token}} exactly.",
  );
  return parts.join("\n");
}

const TOKEN_RE = /\{\{[^}]+\}\}/g;

function tokensIn(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

/**
 * The model sometimes repeats the clause title at the start of the body it
 * returns; the document render emits the title itself, so a repeated one would
 * show doubled ("SECURITY DEPOSIT: SECURITY DEPOSIT: …"). Only strips when a
 * separator follows the title — a body whose first words merely coincide with
 * the title ("Damage to the unit…" under DAMAGE) is left alone.
 */
function stripLeadingTitle(body: string, title: string): string {
  const b = body.trimStart();
  if (!title || b.slice(0, title.length).toLowerCase() !== title.toLowerCase()) return b;
  const after = b.slice(title.length);
  const sep = after.match(/^\s*[:.\-–—]+\s*/);
  if (!sep) return b;
  return after.slice(sep[0].length);
}

const SHINGLE_WORDS = 10;

function normForOverlap(text: string) {
  return text.toLowerCase().replace(/\{\{[^}]+\}\}/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Returns a matcher that maps an addition to the index of an existing clause it
 * restates, or undefined when it is genuinely new. A clause matches when the
 * normalized titles share a prefix (one extends the other), or when the addition
 * body contains a verbatim run of SHINGLE_WORDS words copied from a clause body —
 * ten identical words in a row only happen when the model copied the clause.
 */
function buildClauseOverlapMatcher(clauses: RewriteClause[]) {
  const titles = clauses.map((c) => normForOverlap(c.title));
  const shingleOwner = new Map<string, number>();
  clauses.forEach((c, i) => {
    const words = normForOverlap(c.body).split(" ");
    for (let w = 0; w + SHINGLE_WORDS <= words.length; w++) {
      shingleOwner.set(words.slice(w, w + SHINGLE_WORDS).join(" "), i);
    }
  });

  return (title: string, body: string): number | undefined => {
    const nt = normForOverlap(title);
    if (nt.length >= 6) {
      for (let i = 0; i < titles.length; i++) {
        const ct = titles[i];
        if (ct.length >= 6 && (nt.startsWith(ct) || ct.startsWith(nt))) return i;
      }
    }
    const words = normForOverlap(body).split(" ");
    for (let w = 0; w + SHINGLE_WORDS <= words.length; w++) {
      const owner = shingleOwner.get(words.slice(w, w + SHINGLE_WORDS).join(" "));
      if (owner !== undefined) return owner;
    }
    return undefined;
  };
}

type ToolResponse = {
  stop_reason?: string;
  content?: Array<{ type: string; input?: unknown }>;
};

type RewriteItem = { title?: unknown; body?: unknown; changeNote?: unknown };
type AdditionItem = RewriteItem & { afterTitle?: unknown };

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Ask the model for the changed/added clauses, then merge them into the original
 * clause list. Rewrites that would drop a {{token}} are rejected (original kept).
 */
export async function rewriteLeaseClauses(input: ClauseRewriteInput): Promise<ClauseRewriteResult> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OLLAMA_BASE_URL) {
    throw new Error("AI clause rewrite is not configured.");
  }

  const rewriteTool = buildRewriteTool(input.currentClauses.map((c) => c.title));
  const response = (await llmFetchWithTools({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 12000,
    tools: [rewriteTool],
    tool_choice: { type: "tool", name: rewriteTool.name },
    system: buildSystemPrompt(input.state),
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  })) as ToolResponse;

  const toolUse = response.content?.find((b) => b.type === "tool_use");
  const inputObj = (toolUse?.input ?? {}) as { rewrites?: unknown; additions?: unknown };
  const rewrites: RewriteItem[] = Array.isArray(inputObj.rewrites) ? inputObj.rewrites : [];
  let additions: AdditionItem[] = Array.isArray(inputObj.additions) ? inputObj.additions : [];

  if (!toolUse) {
    if (response.stop_reason === "max_tokens") {
      throw new Error("The rewrite was too large to complete. Try selecting fewer clauses to fix at once.");
    }
    throw new Error("The model did not return any clause fixes.");
  }

  // The model sometimes returns a rewritten clause as an "addition" under an
  // invented name ("SECURITY DEPOSIT — STATE COMPLIANCE" next to an existing
  // SECURITY DEPOSIT clause). Appending those leaves the lease with two
  // conflicting clauses on one subject and the next review flags it all over
  // again, so any addition that overlaps an existing clause — by title prefix or
  // by a verbatim run of copied text — is converted into a rewrite of that clause.
  const overlapTarget = buildClauseOverlapMatcher(input.currentClauses);
  const trueAdditions: AdditionItem[] = [];
  for (const ad of additions) {
    const target = overlapTarget(str(ad.title), str(ad.body));
    if (target !== undefined) {
      rewrites.push({
        title: input.currentClauses[target].title,
        body: stripLeadingTitle(str(ad.body), str(ad.title)),
        changeNote: ad.changeNote,
      });
    } else {
      trueAdditions.push(ad);
    }
  }
  additions = trueAdditions;

  // Start from the original clauses in order; apply rewrites in place, insert additions.
  const result: RewrittenClause[] = input.currentClauses.map((c) => ({
    title: c.title,
    body: c.body,
    isNew: false,
    isRewritten: false,
    changeNote: "",
    riskLevel: "low",
  }));
  const indexByTitle = new Map(result.map((c, i) => [c.title.trim().toLowerCase(), i] as const));
  const originalByTitle = new Map(input.currentClauses.map((c) => [c.title.trim().toLowerCase(), c] as const));

  const droppedTokenTitles: string[] = [];
  const unmatchedRewriteTitles: string[] = [];
  let changedCount = 0;

  for (const rw of rewrites) {
    const title = str(rw.title);
    const body = stripLeadingTitle(str(rw.body), title);
    if (!title || !body) continue;
    const idx = indexByTitle.get(title.toLowerCase());
    if (idx === undefined) {
      // No matching existing clause. Appending it would leave the risky original in
      // the document next to a near-duplicate "fixed" clause, so keep the original
      // and report the miss instead.
      unmatchedRewriteTitles.push(title);
      continue;
    }
    const original = originalByTitle.get(title.toLowerCase());
    const missing = original ? tokensIn(original.body).filter((t) => !body.includes(t)) : [];
    if (missing.length > 0) {
      droppedTokenTitles.push(result[idx].title);
      result[idx] = {
        ...result[idx],
        riskLevel: "medium",
        changeNote: "Skipped auto-fix — the rewrite would have dropped a data placeholder, so the original wording was kept.",
      };
      continue;
    }
    result[idx] = { ...result[idx], body, isRewritten: true, changeNote: str(rw.changeNote), riskLevel: "low" };
    changedCount++;
  }

  for (const ad of additions) {
    const title = str(ad.title);
    const body = stripLeadingTitle(str(ad.body), title);
    if (!title || !body) continue;
    const newClause: RewrittenClause = { title, body, isNew: true, isRewritten: false, changeNote: str(ad.changeNote), riskLevel: "low" };
    const afterTitle = str(ad.afterTitle).toLowerCase();
    const afterIdx = afterTitle ? result.findIndex((c) => c.title.trim().toLowerCase() === afterTitle) : -1;
    if (afterIdx >= 0) result.splice(afterIdx + 1, 0, newClause);
    else result.push(newClause);
    changedCount++;
  }

  return { clauses: result, droppedTokenTitles, unmatchedRewriteTitles, changedCount };
}
