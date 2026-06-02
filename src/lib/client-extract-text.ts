// Browser-side text extraction for lease templates.
// Runs entirely in the user's browser — no server round-trip needed for Phase 1.
// Supports text-layer PDFs (via pdfjs-dist) and DOCX (via mammoth's browser build).
// Scanned/image-only PDFs return empty text and the caller should fall back to
// server-side Claude vision (signalled by `needsServerExtraction: true`).

export type ClientExtractResult = {
  text: string;
  format: "pdf" | "docx" | "unknown";
  pageCount?: number;
  needsServerExtraction: boolean;   // true if local extraction produced too little text
};

export type ClientExtractProgress = (info: {
  stage: "reading-file" | "parsing-pdf" | "parsing-docx" | "done";
  page?: number;
  totalPages?: number;
}) => void;

// Magic-byte detection so we don't trust the browser-reported MIME type.
function detectFormat(buffer: ArrayBuffer): "pdf" | "docx" | "unknown" {
  const bytes = new Uint8Array(buffer, 0, 4);
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "docx";
  return "unknown";
}

async function extractPdfText(
  buffer: ArrayBuffer,
  onProgress?: ClientExtractProgress,
): Promise<{ text: string; pageCount: number }> {
  // Dynamic import so pdfjs-dist is only loaded when actually needed (~400KB).
  const pdfjs = await import("pdfjs-dist");
  // pdfjs needs a worker script. Point at the worker shipped inside the package;
  // Next.js/turbopack will serve it from node_modules and the URL is resolved at runtime.
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    // Use the matching minified worker that ships with the installed pdfjs-dist version.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({ stage: "parsing-pdf", page: pageNum, totalPages });
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    // Each item is a text fragment with a position. Join with spaces and
    // preserve paragraph breaks where the layout suggests them.
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/[ \t]+/g, " ")
      .trim();
    pages.push(pageText);
  }

  return { text: pages.join("\n\n"), pageCount: totalPages };
}

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  // Mammoth's browser build extracts raw text from DOCX without a server.
  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

/**
 * Extract text from a lease file entirely in the browser.
 * Returns the extracted text plus a flag indicating whether server-side
 * fallback (Claude vision) is needed — true for scanned/image-only PDFs.
 */
export async function extractLeaseTextInBrowser(
  file: File,
  onProgress?: ClientExtractProgress,
): Promise<ClientExtractResult> {
  onProgress?.({ stage: "reading-file" });
  const buffer = await file.arrayBuffer();
  const format = detectFormat(buffer);

  if (format === "pdf") {
    const { text, pageCount } = await extractPdfText(buffer, onProgress);
    onProgress?.({ stage: "done" });
    // Heuristic: if a multi-page PDF produced almost no text, it's a scanned doc.
    // Threshold: at least 50 chars per page on average for a text-layer PDF.
    const needsServerExtraction = text.length < pageCount * 50;
    return { text, format, pageCount, needsServerExtraction };
  }

  if (format === "docx") {
    onProgress?.({ stage: "parsing-docx" });
    const text = await extractDocxText(buffer);
    onProgress?.({ stage: "done" });
    return { text, format, needsServerExtraction: text.length === 0 };
  }

  return { text: "", format: "unknown", needsServerExtraction: true };
}
