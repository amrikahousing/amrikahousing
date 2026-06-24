"use client";

import { useEffect, useRef, useState } from "react";

// Renders DOCX bytes (base64) with full layout fidelity — tables, merged cells, column
// widths, headers/footers — so an on-screen preview matches the downloaded document.
// mammoth's HTML conversion discards this layout, which made tables render broken.
export function DocxPreview({
  base64,
  className,
  scale = 1,
  page = false,
  fallbackHint = "Download the file to inspect it.",
}: {
  base64: string | null;
  className?: string;
  // Zoom factor applied to the rendered document. 1 = 100%. Uses CSS `zoom`
  // so the element's layout box (and the scroll container) grows with the
  // content instead of overflowing invisibly like a `transform: scale` would.
  scale?: number;
  // `page` = true renders faithful, paginated paper pages (wrapper, real page
  // size, page breaks) — use for a read-only review. `page` = false renders one
  // continuous page at the document's real width — use under the tag canvas where
  // fields are dropped onto a single scrollable surface.
  page?: boolean;
  fallbackHint?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !base64) return;
    let cancelled = false;
    setFailed(false);
    el.innerHTML = "";
    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        if (cancelled || !containerRef.current) return;
        await renderAsync(bytes, containerRef.current, undefined, {
          className: "docxpv",
          inWrapper: page,
          // Honor the document's real page width and margins so the column,
          // line breaks, and alignment match Word instead of stretching to fill
          // the container. In flow mode we still let height grow continuously.
          ignoreWidth: false,
          ignoreHeight: !page,
          breakPages: page,
          // Measure and place real tab stops — keeps signature lines and aligned
          // fields from collapsing into a single space.
          experimental: true,
          trimXmlDeclaration: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base64, page]);

  if (failed) {
    return (
      <div className={className}>
        <p className="py-8 text-center text-sm text-slate-400">Could not render the document preview. {fallbackHint}</p>
      </div>
    );
  }
  return (
    <div className={className}>
      <div ref={containerRef} style={scale !== 1 ? { zoom: scale } : undefined} />
    </div>
  );
}
