import { get } from "@vercel/blob";
import { getBlobToken } from "./blob-token";

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface LeaseData {
  primaryTenant: { firstName: string; lastName: string; email: string };
  additionalTenants: { firstName: string; lastName: string; email: string }[];
  propertyName: string;
  propertyAddress: string;
  unitNumber: string;
  startDate: string;
  endDate: string;
  rentAmount: string;
  securityDeposit?: string;
  organizationName?: string;
  landlordSignatory?: string;
  propertyManagerName?: string;
  propertyManagerEmail?: string;
  propertyManagerPhone?: string;
  earlyTerminationFee?: string;
  earlyTerminationMonths?: string;
  guestStayLimit?: string;
  condemnationNoticeDays?: string;
  includedAppliances?: string;
  lateFeeAmount?: string;
  lateFeeGraceDays?: string;
  lateFeePct?: string;
  petFeeAmount?: string;
  tenantPaidUtilities?: string;
}

export interface ExtractedLeaseClause {
  title: string;
  body: string;
  order: number;
}

export interface ExtractedLeaseSchema {
  schemaVersion: 1;
  originalFormat: "docx" | "pdf";
  jurisdiction?: string;
  landlordName?: string;
  landlordSignatory?: string;
  propertyManagerName?: string;
  propertyManagerEmail?: string;
  propertyManagerPhone?: string;
  // Property address components (set from the selected property at template generation time)
  propertyName?: string;
  propertyAddress?: string;
  propertyStreet?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;
  // Clause-specific default values extracted from the template
  earlyTerminationFee?: string;
  earlyTerminationMonths?: string;
  guestStayLimit?: string;
  condemnationNoticeDays?: string;
  includedAppliances?: string;
  lateFeeAmount?: string;
  lateFeeGraceDays?: string;
  lateFeePct?: string;
  petFeeAmount?: string;
  tenantPaidUtilities?: string;
  // Compact substitution pairs — used for format-preserving fill of the original DOCX
  pairs: Array<{ search: string; token: string }>;
  // Clause list — used for PDF fallback generation and future UI editing
  clauses: ExtractedLeaseClause[];
}

// ─── Token definitions ────────────────────────────────────────────────────────

const TOKEN_LIST = `
DATA TOKENS (filled from lease form data):
{{tenant_name}}             — full name of primary tenant / lessee only
{{tenant_email}}            — email of primary tenant
{{all_tenant_names}}        — ALL tenant names combined (primary + co-tenants), comma-separated — use this when the label says "Tenant(s)" or "All individuals on lease"
{{co_tenant_names}}         — co-tenant full names only (comma-separated), omit block if none
{{property_name}}           — property name
{{property_address}}              — full street address including city, state, zip
{{property_address_with_unit}}    — full address + unit number, e.g. "480 MYRTLE STREET UNIT 508, NEW BRITAIN, CT 06053" — use for "Premises" or "Property address being leased" fields
{{property_street}}               — street address only (no city/state/zip), e.g. "480 MYRTLE STREET"
{{unit_number}}             — unit number
{{lease_start}}             — lease start date (written out, e.g. June 1, 2026)
{{lease_end}}               — lease end date (written out)
{{rent_amount}}             — monthly rent, e.g. $2,500
{{rent_amount_words}}       — monthly rent written in words only, e.g. TWO THOUSAND FIVE HUNDRED
{{security_deposit}}        — security deposit, e.g. $5,000 (or N/A)
{{total_rent}}              — total rent for the full lease term, written in words and figures
{{organization_name}}       — name of the landlord company / LLC / owner entity (e.g. "AVON TOWERS LLC")
{{landlord_signatory}}      — full name of the individual who signs on behalf of the landlord/lessor (e.g. "AMIT LAKHOTIA") — this is the authorized representative of the landlord entity, NOT the property manager
{{property_manager_name}}   — full name of the individual property manager or point of contact
{{property_manager_email}}  — email address of the property manager or point of contact
{{property_manager_phone}}  — phone number of the property manager or point of contact
{{lease_term}}              — lease duration description, e.g. "12 months" or "month-to-month"
{{late_fee_amount}}         — flat late fee charged after the grace period, e.g. "$75.00"
{{late_fee_grace_days}}     — number of grace days before a late fee is charged, e.g. "5"
{{late_fee_pct}}            — late fee as a percentage of rent, e.g. "5%" — use only when the lease states a percentage instead of a flat dollar amount
{{pet_fee_amount}}          — monthly or one-time pet fee, e.g. "$50.00 per month"
{{tenant_paid_utilities}}   — comma-separated list of utilities the tenant is responsible for, e.g. "Electric, Gas"
{{early_termination_fee}}   — early lease termination fee dollar amount, e.g. "$3,200.00"
{{early_termination_months}} — number of months' rent used to calculate the ELT fee, e.g. "2 (two)"
{{guest_stay_limit}}        — maximum consecutive days an overnight guest may stay, e.g. "two (2) days"
{{condemnation_notice_days}} — notice period required after condemnation, e.g. "fifteen (15) days"
{{included_appliances}}     — appliances included in the unit, e.g. "Stove and Refrigerator"

E-SIGNATURE ANCHOR TAGS (DocuSeal fields — placed where the signer must act):
{{Sign;type=signature;role=Tenant 1}}    — signature field for primary tenant / lessee
{{Sign;type=signature;role=Tenant 2}}    — signature field for second tenant / lessee
{{Sign;type=signature;role=Manager}}     — signature field for landlord / lessor / agent / property manager
{{Initial;type=initials;role=Tenant 1}} — initials field for primary tenant / lessee
{{Initial;type=initials;role=Tenant 2}} — initials field for second tenant / lessee
{{Initial;type=initials;role=Manager}}  — initials field for landlord / lessor / agent
{{Date;type=date;role=Tenant 1}}        — signing date for primary tenant
{{Date;type=date;role=Tenant 2}}        — signing date for second tenant
{{Date;type=date;role=Manager}}         — signing date for landlord / lessor / agent
`.trim();

const SUBSTITUTION_SYSTEM = `You analyze lease templates and identify the exact variable values that must be replaced with tokens.

Return a JSON array of {search, token} pairs. Rules:

WHAT TO PUT IN "search":
- ONLY the variable value itself — never the surrounding label or caption
- Examples of what NOT to do: "START DATE: 05/08/2026", "Monthly Rent: $1,700.00", "Name of Tenant: JOHN DOE"
- Examples of CORRECT search values: "05/08/2026", "$1,700.00", "JOHN DOE"
- Blank lines and underscores used as fill-in slots (e.g. "____________________", "___________") ARE valid search values — map them to the correct token based on the label before the blank
- Examples of blank-slot mappings (DATA):
    "Property: ____________________"  →  search="____________________", token={{property_name}}
    "Unit #: ____________________"    →  search="____________________", token={{unit_number}}
    "Tenant Name(s): ______________"  →  search="______________", token={{tenant_name}}
- If the same field appears in multiple formats (e.g. "05/08/2026" and "8TH day of MAY 2026"), create one pair per distinct format
- Do NOT duplicate an identical (search, token) combination — but you MAY emit the same search text with a different token when different role assignments are needed
- Each search string must appear verbatim somewhere in the document

WHAT TO PUT IN "token":
${TOKEN_LIST}

E-SIGNATURE ANCHOR TAG RULES (DocuSeal fields):
Use e-signature anchor tags — NOT data tokens — when the blank slot is a signature line, initials box, or date field that a signer must complete:
  - Blank adjacent to "1 Lessee", "Lessee", "Tenant", "Resident" + "Signature" label  →  {{Sign;type=signature;role=Tenant 1}}
  - Blank adjacent to "2 Lessee", "Co-Lessee", "Co-Tenant", or any SECOND lessee row  →  {{Sign;type=signature;role=Tenant 2}}
  - Blank adjacent to "Lessor", "Landlord", "Owner", "Agent", "Property Manager" + "Signature" →  {{Sign;type=signature;role=Manager}}
  - Initials box/blank adjacent to "1 Lessee", "Lessee", "Tenant", "Resident" label  →  {{Initial;type=initials;role=Tenant 1}}
  - Initials box/blank adjacent to "2 Lessee", "Co-Lessee", "Co-Tenant" label        →  {{Initial;type=initials;role=Tenant 2}}
  - Initials box/blank adjacent to "Lessor", "Landlord", "Agent" label               →  {{Initial;type=initials;role=Manager}}
  - Date blank adjacent to a "1 Lessee" / primary lessee signature line              →  {{Date;type=date;role=Tenant 1}}
  - Date blank adjacent to a "2 Lessee" / co-lessee signature line                  →  {{Date;type=date;role=Tenant 2}}
  - Date blank adjacent to a Lessor/Agent signature line                             →  {{Date;type=date;role=Manager}}
  - IMPORTANT: when you see numbered rows like "1 Lessee" and "2 Lessee", treat them as distinct roles — never assign the same role to both rows
- Addendum acknowledgment sections follow the same role mapping:
  • Blanks in "Lessee's Acknowledgment (initial)" (e.g. items (c), (d) in lead-based paint addenda) → {{Initial;type=initials;role=Tenant 1}}
  • Blanks in "Agent's Acknowledgment (initial)" (e.g. item (e)) → {{Initial;type=initials;role=Manager}}
  • Blanks in "Lessor's Acknowledgment (initial)" → {{Initial;type=initials;role=Manager}}
  • "Certification of Accuracy" / final signature table: Lessor and Agent signature lines → {{Sign;type=signature;role=Manager}}, Lessee lines → {{Sign;type=signature;role=Tenant 1}} (or Tenant 2 if a second Lessee row exists)
  • When the same blank (e.g. "________") appears in a lettered list under an acknowledgment heading, map all blanks in that heading's block to the same role — do NOT require a unique search string per item
  • Multi-column signature tables (e.g. Lessor/Date/Lessor/Date in two columns) — emit one pair per unique (search, token) combination; the engine will stamp both columns
- Initials slots like "( )", "()", "____", or small blanks beside "(Initials)" or "Initials:" labels should be mapped to the appropriate {{Initial;...}} tag
- CRITICAL — NEVER skip an "INITIALS:" / "Initials:" line. Any line containing the word "INITIALS" (in any casing) that is followed by parenthesis or underscore slots is a tenant-initials field and MUST be tagged. This includes ALL of these spacing variants — copy the slot EXACTLY as it appears (with or without the inner space) into "search":
    "INITIALS: ( )( )"  → two slots, search "( )" ×2
    "INITIALS:()()"     → two slots, search "()" ×2
    "INITIALS: ()"       → one slot, search "()"
    "INITIALS: ___ ___"  → two slots, search "___" ×2
  For TWO adjacent slots emit TWO pairs: the first slot → {{Initial;type=initials;role=Tenant 1}} and the second identical slot → {{Initial;type=initials;role=Tenant 2}}. Because both pairs share the same search string, you MUST emit both — the replacement engine processes them sequentially, replacing one occurrence per pass. For a SINGLE slot emit one pair → {{Initial;type=initials;role=Tenant 1}}. The "search" value is ONLY the parenthesis/underscore slot itself — never include the word "INITIALS" or the colon.
- When the same blank string appears in multiple acknowledgment blocks for different roles, emit one pair per (search, token) role combination
  Example: "___" appears under "Lessee's Initials:" and again under "Agent's Initials:"
    → { "search": "___", "token": "{{Initial;type=initials;role=Tenant 1}}" }
    → { "search": "___", "token": "{{Initial;type=initials;role=Manager}}" }

━━━ ADDITIONAL RULES ━━━

GENERAL
- Only map clear variable slots — skip fixed legal boilerplate
- NEVER map section headings or column labels (e.g. "LANDLORD", "LESSOR", "TENANT", "LESSEE", "OWNER" as titles/headers) — they are fixed text, not variable values
- NEVER reproduce an existing DocuSeal anchor already in the document (any token containing ";type=" — leave those untouched)
- Use the SAME token everywhere the same semantic value appears (e.g. if tenant name appears 4 times, emit 4 pairs all pointing to {{tenant_name}})
- Bilingual labels ("English • Español" format): treat the combined label as a single label and apply the same token rules as for the English-only version
- If a value cannot be confidently matched to any token, skip it rather than guessing

PROPERTY & PREMISES
- "Premises", "Premises being leased", "Property address being leased" → {{property_address_with_unit}} (full address + unit)
- "Property:", "Property Name:" in form headers → {{property_name}} (NOT {{organization_name}})
- "Property Address:" → {{property_address}} (no unit)
- "Office:", "Office Address:", or any full street address (city + state) in a manager/landlord contact or letterhead block → {{property_address}} (office addresses never include a unit number — do NOT use {{property_address_with_unit}})
- Street only (no city/state) → {{property_street}}

LANDLORD / LESSOR / ORGANIZATION
- "Name of Landlord" (or bilingual "Name of Landlord • Nombre del propietario") sections often contain TWO values in the right column:
    1. The landlord entity/company name (e.g. "AVON TOWERS LLC") → {{organization_name}}
    2. The individual who signs on behalf of the landlord (e.g. "AMIT LAKHOTIA") → {{landlord_signatory}}
  Emit a separate pair for each value. The description "Owner of the property being leased, and the individual signing the lease on behalf of the landlord" confirms this two-value pattern.
- A company, LLC, entity name appearing under a "Landlord", "Lessor", or "Owner" label → {{organization_name}}
- An individual person's name appearing under the SAME "Landlord"/"Name of Landlord" section (i.e. the signatory for the entity) → {{landlord_signatory}}
- "Lessor Print:" blank → {{organization_name}} (the entity name printed at signing)
- Do NOT confuse "Name of Landlord" with "Property:" — they are different fields
- "Property Manager", "Agent", or "Point of Contact" labels (including bilingual "Point of Contact • Persona de contacto") → {{property_manager_name}}. These are a DIFFERENT person from the landlord signatory — never map these to {{organization_name}} or {{landlord_signatory}}
- Email of landlord, property manager, or lessor → {{property_manager_email}} (not {{tenant_email}})
- "Voice or Text:", "Phone:", "Tel:", "Call:", or any phone number in a manager/landlord/office contact block → {{property_manager_phone}}

TENANTS — CRITICAL RULES
Numbered signature table (rows labeled "1 Lessee", "2 Lessee", "Lessor"):
  • "1 Lessee Print:" blank → {{tenant_name}}    ← primary tenant ONLY, NEVER {{all_tenant_names}}
  • "2 Lessee Print:" blank → {{co_tenant_names}} ← second tenant ONLY
  • "Lessor Print:" blank   → {{organization_name}}
  • NEVER assign {{all_tenant_names}} to any row in a numbered lessee table
Non-table contexts:
  • Label is plural / refers to all residents ("Name of Tenant(s)", "All individuals on lease", "Named persons allowed to reside") → {{all_tenant_names}}
  • First/primary lessee slot ("1 Lessee Print", "Lessee", "Primary Tenant", single "Tenant" line) → {{tenant_name}}
  • Second lessee slot ("2 Lessee Print", "Co-Lessee Print", "Co-Tenant") → {{co_tenant_names}}

FINANCIAL TERMS
- "Monthly Rent:", "Rent:", "Monthly Payment:" → dollar value → {{rent_amount}}
- Monthly rent written in words (e.g. "ONE THOUSAND SEVEN HUNDRED" before "dollars ({{rent_amount}}) per month") → {{rent_amount_words}}. Do NOT leave the written rent words as fixed text when they are just the word form of the monthly rent.
- "Security Deposit:", "Deposit:" → dollar value → {{security_deposit}}
- "TERM:", "Term:", "Lease Term:", "Initial Term:" → duration value (e.g. "12 months", "month-to-month") → {{lease_term}}
- Late fees / late charges — these labels are synonyms and ALL map to the late-fee tokens: "Late Fee", "Late Charge", "Late Payment Charge", "Late Payment Fee", "Late Penalty", "Delinquency Charge". Always tag the value:
    • flat dollar amount charged after the grace period → {{late_fee_amount}}
    • number of grace/grace-period days before the charge applies → {{late_fee_grace_days}}
    • a percentage-of-rent late charge (e.g. "5%") instead of a flat amount → {{late_fee_pct}}
  Do NOT leave a late charge dollar amount or percentage as fixed text — it is a per-property variable.
- Pet fee amount or monthly rate → {{pet_fee_amount}}

SPECIFIC CLAUSE VALUES (extract the variable values within these clauses, not the clause text itself)
- Early lease termination (ELT): dollar fee amount (e.g. "$3,200.00") → {{early_termination_fee}}; months-of-rent figure (e.g. "2 (two)") → {{early_termination_months}}
- Guest provision: maximum consecutive guest stay (e.g. "two (2) days", "two days") → {{guest_stay_limit}}
- Condemnation: landlord notice period (e.g. "fifteen (15) days", "15 days") → {{condemnation_notice_days}}
- Appliances: list of appliances included in the unit (e.g. "Stove and Refrigerator") → {{included_appliances}}
- Utilities: comma-separated list of utilities the tenant is responsible for (e.g. "Electric, Gas" — identify from checked boxes ☒ or explicit "paid by tenant" text) → {{tenant_paid_utilities}}

OTHER CHARGES / ADDITIONAL FEES SECTION
When the lease has an "Other Charges", "Additional Charges", or "Monthly Charges" table with rows for services like Laundry, Parking, Internet, Cable, Pet Fee, HOA, Snow Removal, Lawn Care:
- SKIP the service label rows entirely (e.g. "Laundry", "Parking", "Internet" as row headers are NOT variable values — do not map them to any token)
- Map the dollar amount blank in a "Pet Fee" / "Pet Rent" row → {{pet_fee_amount}}
- Map ALL other service charge amount blanks (Laundry, Parking, Internet, Cable, etc.) using the baked-in value from the template — if the amount blank is N/A, $0, or empty/unknown, SKIP it entirely
- Do NOT emit separate tokens for Laundry, Parking, Internet, or Cable amounts — these are baked in at template generation time
- The only per-tenant dynamic charge in this section is {{pet_fee_amount}}; all others are fixed for the property

- Return ONLY a valid JSON array, no markdown, no explanation`;

// ─── Utilities ────────────────────────────────────────────────────────────────

async function fetchBuffer(blobUrl: string): Promise<Buffer> {
  const blob = await get(blobUrl, { access: "private", token: getBlobToken(), useCache: false });
  if (!blob?.stream) throw new Error("Lease template file is unavailable.");
  return Buffer.from(await new Response(blob.stream).arrayBuffer());
}

function detectFormat(buffer: Buffer): "pdf" | "docx" | "ole-doc" | "unknown" {
  const m = buffer.subarray(0, 4);
  if (m.toString("ascii") === "%PDF") return "pdf";
  if (m[0] === 0x50 && m[1] === 0x4b) return "docx";
  if (m[0] === 0xd0 && m[1] === 0xcf) return "ole-doc";
  return "unknown";
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function intToWords(n: number): string {
  if (n === 0) return "ZERO";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1_000) return ONES[Math.floor(n / 100)] + " HUNDRED" + (n % 100 ? " " + intToWords(n % 100) : "");
  if (n < 1_000_000) return intToWords(Math.floor(n / 1_000)) + " THOUSAND" + (n % 1_000 ? " " + intToWords(n % 1_000) : "");
  return intToWords(Math.floor(n / 1_000_000)) + " MILLION" + (n % 1_000_000 ? " " + intToWords(n % 1_000_000) : "");
}

function dollarsToWords(amount: number): string {
  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);
  const words = intToWords(dollars) + " DOLLARS";
  const centsPart = cents > 0 ? ` AND ${cents}/100` : "";
  const figures = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${words}${centsPart} ($${figures})`;
}

function leaseMonths(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr + "T12:00:00");
  const end = new Date(endStr + "T12:00:00");
  return Math.round((end.getTime() - start.getTime()) / (30.4375 * 24 * 60 * 60 * 1000));
}

// Uppercase the city and state portions of "123 Main St, Springfield, IL 62701"
function uppercaseCityState(address: string): string {
  // Match: street, city, state zip  OR  street, city, state
  const m = address.match(/^(.*?),\s*([^,]+),\s*([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?\s*$/);
  if (!m) return address;
  const [, street, city, state, zip] = m;
  return [street.trim(), city.trim().toUpperCase(), `${state.toUpperCase()}${zip ? ` ${zip}` : ""}`].join(", ");
}

function buildReplacementMap(data: LeaseData): Record<string, string> {
  const fmtDate = (d: string) => {
    if (!d) return "—";
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  };
  const fmt$ = (n: string) => `$${Number(n).toLocaleString()}`;
  const fmtWords = (n: string) => Number.isFinite(Number(n)) ? intToWords(Math.round(Number(n))) : "—";
  const primaryName = `${data.primaryTenant.firstName} ${data.primaryTenant.lastName}`.trim();
  const coNames = data.additionalTenants.map((t) => `${t.firstName} ${t.lastName}`.trim()).join(", ");
  const allNames = [primaryName, ...data.additionalTenants.map((t) => `${t.firstName} ${t.lastName}`.trim())].join(", ");

  return {
    tenant_name: primaryName,
    tenant_email: data.primaryTenant.email,
    all_tenant_names: allNames,
    co_tenant_names: coNames || "N/A",
    property_name: data.propertyName,
    property_address: uppercaseCityState(data.propertyAddress),
    property_address_with_unit: (() => {
      const full = uppercaseCityState(data.propertyAddress);
      if (!data.unitNumber) return full;
      const comma = full.indexOf(",");
      return comma === -1
        ? `${full} UNIT ${data.unitNumber}`
        : `${full.slice(0, comma)} UNIT ${data.unitNumber}${full.slice(comma)}`;
    })(),
    property_street: data.propertyAddress.split(",")[0]?.trim().toUpperCase() ?? data.propertyAddress.toUpperCase(),
    organization_name: data.organizationName ?? "",
    landlord_signatory: data.landlordSignatory ?? "",
    property_manager_name: data.propertyManagerName ?? "",
    property_manager_email: data.propertyManagerEmail ?? "",
    property_manager_phone: data.propertyManagerPhone ?? "",
    lease_term: (() => {
      const months = leaseMonths(data.startDate, data.endDate);
      return months > 0 ? `${months} months` : "month-to-month";
    })(),
    early_termination_fee: data.earlyTerminationFee ?? "",
    early_termination_months: data.earlyTerminationMonths ?? "",
    guest_stay_limit: data.guestStayLimit ?? "",
    condemnation_notice_days: data.condemnationNoticeDays ?? "",
    included_appliances: data.includedAppliances ?? "",
    late_fee_amount: data.lateFeeAmount ?? "",
    late_fee_grace_days: data.lateFeeGraceDays ?? "",
    late_fee_pct: data.lateFeePct ?? "",
    pet_fee_amount: data.petFeeAmount ?? "",
    tenant_paid_utilities: data.tenantPaidUtilities ?? "",
    unit_number: data.unitNumber,
    lease_start: fmtDate(data.startDate),
    lease_end: fmtDate(data.endDate),
    rent_amount: data.rentAmount ? fmt$(data.rentAmount) : "—",
    rent_amount_words: data.rentAmount ? fmtWords(data.rentAmount) : "—",
    security_deposit: data.securityDeposit ? fmt$(data.securityDeposit) : "N/A",
    total_rent: (() => {
      const months = leaseMonths(data.startDate, data.endDate);
      const total = months > 0 && data.rentAmount ? Number(data.rentAmount) * months : 0;
      return total > 0 ? dollarsToWords(total) : "—";
    })(),
  };
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

// The model sometimes emits raw control characters (most often literal line
// breaks in multi-line address/landlord values) inside JSON string literals,
// which is invalid JSON and makes JSON.parse throw "Bad control character in
// string literal". Walk the text and escape any control char that occurs while
// inside a string, leaving structural whitespace untouched.
function escapeControlCharsInStrings(s: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else if (ch === "\t") out += "\\t";
        else out += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function parseSubstitutionPairs(raw: string): Array<{ search: string; token: string }> {
  let parsed: unknown;
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("no JSON array found");
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      // Retry after escaping raw control characters the model left unescaped.
      parsed = JSON.parse(escapeControlCharsInStrings(match[0]));
    }
  } catch (e) {
    console.error("[fill-lease] raw AI response:", raw.slice(0, 500));
    throw new Error(`Could not parse substitution pairs from AI response: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of substitution pairs.");
  const seenSearch = new Set<string>();
  const seenPair = new Set<string>();
  return (parsed as unknown[]).flatMap((item) => {
    const p = item as Record<string, unknown>;
    if (typeof p.search === "string" && typeof p.token === "string" && p.search && p.token) {
      const isDocuSeal = (p.token as string).includes(";type=");
      if (isDocuSeal) {
        // DocuSeal anchor tags: same blank can map to different roles (Tenant 1, Manager, etc.)
        // Sequential XML replacement handles each occurrence within a paragraph correctly.
        const pairKey = `${p.search}:::${p.token}`;
        if (seenPair.has(pairKey)) return [];
        seenPair.add(pairKey);
      } else {
        // Data tokens: same blank → same replacement everywhere; duplicates cause collisions.
        if (seenSearch.has(p.search)) return [];
        seenSearch.add(p.search);
      }
      return [{ search: p.search, token: p.token }];
    }
    return [];
  });
}

const HEADING_RE = /^\s*(?:\d+[\.\)]\s+)?([A-Z][A-Z0-9 ,\/&'\-]{3,}[A-Z0-9])\s*\.?\s*$/;

function splitTextIntoClauses(text: string): ExtractedLeaseClause[] {
  const lines = text.split("\n");
  const sections: { title: string; order: number; body: string[] }[] = [];
  let current: { title: string; order: number; body: string[] } | null = null;

  for (const raw of lines) {
    const m = HEADING_RE.exec(raw);
    if (m) {
      if (current && current.body.join("").trim()) sections.push(current);
      current = { title: m[1].trim(), order: sections.length + 1, body: [] };
    } else if (current) {
      current.body.push(raw);
    }
  }
  if (current && current.body.join("").trim()) sections.push(current);

  return sections.map((s) => ({
    title: s.title,
    body: s.body.join("\n").trim(),
    order: s.order,
  }));
}

function detectLandlordName(text: string): string | undefined {
  const m =
    text.match(/Landlord[:\s]+([A-Z][A-Za-z0-9 .,&']+?)(?:\s*[,\n(]|$)/m) ??
    text.match(/between\s+([A-Z][A-Za-z0-9 .,&']+?)\s*\("Landlord"\)/);
  return m?.[1]?.trim() || undefined;
}

function detectJurisdiction(text: string): string | undefined {
  const m =
    text.match(/(?:State of|laws of the State of|governed by.*law of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i) ??
    text.match(/([A-Z][a-z]+)\s+Residential\s+Lease/);
  return m?.[1]?.trim() || undefined;
}

// ─── DOCX paragraph-level XML replacement (format-preserving) ─────────────────

interface RunInfo {
  fullMatch: string;
  text: string;
  start: number;
}

function collectRuns(body: string): RunInfo[] {
  const runs: RunInfo[] = [];
  const pat = /<w:r\b[\s\S]*?<\/w:r>/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(body)) !== null) {
    const text = [...(m[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))].map((t) => t[1]).join("");
    runs.push({ fullMatch: m[0], text, start: m.index });
  }
  return runs;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractRpr(runXml: string): string {
  const m = runXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  return m ? m[0] : "";
}

function withNewText(runXml: string, newText: string): string {
  return runXml.replace(
    /<w:t[^>]*>[\s\S]*?<\/w:t>/,
    `<w:t xml:space="preserve">${xmlEscape(newText)}</w:t>`,
  );
}

function replaceParagraphBody(body: string, search: string, value: string): string {
  const runs = collectRuns(body);
  const combined = runs.map((r) => r.text).join("");
  const pos = combined.indexOf(search);
  if (pos === -1) return body;

  const endPos = pos + search.length;
  let charCount = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < runs.length; i++) {
    const rStart = charCount;
    const rEnd = charCount + runs[i].text.length;
    if (firstIdx === -1 && rEnd > pos) firstIdx = i;
    if (rStart < endPos) lastIdx = i;
    charCount += runs[i].text.length;
  }
  if (firstIdx === -1) return body;

  let charBeforeFirst = 0;
  for (let i = 0; i < firstIdx; i++) charBeforeFirst += runs[i].text.length;
  const keepBefore = runs[firstIdx].text.slice(0, pos - charBeforeFirst);

  let charThroughLast = 0;
  for (let i = 0; i <= lastIdx; i++) charThroughLast += runs[i].text.length;
  const keepAfter = runs[lastIdx].text.slice(endPos - (charThroughLast - runs[lastIdx].text.length));

  const rPr = extractRpr(runs[firstIdx].fullMatch);
  const parts: string[] = [];
  if (keepBefore) parts.push(withNewText(runs[firstIdx].fullMatch, keepBefore));
  parts.push(`<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`);
  if (keepAfter) parts.push(withNewText(runs[lastIdx].fullMatch, keepAfter));

  const firstStart = runs[firstIdx].start;
  const lastEnd = runs[lastIdx].start + runs[lastIdx].fullMatch.length;
  return body.slice(0, firstStart) + parts.join("") + body.slice(lastEnd);
}

function applyReplacementsToXml(xml: string, replacements: Array<{ search: string; value: string }>): string {
  return xml.replace(/(<w:p\b(?:[^>]*)>)([\s\S]*?)(<\/w:p>)/g, (_, open, body: string, close) => {
    let newBody = body;
    for (const { search, value } of replacements) {
      if (!search) continue;
      newBody = replaceParagraphBody(newBody, search, value);
      const xmlSearch = search.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (xmlSearch !== search) newBody = replaceParagraphBody(newBody, xmlSearch, value);
    }
    return open + newBody + close;
  });
}

async function fillDocxDirect(
  originalBuffer: Buffer,
  replacements: Array<{ search: string; value: string }>,
): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(originalBuffer);

  const files = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
  ];

  for (const filePath of files) {
    const file = zip.file(filePath);
    if (!file) continue;
    const xml = applyReplacementsToXml(file.asText(), replacements);
    zip.file(filePath, xml);
  }

  return Buffer.from(zip.generate({ type: "nodebuffer" }));
}

// ─── Scratch DOCX builder (PDF fallback) ─────────────────────────────────────

interface Para {
  text: string;
  bold?: boolean;
  center?: boolean;
  sizePt?: number;
  spacePt?: number;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

function buildDocumentXml(paragraphs: Para[]): string {
  const paraXmls = paragraphs.map((p) => {
    const sz = Math.round((p.sizePt ?? 10) * 2);
    const spaceAfter = Math.round((p.spacePt ?? 6) * 20);
    const pPrParts = [
      p.center ? `<w:jc w:val="center"/>` : "",
      `<w:spacing w:after="${spaceAfter}"/>`,
    ].filter(Boolean).join("");
    const rPrParts = [
      p.bold ? `<w:b/>` : "",
      `<w:sz w:val="${sz}"/>`,
      `<w:szCs w:val="${sz}"/>`,
    ].filter(Boolean).join("");

    if (!p.text) return `<w:p><w:pPr>${pPrParts}</w:pPr></w:p>`;
    return `<w:p>
      <w:pPr>${pPrParts}</w:pPr>
      <w:r><w:rPr>${rPrParts}</w:rPr><w:t xml:space="preserve">${xmlEscape(p.text)}</w:t></w:r>
    </w:p>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paraXmls.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1296" w:bottom="1440" w:left="1296"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function buildDocxFromClauses(schema: ExtractedLeaseSchema, data: LeaseData): Promise<Buffer> {
  const map = buildReplacementMap(data);
  const sub = (text: string) => Object.entries(map).reduce((t, [k, v]) => t.replaceAll(`{{${k}}}`, v), text);

  const primaryName = `${data.primaryTenant.firstName} ${data.primaryTenant.lastName}`.trim();
  const coNames = data.additionalTenants.map((t) => `${t.firstName} ${t.lastName}`.trim()).join(", ");
  const paras: Para[] = [];

  paras.push({ text: "RESIDENTIAL LEASE AGREEMENT", bold: true, center: true, sizePt: 16, spacePt: 14 });
  paras.push({ text: "", spacePt: 4 });
  paras.push({ text: "KEY TERMS", bold: true, sizePt: 11, spacePt: 6 });

  const terms: [string, string][] = [
    ...(schema.landlordName ? [["Landlord", schema.landlordName] as [string, string]] : []),
    ["Tenant(s)", coNames ? `${primaryName}, ${coNames}` : primaryName],
    ["Property", `${data.propertyName} — ${data.propertyAddress}${data.unitNumber ? `, Unit ${data.unitNumber}` : ""}`],
    ["Lease Term", `${map.lease_start} to ${map.lease_end}`],
    ["Monthly Rent", map.rent_amount],
    ["Security Deposit", map.security_deposit],
  ];
  for (const [label, value] of terms) paras.push({ text: `${label}: ${value}`, spacePt: 4 });
  paras.push({ text: "", spacePt: 10 });

  const sorted = [...schema.clauses].sort((a, b) => a.order - b.order);
  for (let i = 0; i < sorted.length; i++) {
    const clause = sorted[i];
    paras.push({ text: `${i + 1}. ${clause.title.toUpperCase()}`, bold: true, sizePt: 10, spacePt: 4 });
    for (const line of sub(clause.body).split("\n")) paras.push({ text: line, spacePt: 3 });
    paras.push({ text: "", spacePt: 8 });
  }

  paras.push({ text: "SIGNATURES", bold: true, sizePt: 11, spacePt: 6 });
  paras.push({ text: "By signing below, the parties agree to the terms of this Lease Agreement.", spacePt: 14 });

  for (const tenant of [data.primaryTenant, ...data.additionalTenants]) {
    paras.push({ text: "TENANT", bold: true, spacePt: 4 });
    paras.push({ text: `Printed Name: ${tenant.firstName} ${tenant.lastName}`.trim(), spacePt: 18 });
    paras.push({ text: "Signature: ___________________________________   Date: ____________", spacePt: 24 });
  }

  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", ROOT_RELS_XML);
  zip.file("word/document.xml", buildDocumentXml(paras));
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS_XML);
  return Buffer.from(zip.generate({ type: "nodebuffer" }));
}

async function buildTemplateDocxFromClauses(schema: ExtractedLeaseSchema): Promise<Buffer> {
  const paras: Para[] = [];
  paras.push({ text: "RESIDENTIAL LEASE AGREEMENT", bold: true, center: true, sizePt: 16, spacePt: 14 });
  paras.push({ text: "", spacePt: 4 });

  const sorted = [...schema.clauses].sort((a, b) => a.order - b.order);
  for (let i = 0; i < sorted.length; i++) {
    const clause = sorted[i];
    paras.push({ text: `${i + 1}. ${clause.title.toUpperCase()}`, bold: true, sizePt: 10, spacePt: 4 });
    for (const line of clause.body.split("\n")) paras.push({ text: line, spacePt: 3 });
    paras.push({ text: "", spacePt: 8 });
  }

  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", ROOT_RELS_XML);
  zip.file("word/document.xml", buildDocumentXml(paras));
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS_XML);
  return Buffer.from(zip.generate({ type: "nodebuffer" }));
}

// ─── Error helper ─────────────────────────────────────────────────────────────

export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (e.properties && typeof e.properties === "object") {
      const props = e.properties as Record<string, unknown>;
      if (Array.isArray(props.errors) && props.errors.length > 0) {
        const sub = props.errors[0] as Record<string, unknown>;
        if (sub.properties && typeof sub.properties === "object") {
          const sp = sub.properties as Record<string, unknown>;
          if (typeof sp.explanation === "string" && sp.explanation) return sp.explanation;
        }
      }
      if (typeof props.explanation === "string" && props.explanation) return props.explanation;
    }
    if (typeof (e as { message?: unknown }).message === "string" && (e as { message: string }).message) {
      return (e as { message: string }).message;
    }
  }
  return String(err);
}

// ─── Public: extract schema on upload ────────────────────────────────────────

export async function extractLeaseSchema(blobUrl: string): Promise<ExtractedLeaseSchema> {
  const buffer = await fetchBuffer(blobUrl);
  const format = detectFormat(buffer);

  if (format === "ole-doc") {
    throw new Error("Old .doc format is not supported. Save as .docx or PDF and re-upload.");
  }
  if (format === "unknown") {
    throw new Error("Unsupported template format. Upload a PDF or Word (.docx) document.");
  }

  const anthropicFetch = async (body: object): Promise<string> => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }
    const json = await res.json() as { content: Array<{ type: string; text: string }>; stop_reason: string };
    if (json.stop_reason === "max_tokens") {
      console.warn("[fill-lease] Claude hit max_tokens limit — output may be truncated");
    }
    return json.content.find((b) => b.type === "text")?.text ?? "";
  };

  // Phase 1: get raw text
  let fullText: string;
  if (format === "docx") {
    // Primary: mammoth extracts text runs from XML content.
    const mammothText = await extractDocxText(buffer);
    // Supplemental: extract embedded images from the DOCX zip (scanned addenda, image-only pages)
    // and run each through Claude vision so their text is also captured.
    const imageTexts: string[] = [];
    try {
      const PizZip = (await import("pizzip")).default;
      const zip = new PizZip(buffer);
      const IMAGE_EXTS = /\.(jpe?g|png|gif|webp)$/i;
      const IMAGE_TYPES: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp",
      };
      const mediaFiles = Object.keys(zip.files).filter(
        (name) => name.startsWith("word/media/") && IMAGE_EXTS.test(name),
      );
      for (const mediaFile of mediaFiles) {
        const imgBuffer = Buffer.from(zip.files[mediaFile].asArrayBuffer());
        const ext = (mediaFile.split(".").pop() ?? "jpeg").toLowerCase();
        const mediaType = IMAGE_TYPES[ext] ?? "image/jpeg";
        const imgText = await anthropicFetch({
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imgBuffer.toString("base64") } },
              { type: "text", text: "Extract all visible text from this image (it may be a scanned lease page or addendum). Return only the plain text, preserving paragraph structure with blank lines between sections. Include blanks/underscores as-is. No commentary." },
            ],
          }],
        }).catch(() => "");
        if (imgText.trim()) imageTexts.push(imgText.trim());
      }
    } catch {
      // Non-fatal: if image extraction fails, mammoth text alone is used
    }
    fullText = imageTexts.length > 0
      ? mammothText + "\n\n" + imageTexts.join("\n\n")
      : mammothText;
  } else {
    fullText = await anthropicFetch({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
            { type: "text", text: "Extract all text from this lease document including any image-based pages (use vision to read scanned addenda). Return only the plain text, preserving paragraph breaks with blank lines. No commentary." },
          ],
        },
      ],
    });
  }

  // Phase 2: Claude finds substitution pairs only (compact output, no verbatim reproduction)
  const pairsRaw = await anthropicFetch({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SUBSTITUTION_SYSTEM,
    messages: [{ role: "user", content: `Find all blanks and placeholders in this lease template:\n\n${fullText}` }],
  });
  console.log("[fill-lease] raw pairs response:", pairsRaw.slice(0, 300));
  const pairs = parseSubstitutionPairs(pairsRaw);

  // Phase 3: apply pairs to full text, then split into clauses for the fallback generator
  let tokenizedText = fullText;
  for (const { search, token } of pairs) {
    if (search) tokenizedText = tokenizedText.replaceAll(search, token);
  }
  const clauses = splitTextIntoClauses(tokenizedText);

  // Lift clause-specific default values directly from the extracted pairs
  const pairValue = (token: string) => pairs.find((p) => p.token === `{{${token}}}`)?.search;

  return {
    schemaVersion: 1,
    originalFormat: format,
    jurisdiction: detectJurisdiction(fullText),
    landlordName: detectLandlordName(fullText),
    landlordSignatory: pairValue("landlord_signatory"),
    earlyTerminationFee: pairValue("early_termination_fee"),
    earlyTerminationMonths: pairValue("early_termination_months"),
    guestStayLimit: pairValue("guest_stay_limit"),
    condemnationNoticeDays: pairValue("condemnation_notice_days"),
    includedAppliances: pairValue("included_appliances"),
    lateFeeAmount: pairValue("late_fee_amount"),
    lateFeeGraceDays: pairValue("late_fee_grace_days"),
    lateFeePct: pairValue("late_fee_pct"),
    petFeeAmount: pairValue("pet_fee_amount"),
    tenantPaidUtilities: pairValue("tenant_paid_utilities"),
    pairs,
    clauses,
  };
}

// ─── Plain-text PDF builder ───────────────────────────────────────────────────

async function buildPlainTextPdf(rawText: string): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const text = rawText.replace(/\t/g, "    ").replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, "");
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageW = 612, pageH = 792, mx = 72, mt = 72, mb = 72;
  const cw = pageW - 2 * mx, fs = 10, lh = 15;

  const lines: string[] = [];
  for (const src of text.split("\n")) {
    if (!src.trim()) { lines.push(""); continue; }
    let cur = "";
    for (const word of src.split(" ")) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fs) > cw && cur) { lines.push(cur); cur = word; }
      else cur = candidate;
    }
    if (cur) lines.push(cur);
  }

  let page = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - mt;
  for (const line of lines) {
    if (y < mb + lh) { page = pdfDoc.addPage([pageW, pageH]); y = pageH - mt; }
    if (line) {
      const isBold = /^[A-Z][A-Z\s]{4,}$/.test(line.trim());
      page.drawText(line, { x: mx, y, size: fs, font: isBold ? boldFont : font, color: rgb(0, 0, 0) });
    }
    y -= lh;
  }
  return Buffer.from(await pdfDoc.save());
}

// ─── Public: generate filled lease (returns DOCX buffer) ─────────────────────

export async function generateLease(
  schema: ExtractedLeaseSchema,
  data: LeaseData,
  blobUrl: string,
): Promise<Buffer> {
  if (schema.originalFormat === "docx") {
    const buffer = await fetchBuffer(blobUrl);
    // Guard: verify magic bytes are DOCX/ZIP (PK header)
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      const map = buildReplacementMap(data);
      const replacements = schema.pairs
        .filter((p) => p.search && p.token)
        .map((p) => {
          // DocuSeal anchor tags (contain ";type=") are used verbatim — not looked up in the data map
          if (p.token.includes(";type=")) {
            return { search: p.search, value: p.token };
          }
          const key = p.token.replace(/^\{\{|\}\}$/g, "");
          return { search: p.search, value: map[key] ?? "" };
        });
      return fillDocxDirect(buffer, replacements);
    }
  }
  // PDF templates or stale schema: rebuild from clauses
  return buildDocxFromClauses(schema, data);
}

// Tokens that are fixed for a given property and should be baked in at template
// generation time rather than left as dynamic placeholders.
function buildBakedTokenMap(schema: ExtractedLeaseSchema): Record<string, string> {
  const street = schema.propertyStreet ?? "";
  const city = schema.propertyCity ?? "";
  const state = schema.propertyState ?? "";
  const zip = schema.propertyZip ?? "";
  const fullAddress = [street, city ? `${city}${state ? `, ${state}` : ""}${zip ? ` ${zip}` : ""}` : ""].filter(Boolean).join(", ");

  return {
    "{{property_name}}": schema.propertyName ?? "",
    "{{property_address}}": fullAddress || (schema.propertyAddress ?? ""),
    "{{property_street}}": street || ((schema.propertyAddress ?? "").split(",")[0]?.trim() ?? ""),
    "{{organization_name}}": schema.landlordName ?? "",
    "{{landlord_signatory}}": schema.landlordSignatory ?? "",
    "{{property_manager_name}}": schema.propertyManagerName ?? "",
    "{{property_manager_email}}": schema.propertyManagerEmail ?? "",
    "{{property_manager_phone}}": schema.propertyManagerPhone ?? "",
    "{{late_fee_amount}}": schema.lateFeeAmount ?? "",
    "{{late_fee_grace_days}}": schema.lateFeeGraceDays ?? "",
    "{{late_fee_pct}}": schema.lateFeePct ?? "",
    "{{early_termination_fee}}": schema.earlyTerminationFee ?? "",
    "{{early_termination_months}}": schema.earlyTerminationMonths ?? "",
    "{{tenant_paid_utilities}}": schema.tenantPaidUtilities ?? "",
    "{{pet_fee_amount}}": schema.petFeeAmount ?? "",
    "{{included_appliances}}": schema.includedAppliances ?? "",
    "{{guest_stay_limit}}": schema.guestStayLimit ?? "",
    "{{condemnation_notice_days}}": schema.condemnationNoticeDays ?? "",
  };
}

async function applyBakedTokens(docxBuffer: Buffer, schema: ExtractedLeaseSchema): Promise<Buffer> {
  const map = buildBakedTokenMap(schema);
  const replacements = Object.entries(map)
    .filter(([, value]) => value !== "")
    .map(([token, value]) => ({ search: token, value }));
  if (replacements.length === 0) return docxBuffer;
  return fillDocxDirect(docxBuffer, replacements);
}

export async function generateTokenizedTemplate(schema: ExtractedLeaseSchema, blobUrl: string): Promise<Buffer> {
  if (schema.originalFormat === "docx") {
    const buffer = await fetchBuffer(blobUrl);
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
      const replacements = schema.pairs
        .filter((p) => p.search && p.token)
        .map((p) => ({ search: p.search, value: p.token }));
      const tokenized = await fillDocxDirect(buffer, replacements);
      return applyBakedTokens(tokenized, schema);
    }
  }
  const fromClauses = await buildTemplateDocxFromClauses(schema);
  return applyBakedTokens(fromClauses, schema);
}
