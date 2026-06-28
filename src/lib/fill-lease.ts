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
  const fmt$ = (n: string) =>
    `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtWords = (n: string) => Number.isFinite(Number(n)) ? intToWords(Math.round(Number(n))) : "—";
  const primaryName = `${data.primaryTenant.firstName} ${data.primaryTenant.lastName}`.trim();
  // Stack multiple tenant names on separate lines (the "\n" is rendered as a <w:br/>
  // by replaceParagraphBody) rather than comma-joined on one line.
  const coNames = data.additionalTenants.map((t) => `${t.firstName} ${t.lastName}`.trim()).join("\n");
  const allNames = [primaryName, ...data.additionalTenants.map((t) => `${t.firstName} ${t.lastName}`.trim())].join("\n");

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
    // NOTE the \b: without it, "<w:t[^>]*>" also matches "<w:tab/>" ("<w:t" + "ab/" +
    // ">"), so a run with a leading <w:tab/> (e.g. "<w:tab/><w:t>$1,700.00</w:t>") would
    // capture the literal "<w:t ...>" opener as text and corrupt the combined run text.
    const text = [...(m[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g))].map((t) => t[1]).join("");
    runs.push({ fullMatch: m[0], text, start: m.index });
  }
  return runs;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Replaces the first occurrence of `search` (matched against the paragraph's combined
// visible text) with `value`, editing ONLY the contents of the <w:t> text nodes the
// match spans. Run structure, run properties, and inline elements like <w:tab/> are
// left untouched — so a run that packs a label, a tab, and the matched text into a
// single <w:r> (e.g. "Monthly Rent:\t$1,700.00") is rewritten cleanly instead of being
// mangled into leftover/escaped fragments. Multi-line values ("\n") render as <w:br/>.
function replaceParagraphBody(body: string, search: string, value: string): string {
  const nodes: Array<{ start: number; end: number; open: string; text: string }> = [];
  const re = /(<w:t\b[^>]*>)([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    nodes.push({ start: m.index, end: m.index + m[0].length, open: m[1], text: m[2] });
  }
  if (nodes.length === 0) return body;

  const combined = nodes.map((n) => n.text).join("");
  const pos = combined.indexOf(search);
  if (pos === -1) return body;
  const endPos = pos + search.length;

  // Map the match span onto the text nodes.
  let acc = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  let firstOffset = 0;
  let lastOffset = 0;
  for (let i = 0; i < nodes.length; i++) {
    const nStart = acc;
    const nEnd = acc + nodes[i].text.length;
    if (firstIdx === -1 && nEnd > pos) {
      firstIdx = i;
      firstOffset = pos - nStart;
    }
    if (nStart < endPos) {
      lastIdx = i;
      lastOffset = endPos - nStart;
    }
    acc = nEnd;
  }
  if (firstIdx === -1) return body;

  // The value goes into the first matched node; if it spans lines, the continuation
  // lines become <w:br/>-separated text nodes within the same run.
  const valueXml = value
    .split("\n")
    .map(xmlEscape)
    .join(`</w:t><w:br/><w:t xml:space="preserve">`);

  // Rewrite affected nodes back-to-front so earlier node offsets stay valid.
  let out = body;
  for (let i = lastIdx; i >= firstIdx; i--) {
    let inner: string;
    if (firstIdx === lastIdx) {
      inner = xmlEscape(nodes[i].text.slice(0, firstOffset)) + valueXml + xmlEscape(nodes[i].text.slice(lastOffset));
    } else if (i === firstIdx) {
      inner = xmlEscape(nodes[i].text.slice(0, firstOffset)) + valueXml;
    } else if (i === lastIdx) {
      inner = xmlEscape(nodes[i].text.slice(lastOffset));
    } else {
      inner = "";
    }
    out = out.slice(0, nodes[i].start) + nodes[i].open + inner + "</w:t>" + out.slice(nodes[i].end);
  }
  return out;
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

// ─── Literal {{token}} replacement (text-node level, format-safe) ─────────────
// Replaces "{{key}}" placeholders embedded directly in a tokenized template by
// rewriting ONLY the characters inside <w:t> nodes. Unlike the run-splicing
// replaceParagraphBody path, this never inserts run/text tags between elements, so it
// cannot corrupt runs where a label, a <w:tab/>, and a token share one <w:r>
// (e.g. "Monthly Rent:\t{{rent_amount}}"). Multi-line values (containing "\n") are
// emitted as proper <w:br/> breaks within the same run.
function replaceTokensInTextNodes(xml: string, map: Record<string, string>): string {
  const entries = Object.entries(map);
  if (entries.length === 0) return xml;
  return xml.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (full, open: string, text: string, close: string) => {
    let next = text;
    for (const [key, value] of entries) {
      const token = `{{${key}}}`;
      if (next.includes(token)) {
        const rep = value.split("\n").map(xmlEscape).join(`</w:t><w:br/><w:t xml:space="preserve">`);
        next = next.split(token).join(rep);
      }
    }
    return next === text ? full : open + next + close;
  });
}

async function applyDataTokens(docxBuffer: Buffer, map: Record<string, string>): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(docxBuffer);

  const files = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
  ];

  let changed = false;
  for (const filePath of files) {
    const file = zip.file(filePath);
    if (!file) continue;
    const xml = file.asText();
    const out = replaceTokensInTextNodes(xml, map);
    if (out !== xml) {
      zip.file(filePath, out);
      changed = true;
    }
  }

  return changed ? Buffer.from(zip.generate({ type: "nodebuffer" })) : docxBuffer;
}

// ─── Deterministic "Monthly Rent:" / "Security Deposit:" value ownership ──────
// The AI extraction keys substitutions off the sample VALUE ("$1,700.00"), so when a
// lease lists the same amount for rent and deposit it cannot tell the two apart — the
// seenSearch dedup in parseSubstitutionPairs drops one pair and BOTH lines collapse to
// a single token (typically {{rent_amount}}). This pass owns those two labeled fields
// by LABEL instead of value — exactly mirroring applyLesseePrintNames / applyInitials-
// SignTags — so each line always carries the right output: the {{…}} token at tokenize
// time, or the formatted amount at fill time.
const RENT_LABEL_RE = /Monthly\s+(?:Rent|Payment)\s*:/i;
const DEPOSIT_LABEL_RE = /Security\s+Deposit\s*:/i;
// The value slot that follows the label: a {{token}}, a "$1,700.00" amount, or a
// "$____" / "____" fill-in blank. A clause heading like "SECURITY DEPOSIT: YOU AGREE…"
// has none of these right after the label, so it is left untouched.
const MONEY_SLOT_RE = /\{\{[A-Za-z_]+\}\}|\$\s*[\d,]+(?:\.\d{1,2})?|\$?\s*_{2,}/;

function replaceMoneyFieldSlots(xml: string, rent: string, deposit: string): { xml: string; count: number } {
  // Collect paragraphs with their positions + combined visible text. Working at the
  // document level (not a single <w:p> at a time) lets us bridge the common aligned
  // layout where the label and its value sit in SEPARATE table cells / paragraphs.
  const paras: Array<{ start: number; end: number; body: string; text: string }> = [];
  const pre = /<w:p\b(?:[^>]*)>[\s\S]*?<\/w:p>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pre.exec(xml)) !== null) {
    paras.push({ start: pm.index, end: pm.index + pm[0].length, body: pm[0], text: collectRuns(pm[0]).map((r) => r.text).join("") });
  }

  const hasLabel = (t: string) => RENT_LABEL_RE.test(t) || DEPOSIT_LABEL_RE.test(t);
  let count = 0;
  for (const [labelRe, outValue] of [[RENT_LABEL_RE, rent], [DEPOSIT_LABEL_RE, deposit]] as const) {
    if (!outValue) continue;
    for (let i = 0; i < paras.length; i++) {
      const lm = labelRe.exec(paras[i].text);
      if (!lm) continue;
      // (a) Value slot in the SAME paragraph, right after the label (tab-aligned line).
      const after = paras[i].text.slice(lm.index + lm[0].length);
      const sm = MONEY_SLOT_RE.exec(after);
      if (sm && sm.index <= 25) {
        paras[i].body = replaceParagraphBody(paras[i].body, sm[0], outValue);
        count++;
        break;
      }
      // (b) Otherwise the value lives in a following cell/paragraph (table layout).
      // Scan the next few paragraphs for a money slot, stopping at the next labeled
      // field or any non-empty prose so we never wander into an unrelated clause.
      let done = false;
      for (let j = i + 1; j < paras.length && j <= i + 3 && !done; j++) {
        if (hasLabel(paras[j].text)) break;
        const sj = MONEY_SLOT_RE.exec(paras[j].text);
        if (sj) {
          paras[j].body = replaceParagraphBody(paras[j].body, sj[0], outValue);
          count++;
          done = true;
        } else if (paras[j].text.trim()) {
          break;
        }
      }
      if (done) break;
    }
  }
  if (count === 0) return { xml, count };

  // Rebuild the document, splicing in the (possibly) modified paragraph bodies.
  let out = "";
  let cursor = 0;
  for (const p of paras) {
    out += xml.slice(cursor, p.start) + p.body;
    cursor = p.end;
  }
  out += xml.slice(cursor);
  return { xml: out, count };
}

async function applyMoneyFieldSlots(docxBuffer: Buffer, rent: string, deposit: string): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(docxBuffer);

  const files = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
  ];

  let total = 0;
  for (const filePath of files) {
    const file = zip.file(filePath);
    if (!file) continue;
    const { xml, count } = replaceMoneyFieldSlots(file.asText(), rent, deposit);
    if (count > 0) zip.file(filePath, xml);
    total += count;
  }
  console.log(`[money-fields] set ${total} Monthly Rent / Security Deposit slot(s)`);
  return total > 0 ? Buffer.from(zip.generate({ type: "nodebuffer" })) : docxBuffer;
}

// Plain-text counterpart of replaceMoneyFieldSlots, for the clause/tokenized-text
// pipeline (extractLeaseSchema Phase 3). The value-keyed pair tokenization can't tell
// rent from deposit when they share an amount (the dedup drops one and both collapse to
// {{rent_amount}}), so set each by its label. Replaces only the value slot right after
// the label, leaving clause prose like "SECURITY DEPOSIT: YOU AGREE…" untouched.
function tokenizeMoneyFieldsByLabel(text: string): string {
  const slot = String.raw`\{\{[A-Za-z_]+\}\}|\$[ \t]*[\d,]+(?:\.\d{1,2})?|\$?[ \t]*_{2,}`;
  return text
    .replace(new RegExp(String.raw`(Monthly[ \t]+(?:Rent|Payment)[ \t]*:[ \t]*)(?:${slot})`, "i"), "$1{{rent_amount}}")
    .replace(new RegExp(String.raw`(Security[ \t]+Deposit[ \t]*:[ \t]*)(?:${slot})`, "i"), "$1{{security_deposit}}");
}

// ─── Restore the "Lease Date:" agreement-date header ─────────────────────────
// The AI extraction emits a generic { search:"Date:", token:"{{Date;type=date;role=…}}" }
// pair to anchor signer dates at the signature blocks. That same broad search also
// matches the agreement-date header at the top of the lease ("Lease Date:"), turning it
// into a stray "Lease {{Date;type=date;role=…}}" signing anchor — even though the lease
// date is already filled right beside it. Restore that one occurrence to the literal
// "Date:" label. Only the header is touched: signature-block date anchors are never
// preceded by the word "Lease", so they are left intact.
async function applyLeaseDateHeader(docxBuffer: Buffer): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(docxBuffer);
  const re = /(Lease\s+)\{\{Date;type=date;role=[^}]*\}\}/g;
  let total = 0;
  for (const filePath of [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
  ]) {
    const file = zip.file(filePath);
    if (!file) continue;
    const xml = file.asText();
    const out = xml.replace(re, (_m, lead: string) => { total++; return `${lead}Date:`; });
    if (out !== xml) zip.file(filePath, out);
  }
  console.log(`[lease-date-header] restored ${total} "Lease Date:" header label(s)`);
  return total > 0 ? Buffer.from(zip.generate({ type: "nodebuffer" })) : docxBuffer;
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
  // Override rent/deposit by label so the deposit keeps its own token even when it
  // shares an amount with rent (the value-keyed pairs above can't distinguish them).
  tokenizedText = tokenizeMoneyFieldsByLabel(tokenizedText);
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

// ─── INITIALS line removal + tag insertion ───────────────────────────────────
// Port of the local python-docx cleaning script, hardened for documents whose
// initials slots may already be partially tagged. For every paragraph (body and
// table cells — table paragraphs are also <w:p> in document.xml) whose combined
// run text contains an initials construct, the WHOLE construct is collapsed to a
// single Tenant-1 DocuSeal anchor:
//   • "INITIALS: ( ) ( )"                                  → {{Initial;...Tenant 1}}
//   • "INITIALS: ( )"                                      → {{Initial;...Tenant 1}}
//   • "INITIALS: {{Initial;...Tenant 1}}(   )"  (leftover) → {{Initial;...Tenant 1}}
//   • "INITIAL AT LETTER D"                                → {{Initial;...Tenant 1}}
// A "slot" is either a parenthesis group "( ... )" OR an already-inserted initials
// tag, so the label + every following slot/tag (in any combination) is consumed —
// this is what eliminates the leftover "(   )" that the old two-paren regex missed.
// Working on the combined run text (via collectRuns) mirrors python-docx's
// paragraph.text, so matches survive when the construct is split across <w:r> runs.
// Idempotent: a bare tag with no trailing slot does not match, so re-running is a no-op.

// Separator placed between adjacent per-tenant initials anchors. Tune this single
// constant to control how the boxes are spaced in the rendered document.
const INITIALS_ANCHOR_SEPARATOR = " ";

function replaceInitialsSlots(xml: string, tenantCount: number): { xml: string; count: number } {
  const n = Math.max(1, tenantCount);
  // One initials anchor per tenant: Tenant 1 … Tenant N, placed side by side.
  const TAGS = Array.from({ length: n }, (_, i) =>
    `{{Initial;type=initials;role=Tenant ${i + 1}}}`,
  ).join(INITIALS_ANCHOR_SEPARATOR);

  const TAG_ANY = "\\{\\{Initial;type=initials;role=[^}]*\\}\\}"; // any existing initials anchor
  // A slot is a parenthesis group OR an existing initials anchor tag.
  const SLOT = `(?:${TAG_ANY}|\\([^)]*\\))`;
  // (a) labeled: "INITIALS:" + optional :/- + at least one slot, then any more slots
  //     (raw templates, e.g. "INITIALS: ( )( )" or a half-tagged "INITIALS: {{tag}}( )").
  const LABELED = `\\binitials\\b\\s*[:\\-]?\\s*${SLOT}(?:\\s*${SLOT})*`;
  // (b) bare: one or more already-normalized initials anchors with no label —
  //     this is what an uploaded template looks like at fill time, so the single
  //     Tenant-1 anchor can be expanded into one anchor per tenant.
  const BARE = `${TAG_ANY}(?:\\s*${TAG_ANY})*`;
  const INITIALS_RE = new RegExp(`(?:${LABELED}|${BARE})`, "i");
  const LETTER_D_RE = /INITIAL\s+AT\s+LETTER\s+D/i;

  let count = 0;
  const out = xml.replace(/(<w:p\b(?:[^>]*)>)([\s\S]*?)(<\/w:p>)/g, (full, open, body, close) => {
    const combined = collectRuns(body).map((r) => r.text).join("");
    const m = INITIALS_RE.exec(combined) ?? LETTER_D_RE.exec(combined);
    if (!m) return full;
    count++;
    return open + replaceParagraphBody(body, m[0], TAGS) + close;
  });
  return { xml: out, count };
}

// Replaces every INITIALS construct with one initials anchor per tenant (Tenant 1…N).
// Defaults to a single Tenant-1 anchor (tenantCount = 1), which is what upload-time
// normalization and the tenant-agnostic tokenized template use.
export async function applyInitialsSignTags(
  docxBuffer: Buffer,
  tenantCount = 1,
): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(docxBuffer);

  const files = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
  ];

  let total = 0;
  for (const filePath of files) {
    const file = zip.file(filePath);
    if (!file) continue;
    const { xml, count } = replaceInitialsSlots(file.asText(), tenantCount);
    if (count > 0) zip.file(filePath, xml);
    total += count;
  }

  console.log(
    `[initials-tags] replaced ${total} INITIALS slot(s) with ${Math.max(1, tenantCount)} tenant anchor(s) each`,
  );
  return Buffer.from(zip.generate({ type: "nodebuffer" }));
}

// ─── "N Lessee Print:" name fill (deterministic, label-driven) ───────────────
// The numbered Lessee-print signature table ("1 Lessee Print:", "2 Lessee Print:",
// "Lessor Print:") is otherwise filled from AI-extracted substitution pairs, which
// is unreliable here: the model frequently collapses BOTH tenant names onto row 1
// (e.g. by mapping the row-1 blank to {{all_tenant_names}}), and the data-token
// dedup in parseSubstitutionPairs can drop the row-2 pair when both cells share the
// same blank text. Worse, those pairs are baked in at upload time, so old templates
// stay broken. This pass owns the table deterministically — exactly mirroring how
// applyInitialsSignTags owns INITIALS — keying off the literal label so each row
// gets exactly one name: row 1 → primary tenant, row 2 → second tenant, etc.

// Matches a "1 Lessee Print:" style label; group 1 is the row number (1, 2, or 3).
// Tolerates a missing colon and variable spacing. "Lessor Print" never matches.
const NUMBERED_LESSEE_PRINT_RE = /\b([123])\s*Lessee\s+Print\s*:?/i;
// Fallback for an unnumbered "Lessee Print:" label → treated as row 1. Used only
// when the document has no numbered label at all.
const SINGULAR_LESSEE_PRINT_RE = /\bLessee\s+Print\s*:?/i;

function replaceLesseePrintSlots(
  xml: string,
  tenantNames: string[],
): { xml: string; count: number } {
  // Only fall back to the singular "Lessee Print:" label when there is no numbered
  // label anywhere — otherwise the singular pattern would also match the numbered ones.
  const hasNumbered = NUMBERED_LESSEE_PRINT_RE.test(xml);

  let count = 0;
  const out = xml.replace(/(<w:p\b(?:[^>]*)>)([\s\S]*?)(<\/w:p>)/g, (full, open, body, close) => {
    const combined = collectRuns(body).map((r) => r.text).join("");

    const numbered = NUMBERED_LESSEE_PRINT_RE.exec(combined);
    const m = numbered ?? (!hasNumbered ? SINGULAR_LESSEE_PRINT_RE.exec(combined) : null);
    if (!m) return full;

    const rowNum = numbered ? Number(numbered[1]) : 1;
    const name = tenantNames[rowNum - 1];
    // No tenant for this row (e.g. row 2 on a single-tenant lease): leave the
    // original blank untouched so the line stays fillable.
    if (name === undefined) return full;

    // Replace the whole label segment plus whatever currently follows it (an old
    // name, underscores, or nothing) up to the end of the cell's combined text.
    const labelText = m[0];
    const search = combined.slice(m.index);
    const value = `${labelText} ${name}`;

    count++;
    return open + replaceParagraphBody(body, search, value) + close;
  });
  return { xml: out, count };
}

// Rewrites the role of EVERY Sign/Date anchor it matches (group 1 = up to "role=",
// group 2 = closing "}}"). Initials are intentionally excluded — applyInitialsSignTags
// owns and rewrites those separately.
const ANCHOR_ROLE_RE = /(\{\{(?:Sign|Date);type=[^}]*?role=)(?:Tenant\s*\d+|Manager)(\}\})/gi;
// Reads a row's signature-anchor role to tell a lessee row from the lessor/landlord row.
const SIGN_ROLE_RE = /\{\{Sign;type=signature;role=(Tenant\s*\d+|Manager)\}\}/i;
const MGR_SIGN_RE = /\{\{Sign;type=signature;role=Manager\}\}/i;
const TENANT_SIGN_RE = /\{\{Sign;type=signature;role=Tenant\s*\d+\}\}/i;

// Force each row of the Lessee/Lessor signature table to sign as the correct party.
// The AI extraction and the manager's template token picker (which only offers Tenant 1
// & 2) routinely leave the SECOND lessee row as "Tenant 1" and scramble the date-anchor
// roles (e.g. the co-tenant's date anchor lands as Manager, the landlord's as Tenant 1),
// so multiple parties collapse onto one signer. Only the FIRST row carries an explicit
// "N Lessee Print:" label, so the old label-only pass could not reach the others.
// Instead we walk each signature table top-to-bottom: lessee rows get Tenant 1, 2, … in
// order; the landlord row (its signature anchor is role=Manager) gets Manager. Both the
// Sign and Date anchors in a row are set to that single role. Rows beyond the actual
// tenant count are left untouched so we never mint a phantom signer field.
function fixLesseeSignatureRoles(xml: string, tenantCount: number): { xml: string; count: number } {
  let count = 0;
  const out = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tbl) => {
    // Only touch a table that is actually a lessee/lessor signature block: it either
    // labels a "Lessee Print" row, or pairs a tenant signature anchor with a manager one.
    const tblText = collectRuns(tbl).map((r) => r.text).join("");
    const isSigTable =
      /Lessee\s+Print/i.test(tblText) || (MGR_SIGN_RE.test(tbl) && TENANT_SIGN_RE.test(tbl));
    if (!isSigTable) return tbl;

    let tenantSeq = 0; // last assigned lessee number within this table
    return tbl.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
      if (!/\{\{(?:Sign|Date);type=/.test(row)) return row; // not a signer row
      const combined = collectRuns(row).map((r) => r.text).join("");
      const labelNum = NUMBERED_LESSEE_PRINT_RE.exec(combined)?.[1];
      const signRole = SIGN_ROLE_RE.exec(row)?.[1];

      let target: string | null;
      if (labelNum) {
        // Explicit "N Lessee Print:" label wins, and reanchors the running sequence
        // (each signature block restarts at "1 Lessee Print:").
        tenantSeq = Number(labelNum);
        target = tenantSeq <= tenantCount ? `Tenant ${tenantSeq}` : null;
      } else if (signRole && /Manager/i.test(signRole)) {
        target = "Manager"; // lessor / landlord / agent row
      } else {
        tenantSeq += 1;
        target = tenantSeq <= tenantCount ? `Tenant ${tenantSeq}` : null;
      }
      if (!target) return row; // no real signer for this row — leave it as-is

      return row.replace(ANCHOR_ROLE_RE, (_full, pre, post) => {
        count++;
        return `${pre}${target}${post}`;
      });
    });
  });
  return { xml: out, count };
}

// Owns the Lessee signature table at fill time: (1) fills each "N Lessee Print:"
// label with the matching tenant name, and (2) renumbers each row's tenant signer
// anchor to role=Tenant N. Overrides whatever the AI substitution pairs placed there.
export async function applyLesseePrintNames(
  docxBuffer: Buffer,
  tenantNames: string[],
): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(docxBuffer);

  const files = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
  ];

  let totalNames = 0;
  let totalRoles = 0;
  for (const filePath of files) {
    const file = zip.file(filePath);
    if (!file) continue;
    const named = replaceLesseePrintSlots(file.asText(), tenantNames);
    const roled = fixLesseeSignatureRoles(named.xml, tenantNames.length);
    if (named.count > 0 || roled.count > 0) zip.file(filePath, roled.xml);
    totalNames += named.count;
    totalRoles += roled.count;
  }

  console.log(
    `[lessee-print] filled ${totalNames} "Lessee Print" row(s) and renumbered ${totalRoles} signer anchor(s) across ${tenantNames.length} tenant(s)`,
  );
  return Buffer.from(zip.generate({ type: "nodebuffer" }));
}


function expandTenantNameRows(xml: string, searches: string[], names: string[]): { xml: string; count: number } {
  const targets = [...new Set(searches.filter(Boolean))];
  if (names.length === 0 || targets.length === 0) return { xml, count: 0 };
  let count = 0;
  const out = xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    if (/;type=(?:signature|date|initials)/i.test(row)) return row;
    const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
    const cellTexts = cells.map((c) => collectRuns(c).map((r) => r.text).join(""));
    let matchIdx = -1;
    let matched = "";
    for (let i = 0; i < cellTexts.length && matchIdx === -1; i++) {
      const hit = targets.find((s) => cellTexts[i].includes(s) && cellTexts[i].replace(s, "").trim() === "");
      if (hit) { matchIdx = i; matched = hit; }
    }
    if (matchIdx === -1) return row;
    // Every other cell must be empty — otherwise a sibling holds a label we'd duplicate.
    if (!cellTexts.every((t, i) => i === matchIdx || t.trim() === "")) return row;
    count++;
    // Clone the original row once per name, replacing the placeholder with that name.
    return names.map((nm) => replaceParagraphBody(row, matched, nm)).join("");
  });
  return { xml: out, count };
}

export async function applyTenantNameRowExpansion(
  docxBuffer: Buffer,
  data: LeaseData,
  pairs: Array<{ search: string; token: string }> = [],
): Promise<Buffer> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(docxBuffer);

  const name = (t: { firstName: string; lastName: string }) => `${t.firstName} ${t.lastName}`.trim();
  const allNames = [name(data.primaryTenant), ...data.additionalTenants.map(name)];
  const coNames = data.additionalTenants.map(name);

  // Search strings that resolve to each multi-tenant token come from the schema pairs
  // (the real blanks in the template); the literal tokens are fallbacks.
  const searchesFor = (token: string, fallback: string) =>
    [...pairs.filter((p) => p.token === token).map((p) => p.search), fallback];
  const allSearches = searchesFor("{{all_tenant_names}}", "{{all_tenant_names}}");
  const coSearches = searchesFor("{{co_tenant_names}}", "{{co_tenant_names}}");

  const files = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
  ];

  let total = 0;
  for (const filePath of files) {
    const file = zip.file(filePath);
    if (!file) continue;
    let xml = file.asText();
    const all = expandTenantNameRows(xml, allSearches, allNames);
    xml = all.xml;
    const co = expandTenantNameRows(xml, coSearches, coNames);
    xml = co.xml;
    const count = all.count + co.count;
    if (count > 0) zip.file(filePath, xml);
    total += count;
  }

  console.log(`[tenant-rows] expanded ${total} standalone tenant-name row(s) into one row per tenant`);
  return Buffer.from(zip.generate({ type: "nodebuffer" }));
}

// ─── Public: generate filled lease (returns DOCX buffer) ─────────────────────

export async function generateLease(
  schema: ExtractedLeaseSchema,
  data: LeaseData,
  blobUrl: string,
): Promise<Buffer> {
  if (schema.originalFormat === "docx") {
    const original = await fetchBuffer(blobUrl);
    // Guard: verify magic bytes are DOCX/ZIP (PK header)
    if (original[0] === 0x50 && original[1] === 0x4b) {
      // First, expand any standalone "tenant list" row (a cell holding only the
      // all/co-tenant placeholder) into one row per tenant. Runs on the raw template
      // before substitution; driven by the pair search strings (the real blanks).
      const buffer = await applyTenantNameRowExpansion(original, data, schema.pairs);
      const map = buildReplacementMap(data);
      const replacements = schema.pairs
        .filter((p) => p.search && p.token)
        // INITIALS are handled EXCLUSIVELY by applyInitialsSignTags (single Tenant-1
        // anchor). Drop every initials pair the Claude extraction produced — otherwise
        // its Tenant-1/Tenant-2 pairs partially match the oddly-spaced "( )( )" slots and
        // re-introduce stray Tenant 2 tags and leftover parens.
        .filter((p) => !p.token.includes(";type=initials"))
        // Drop stale "label expansion" pairs like { search:"INITIALS:", token:"INITIALS: {{Initial;...}}" }
        // where the token embeds the search string — these orphan blank slots that can't be cleaned up.
        .filter((p) => !(p.token.includes(p.search) && p.token.includes(";type=")))
        .map((p) => {
          // DocuSeal anchor tags (contain ";type=") are used verbatim — not looked up in the data map
          if (p.token.includes(";type=")) {
            return { search: p.search, value: p.token };
          }
          const key = p.token.replace(/^\{\{|\}\}$/g, "");
          return { search: p.search, value: map[key] ?? "" };
        });
      const pairFilled = await fillDocxDirect(buffer, replacements);
      // Then fill any literal {{token}} placeholders that live in the template itself.
      // Tokenized templates embed "{{rent_amount}}" / "{{security_deposit}}" directly
      // (rather than a sample value the AI pairs key off of), so the pair path never
      // touches them. This pass rewrites ONLY the text inside <w:t> nodes, so it fills
      // tokens that share a run with their label + a <w:tab/> (e.g.
      // "Monthly Rent:\t{{rent_amount}}") without the run-splicing replacer's corruption.
      const tokenFilled = await applyDataTokens(pairFilled, map);
      // Deterministically own the "Monthly Rent:" / "Security Deposit:" lines by label,
      // so the deposit field gets its own amount even when the AI pairs collapsed both
      // to one token because rent and deposit share the same sample value.
      const filled = await applyMoneyFieldSlots(tokenFilled, map.rent_amount, map.security_deposit);
      // Restore the "Lease Date:" agreement-date header that the generic "Date:" anchor
      // pair clobbered with a stray signer-date tag (the date itself is already filled).
      const datedHeader = await applyLeaseDateHeader(filled);
      const tenantCount = 1 + (data.additionalTenants?.length ?? 0);
      // Deterministically own the "N Lessee Print:" signature table — overrides any
      // AI pairs that landed both names on row 1 (the AI prompt for this table is
      // unreliable), giving each row exactly one tenant name.
      const tenantNames = [
        `${data.primaryTenant.firstName} ${data.primaryTenant.lastName}`.trim(),
        ...data.additionalTenants.map((t) => `${t.firstName} ${t.lastName}`.trim()),
      ];
      const withLesseeNames = await applyLesseePrintNames(datedHeader, tenantNames);
      // Expand every INITIALS construct into one anchor per tenant (Tenant 1…N), driven
      // by how many tenants are on this lease. This is the sole owner of initials handling
      // and also normalizes templates uploaded before the upload-time transform existed.
      return applyInitialsSignTags(withLesseeNames, tenantCount);
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
        // INITIALS are owned exclusively by applyInitialsSignTags — drop Claude's
        // initials pairs so they don't re-introduce Tenant 2 tags / leftover parens.
        .filter((p) => !p.token.includes(";type=initials"))
        .filter((p) => !(p.token.includes(p.search) && p.token.includes(";type=")))
        .map((p) => ({ search: p.search, value: p.token }));
      // Apply Claude's extracted pairs, bake property constants, then do the reliable
      // regex-based INITIALS → single Tenant-1 anchor pass (idempotent).
      const tokenized = await fillDocxDirect(buffer, replacements);
      const baked = await applyBakedTokens(tokenized, schema);
      // Own the Monthly Rent / Security Deposit lines by label so each carries its own
      // token, even when both showed the same sample amount in the source template.
      const moneyOwned = await applyMoneyFieldSlots(baked, "{{rent_amount}}", "{{security_deposit}}");
      return applyInitialsSignTags(moneyOwned);
    }
  }
  const fromClauses = await buildTemplateDocxFromClauses(schema);
  return applyBakedTokens(fromClauses, schema);
}
