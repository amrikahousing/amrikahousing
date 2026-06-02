import sanitizeHtml from "sanitize-html";

export function escapeHtmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ANCHOR_CHIPS: [RegExp, string, string][] = [
  [/\{\{Sign;type=signature;role=Tenant 1\}\}/g,  "Tenant 1 — Signature", "lp-sig"],
  [/\{\{Sign;type=signature;role=Tenant 2\}\}/g,  "Tenant 2 — Signature", "lp-sig"],
  [/\{\{Sign;type=signature;role=Manager\}\}/g,   "Manager — Signature",  "lp-sig"],
  [/\{\{Initial;type=initials;role=Tenant 1\}\}/g, "T1 Initials", "lp-init"],
  [/\{\{Initial;type=initials;role=Tenant 2\}\}/g, "T2 Initials", "lp-init"],
  [/\{\{Initial;type=initials;role=Manager\}\}/g,  "Mgr Initials", "lp-init"],
  [/\{\{Date;type=date;role=Tenant 1\}\}/g, "T1 Date", "lp-date"],
  [/\{\{Date;type=date;role=Tenant 2\}\}/g, "T2 Date", "lp-date"],
  [/\{\{Date;type=date;role=Manager\}\}/g,  "Mgr Date", "lp-date"],
];

export function renderLeaseTokenChips(html: string): string {
  let out = html;
  // Strip DOCX XML artifact text that leaked into document content as visible text.
  // Mammoth HTML-escapes these to &lt;W:P...&gt;; strip before rendering chips.
  out = out.replace(/&lt;\/?[Ww]\d*:[A-Za-z][^&<>]*?(?:\/)?&gt;/g, "");
  for (const [pat, label, cls] of ANCHOR_CHIPS) {
    out = out.replace(pat, `<span class="lp-token ${cls}">${label}</span>`);
  }
  // Fallback: INITIALS: lines where DOCX slot replacement failed — slots still raw
  out = out.replace(
    /INITIALS:[^(]*(\([^)]*\))[^(]*(\([^)]*\))/gi,
    'INITIALS: <span class="lp-token lp-init">Tenant 1 — Initials</span><span class="lp-token lp-init">Tenant 2 — Initials</span>',
  );
  // Remaining {{data_token}} placeholders → gray chip with readable label
  out = out.replace(/\{\{([a-z_]+)\}\}/g, (_m, key: string) =>
    `<span class="lp-token lp-data">${key.replace(/_/g, " ")}</span>`,
  );
  return out;
}

export function sanitizeLeasePreviewHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "a",
      "abbr",
      "b",
      "blockquote",
      "br",
      "caption",
      "code",
      "col",
      "colgroup",
      "dd",
      "div",
      "dl",
      "dt",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "i",
      "li",
      "ol",
      "p",
      "pre",
      "s",
      "span",
      "strong",
      "sub",
      "sup",
      "table",
      "tbody",
      "td",
      "tfoot",
      "th",
      "thead",
      "tr",
      "u",
      "ul",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      span: ["class"],
    },
    allowedClasses: {
      span: ["lp-token", "lp-sig", "lp-init", "lp-date", "lp-data"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}
