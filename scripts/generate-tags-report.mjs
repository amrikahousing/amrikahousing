/**
 * Generates docs/TAGS-REPORT.docx — a formatted Word document listing
 * all 40 token tags supported by the lease-fill system.
 *
 * Run with:  node scripts/generate-tags-report.mjs
 */

import PizZip from "pizzip";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../docs/TAGS-REPORT.docx");

// ─── Tiny OOXML helpers ────────────────────────────────────────────────────────

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function para(text, { bold = false, size = 22, color = "000000", indent = 0, spaceBefore = 0, spaceAfter = 120 } = {}) {
  const indentXml = indent ? `<w:ind w:left="${indent}"/>` : "";
  const spaceXml = `<w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}"/>`;
  return `<w:p>
    <w:pPr>${indentXml}${spaceXml}</w:pPr>
    <w:r>
      <w:rPr>${bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/></w:rPr>
      <w:t xml:space="preserve">${esc(text)}</w:t>
    </w:r>
  </w:p>`;
}

function twoColPara(col1, col2, { bold1 = false, bold2 = false, size = 20, color1 = "1a1a1a", color2 = "444444", mono = false } = {}) {
  // Fake two-column via tab stop at 3600 twips (2.5 in)
  const monoRpr = mono ? "<w:rFonts w:ascii=\"Courier New\" w:hAnsi=\"Courier New\"/>" : "";
  return `<w:p>
    <w:pPr>
      <w:tabs><w:tab w:val="left" w:pos="3600"/></w:tabs>
      <w:spacing w:after="60"/>
    </w:pPr>
    <w:r>
      <w:rPr>${bold1 ? "<w:b/><w:bCs/>" : ""}${monoRpr}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color1}"/></w:rPr>
      <w:t xml:space="preserve">${esc(col1)}</w:t>
    </w:r>
    <w:r><w:tab/></w:r>
    <w:r>
      <w:rPr>${bold2 ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color2}"/></w:rPr>
      <w:t xml:space="preserve">${esc(col2)}</w:t>
    </w:r>
  </w:p>`;
}

function divider() {
  return `<w:p>
    <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr><w:spacing w:before="60" w:after="60"/></w:pPr>
  </w:p>`;
}

function sectionHeader(title, color = "0F4C81") {
  return para(title, { bold: true, size: 26, color, spaceBefore: 240, spaceAfter: 80 });
}

function columnHeader() {
  return `<w:p>
    <w:pPr>
      <w:tabs><w:tab w:val="left" w:pos="3600"/></w:tabs>
      <w:spacing w:after="40"/>
      <w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="AAAAAA"/></w:pBdr>
    </w:pPr>
    <w:r>
      <w:rPr><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="777777"/></w:rPr>
      <w:t xml:space="preserve">TOKEN</w:t>
    </w:r>
    <w:r><w:tab/></w:r>
    <w:r>
      <w:rPr><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="777777"/></w:rPr>
      <w:t>DESCRIPTION</w:t>
    </w:r>
  </w:p>`;
}

// ─── Token data ────────────────────────────────────────────────────────────────

const DATA_TOKENS = [
  ["{{tenant_name}}",              "Full name of primary tenant / lessee only"],
  ["{{tenant_email}}",             "Email address of primary tenant"],
  ["{{all_tenant_names}}",         "ALL tenant names combined (primary + co-tenants), comma-separated"],
  ["{{co_tenant_names}}",          "Co-tenant full names only (comma-separated); omit if none"],
  ["{{property_name}}",            "Property name"],
  ["{{property_address}}",         "Full street address including city, state, zip"],
  ["{{property_address_with_unit}}","Full address + unit number (e.g. 480 MYRTLE STREET UNIT 508, NEW BRITAIN, CT 06053)"],
  ["{{property_street}}",          "Street address only — no city / state / zip (e.g. 480 MYRTLE STREET)"],
  ["{{unit_number}}",              "Unit number"],
  ["{{lease_start}}",              "Lease start date written out (e.g. June 1, 2026)"],
  ["{{lease_end}}",                "Lease end date written out"],
  ["{{rent_amount}}",              "Monthly rent in dollars (e.g. $2,500)"],
  ["{{rent_amount_words}}",        "Monthly rent written in words only (e.g. TWO THOUSAND FIVE HUNDRED)"],
  ["{{security_deposit}}",         "Security deposit amount (e.g. $5,000) or N/A"],
  ["{{total_rent}}",               "Total rent for the full lease term in words and figures"],
  ["{{organization_name}}",        "Landlord company / LLC / owner entity name (e.g. AVON TOWERS LLC)"],
  ["{{landlord_signatory}}",       "Individual who signs on behalf of the landlord entity (e.g. AMIT LAKHOTIA)"],
  ["{{property_manager_name}}",    "Full name of the property manager or point of contact"],
  ["{{property_manager_email}}",   "Email of the property manager or point of contact"],
  ["{{property_manager_phone}}",   "Phone number of the property manager or point of contact"],
  ["{{lease_term}}",               "Lease duration description (e.g. 12 months or month-to-month)"],
  ["{{late_fee_amount}}",          "Flat late fee charged after the grace period (e.g. $75.00)"],
  ["{{late_fee_grace_days}}",      "Number of grace days before a late fee is charged (e.g. 5)"],
  ["{{late_fee_pct}}",             "Late fee as a percentage of rent (e.g. 5%) — used only when lease states a percentage"],
  ["{{pet_fee_amount}}",           "Monthly or one-time pet fee (e.g. $50.00 per month)"],
  ["{{tenant_paid_utilities}}",    "Utilities the tenant is responsible for (e.g. Electric, Gas)"],
  ["{{early_termination_fee}}",    "Early lease termination fee dollar amount (e.g. $3,200.00)"],
  ["{{early_termination_months}}", "Number of months' rent used to calculate the ELT fee (e.g. 2 (two))"],
  ["{{guest_stay_limit}}",         "Maximum consecutive days an overnight guest may stay (e.g. two (2) days)"],
  ["{{condemnation_notice_days}}", "Notice period required after condemnation (e.g. fifteen (15) days)"],
  ["{{included_appliances}}",      "Appliances included in the unit (e.g. Stove and Refrigerator)"],
];

const ESIG_TOKENS = [
  ["{{Sign;type=signature;role=Tenant 1}}",   "Signature field — primary tenant / lessee"],
  ["{{Sign;type=signature;role=Tenant 2}}",   "Signature field — second tenant / co-lessee"],
  ["{{Sign;type=signature;role=Manager}}",    "Signature field — landlord / lessor / property manager"],
  ["{{Initial;type=initials;role=Tenant 1}}", "Initials field — primary tenant / lessee"],
  ["{{Initial;type=initials;role=Tenant 2}}", "Initials field — second tenant / co-lessee"],
  ["{{Initial;type=initials;role=Manager}}",  "Initials field — landlord / lessor / agent"],
  ["{{Date;type=date;role=Tenant 1}}",        "Signing date — primary tenant"],
  ["{{Date;type=date;role=Tenant 2}}",        "Signing date — second tenant"],
  ["{{Date;type=date;role=Manager}}",         "Signing date — landlord / lessor / agent"],
];

// ─── Build document XML ────────────────────────────────────────────────────────

const paras = [];

// Title
paras.push(para("LEASE TEMPLATE — TAGS REPORT", { bold: true, size: 36, color: "0F4C81", spaceBefore: 0, spaceAfter: 60 }));
paras.push(para("All tokens supported by the lease-fill system", { size: 22, color: "555555", spaceAfter: 60 }));
paras.push(para(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { size: 20, color: "888888", spaceAfter: 200 }));

paras.push(divider());

// Summary
paras.push(sectionHeader("SUMMARY"));
paras.push(twoColPara("Total token types", "40", { bold1: true, bold2: true, color2: "0F4C81" }));
paras.push(twoColPara("Data tokens", "31", { bold1: false, bold2: true }));
paras.push(twoColPara("E-signature anchor tags (DocuSeal)", "9", { bold1: false, bold2: true }));

paras.push(divider());

// Section 1 — Data tokens
paras.push(sectionHeader(`SECTION 1 — DATA TOKENS  (${DATA_TOKENS.length} total)`));
paras.push(para("Filled automatically from lease form data when generating a lease.", { size: 20, color: "555555", spaceAfter: 100 }));
paras.push(columnHeader());

DATA_TOKENS.forEach(([token, desc], i) => {
  paras.push(twoColPara(`${i + 1}.  ${token}`, desc, { mono: true, color1: "1a5276", color2: "333333" }));
});

paras.push(divider());

// Section 2 — E-signature tags
paras.push(sectionHeader(`SECTION 2 — E-SIGNATURE ANCHOR TAGS  (${ESIG_TOKENS.length} total)`, "1a5f1a"));
paras.push(para("Paste these tokens directly into your Word (.docx) template wherever a signer must act. DocuSeal reads them and places the interactive field on the document automatically.", { size: 20, color: "555555", spaceAfter: 100 }));
paras.push(columnHeader());

ESIG_TOKENS.forEach(([token, desc], i) => {
  paras.push(twoColPara(`${i + 1}.  ${token}`, desc, { mono: true, color1: "1a5f1a", color2: "333333" }));
});

paras.push(divider());

// Usage notes
paras.push(sectionHeader("USAGE NOTES", "7d3c00"));

const notes = [
  "Data tokens are replaced by the app at lease-generation time — they should appear as plain text in your template file exactly as shown (e.g. $1,700.00 or JOHN DOE), not pre-formatted with {{ }}.",
  "E-signature tags must be typed verbatim (including the semicolons) into the Word document text body. DocuSeal scans the uploaded DOCX for these exact strings and converts them to interactive fields.",
  "INITIALS blocks: standalone \"INITIALS: ( )( )\" lines always map to Tenant 1 (first slot) and Tenant 2 (second slot). Never assign Manager to a standalone body-text initials block.",
  "The same data token can appear many times in a document — the engine replaces every occurrence. E-signature tags are replaced sequentially: the first ( ) becomes Tenant 1, the second ( ) becomes Tenant 2.",
  "To regenerate the token pairs for an existing template, open the Lease Placeholders modal on the Property page and click \"Re-extract with AI\".",
];

notes.forEach((note, i) => {
  paras.push(`<w:p>
    <w:pPr><w:ind w:left="360" w:hanging="360"/><w:spacing w:after="120"/></w:pPr>
    <w:r>
      <w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:color w:val="7d3c00"/></w:rPr>
      <w:t xml:space="preserve">${i + 1}.  </w:t>
    </w:r>
    <w:r>
      <w:rPr><w:sz w:val="20"/><w:color w:val="333333"/></w:rPr>
      <w:t xml:space="preserve">${esc(note)}</w:t>
    </w:r>
  </w:p>`);
});

// ─── Assemble DOCX ────────────────────────────────────────────────────────────

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paras.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

const zip = new PizZip();
zip.file("[Content_Types].xml", contentTypes);
zip.file("_rels/.rels", rootRels);
zip.file("word/document.xml", documentXml);
zip.file("word/_rels/document.xml.rels", docRels);

const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(OUT, buf);

console.log(`✅  TAGS-REPORT.docx written to ${OUT}`);
console.log(`    Data tokens   : ${DATA_TOKENS.length}`);
console.log(`    E-sig tags    : ${ESIG_TOKENS.length}`);
console.log(`    Total         : ${DATA_TOKENS.length + ESIG_TOKENS.length}`);
