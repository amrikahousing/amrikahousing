// ─── Canonical (playbook) clause library ──────────────────────────────────────
// The open-ended AI review is unreliable for "what standard/state-law clauses does
// this lease need": it re-flags provisions that are already present and invents a
// different list on every run. For a KNOWN, finite set of required clauses we don't
// need the model to decide — we keep a curated, vetted clause per (state, topic) and:
//   • CHECK deterministically: is this topic already covered in the document? If yes,
//     never flag it; if no, flag it with a stable, always-identical finding.
//   • FIX deterministically: insert the exact canonical clause text (tokens intact),
//     instead of an AI rewrite that may drop a {{token}} or drift in wording.
// Subjective findings (risky wording, readability) stay with the AI reviewer — this
// library only governs the standard/state-law checklist where the false positives are.
//
// IMPORTANT: the clause BODIES below are starter template language and MUST be
// reviewed by counsel before relying on them. Adjust freely — the wiring doesn't care
// about the exact text, only that each topic has one canonical body + detection words.

export type CanonicalCategory = "stateLaw" | "missing";

export interface CanonicalClause {
  /** Stable id, e.g. "ct_security_deposit". */
  topic: string;
  /** Two-letter state code this clause applies to, uppercase. */
  state: string;
  /** Which review bucket the finding appears under. */
  category: CanonicalCategory;
  /** Heading inserted into the DOCX when this clause is added. */
  title: string;
  /** Finding label shown in the UI (the `area` for stateLaw, `concept` for missing). */
  displayName: string;
  /** Finding description shown in the UI. */
  note: string;
  /** stateLaw severity. */
  risk?: "info" | "caution" | "warning";
  /** missing-concept importance. */
  importance?: "recommended" | "important" | "critical";
  /** Canonical clause text (with {{tokens}}) inserted into the document on fix. */
  body: string;
  /** Lowercase words checked against the DOCUMENT to decide if the topic is covered. */
  detectKeywords: string[];
  /** Lowercase words checked against an AI FINDING's label to decide it's this topic. */
  matchKeywords: string[];
  /** Fraction of detectKeywords that must appear for the topic to count as covered. */
  minCoverage?: number;
}

const CT_CLAUSES: CanonicalClause[] = [
  {
    topic: "ct_security_deposit",
    state: "CT",
    category: "stateLaw",
    title: "SECURITY DEPOSIT",
    displayName: "Security Deposit — Connecticut (CGS §47a-21)",
    note: "Connecticut caps the deposit (two months' rent, or one month if the tenant is 62+) and requires return with an itemized statement within 30 days (or 15 days after the tenant gives a forwarding address), plus interest. State a compliant deposit clause.",
    risk: "caution",
    body:
      "SECURITY DEPOSIT: Tenant shall pay a security deposit of {{security_deposit}} to secure Tenant's performance under this Lease. In accordance with Connecticut General Statutes §47a-21, the security deposit shall not exceed two (2) months' rent (or one (1) month's rent if Tenant is sixty-two (62) years of age or older). Landlord shall hold the deposit in an escrow account and pay interest as required by law. Within thirty (30) days after termination of the tenancy, or within fifteen (15) days after Tenant provides a forwarding address (whichever is later), Landlord shall return the deposit together with accrued interest, less the itemized amount of any damages beyond normal wear and tear, accompanied by a written statement itemizing such deductions.",
    detectKeywords: ["security deposit", "47a-21", "itemized", "forwarding address", "interest"],
    matchKeywords: ["deposit"],
    minCoverage: 0.6,
  },
  {
    topic: "ct_lead_paint",
    state: "CT",
    category: "stateLaw",
    title: "LEAD-BASED PAINT DISCLOSURE",
    displayName: "Lead-Based Paint Disclosure (42 U.S.C. §4852d)",
    note: "Federal law requires a lead-based paint disclosure and EPA pamphlet for housing built before 1978. Include the disclosure clause.",
    risk: "warning",
    body:
      "LEAD-BASED PAINT DISCLOSURE: For any dwelling constructed prior to 1978, Landlord discloses, in accordance with 42 U.S.C. §4852d and 24 C.F.R. Part 35, the presence of any known lead-based paint and/or lead-based paint hazards in the Premises, and provides Tenant with any available records and reports. Tenant acknowledges receipt of the EPA-approved pamphlet \"Protect Your Family from Lead in Your Home.\" Tenant has been given the opportunity to conduct a risk assessment or inspection for lead-based paint hazards prior to becoming obligated under this Lease.",
    detectKeywords: ["lead-based paint", "1978", "4852d", "disclosure", "hazard"],
    matchKeywords: ["lead"],
    minCoverage: 0.5,
  },
  {
    topic: "ct_smoke_co_detectors",
    state: "CT",
    category: "stateLaw",
    title: "SMOKE AND CARBON MONOXIDE DETECTORS",
    displayName: "Smoke & Carbon Monoxide Detectors (CGS §47a-7)",
    note: "Connecticut requires working smoke and carbon monoxide detection. State the detectors are operational at move-in and assign testing responsibility.",
    risk: "info",
    body:
      "SMOKE AND CARBON MONOXIDE DETECTORS: Landlord certifies that the Premises are equipped with working smoke detectors and carbon monoxide detectors as required by Connecticut law. Tenant acknowledges that the detectors were tested and operational at the commencement of the tenancy. Tenant agrees to test the detectors regularly, replace batteries as needed, and promptly notify Landlord in writing of any detector that is not functioning. Tenant shall not disable, remove, or tamper with any detector.",
    detectKeywords: ["smoke detector", "carbon monoxide", "detector", "operational"],
    matchKeywords: ["smoke", "carbon monoxide", "detector"],
    minCoverage: 0.5,
  },
  {
    topic: "ct_habitability",
    state: "CT",
    category: "stateLaw",
    title: "LANDLORD MAINTENANCE AND HABITABILITY",
    displayName: "Habitability & Landlord Maintenance (CGS §47a-7)",
    note: "Connecticut requires the landlord to keep the premises fit and habitable and to make necessary repairs. Include the landlord maintenance obligation.",
    risk: "caution",
    body:
      "LANDLORD MAINTENANCE AND HABITABILITY: In accordance with Connecticut General Statutes §47a-7, Landlord shall maintain the Premises in a fit and habitable condition; comply with applicable building and housing codes materially affecting health and safety; keep common areas clean and safe; maintain in good and safe working order the electrical, plumbing, sanitary, heating, ventilating, and air-conditioning systems and appliances supplied by Landlord; and provide and maintain appropriate receptacles for garbage and arrange for its removal. Landlord shall make necessary repairs within a reasonable time after written notice from Tenant.",
    detectKeywords: ["habitable", "47a-7", "fit", "repair", "maintain"],
    matchKeywords: ["habitab", "maintenance", "maintain", "repair", "fit for"],
    minCoverage: 0.6,
  },
  {
    topic: "ct_pet_policy",
    state: "CT",
    category: "missing",
    title: "PET POLICY",
    displayName: "Pet Policy & Restrictions",
    note: "The lease should state whether pets are permitted, any pet fee or deposit, and the tenant's responsibility for pet-related damage.",
    importance: "recommended",
    body:
      "PET POLICY: No pet or animal of any kind shall be kept on the Premises without Landlord's prior written consent. Where Landlord consents, Tenant shall pay a pet fee of {{pet_fee_amount}} and shall be responsible for all damage, cleaning, extermination, and liability arising from the pet. Tenant shall comply with all applicable leash, noise, waste-removal, and local animal-control requirements. This provision does not apply to assistance animals or service animals required as a reasonable accommodation under applicable fair housing law.",
    detectKeywords: ["pet", "animal", "pet fee", "pet_fee_amount"],
    matchKeywords: ["pet", "animal"],
    minCoverage: 0.5,
  },
];

const LIBRARY: CanonicalClause[] = [...CT_CLAUSES];

export function getCanonicalClauses(state?: string | null): CanonicalClause[] {
  const s = (state ?? "").trim().toUpperCase();
  if (!s) return [];
  return LIBRARY.filter((c) => c.state === s);
}

function isCovered(lowerText: string, clause: CanonicalClause): boolean {
  const kws = clause.detectKeywords;
  if (kws.length === 0) return false;
  const hits = kws.filter((k) => lowerText.includes(k.toLowerCase())).length;
  return hits / kws.length >= (clause.minCoverage ?? 0.6);
}

function findingMatchesTopic(label: string, clause: CanonicalClause): boolean {
  const l = label.toLowerCase();
  return clause.matchKeywords.some((k) => l.includes(k.toLowerCase()));
}

type ReviewShape = {
  missingConcepts?: Array<{ concept?: string; importance?: string; description?: string }>;
  stateLawNotes?: Array<{ area?: string; note?: string; risk?: string }>;
  [k: string]: unknown;
};

const arr = <T,>(v: T[] | undefined | unknown): T[] => (Array.isArray(v) ? v : []);

/**
 * Replace the AI's guesses about canonical topics with deterministic checklist
 * results: for every curated clause, drop any AI finding about that topic, then re-add
 * a single stable finding ONLY if the document doesn't already cover it. Non-canonical
 * AI findings (risky wording, one-off gaps, other states' notes) pass through untouched.
 */
export function reconcileReviewWithCanonical(
  review: ReviewShape,
  documentText: string,
  state?: string | null,
): ReviewShape {
  const clauses = getCanonicalClauses(state);
  if (clauses.length === 0) return review;

  const lower = documentText.toLowerCase();
  let stateLaw = arr(review.stateLawNotes) as Array<{ area?: string; note?: string; risk?: string }>;
  let missing = arr(review.missingConcepts) as Array<{ concept?: string; importance?: string; description?: string }>;

  for (const c of clauses) {
    if (c.category === "stateLaw") {
      stateLaw = stateLaw.filter((n) => !findingMatchesTopic(n.area ?? "", c));
      if (!isCovered(lower, c)) {
        stateLaw.push({ area: c.displayName, note: c.note, risk: c.risk ?? "caution" });
      }
    } else {
      missing = missing.filter((n) => !findingMatchesTopic(n.concept ?? "", c));
      if (!isCovered(lower, c)) {
        missing.push({ concept: c.displayName, importance: c.importance ?? "recommended", description: c.note });
      }
    }
  }

  return { ...review, stateLawNotes: stateLaw, missingConcepts: missing };
}

/**
 * For the fix route: given ONE selected finding's label and its bucket, return the
 * canonical clause that handles it (or undefined). The fix route inserts the clause's
 * canonical body deterministically instead of asking the AI to rewrite it, and removes
 * the finding from what it sends to the AI so it isn't handled twice.
 */
export function findCanonicalForLabel(
  state: string | null | undefined,
  category: CanonicalCategory,
  label: string,
): CanonicalClause | undefined {
  return getCanonicalClauses(state)
    .filter((c) => c.category === category)
    .find((c) => findingMatchesTopic(label, c) || label.trim().toLowerCase() === c.displayName.trim().toLowerCase());
}
