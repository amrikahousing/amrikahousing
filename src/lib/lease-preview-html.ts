import sanitizeHtml from "sanitize-html";

export function escapeHtmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Sanitizer for the interactive taggable preview in the Tags step.
// Allows data-token and data-blank-search on <span> so the drag-drop engine works.
export function sanitizeTaggableHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "a", "b", "br", "caption", "col", "colgroup", "div", "em",
      "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "li", "ol",
      "p", "s", "span", "strong", "sub", "sup",
      "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      span: ["class", "data-token", "data-blank-search"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
  });
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
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}
