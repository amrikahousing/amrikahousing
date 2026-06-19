"use client";

import { useEffect, useRef, useState } from "react";

// Renders DOCX bytes (base64) with full layout fidelity — tables, merged cells, column
// widths, headers/footers — so an on-screen preview matches the downloaded document.
// mammoth's HTML conversion discards this layout, which made tables render broken.
export function DocxPreview({
  base64,
  className,
  scale = 1,
  fallbackHint = "Download the file to inspect it.",
}: {
  base64: string | null;
  className?: string;
  // Zoom factor applied to the rendered document. 1 = 100%. Uses CSS `zoom`
  // so the element's layout box (and the scroll container) grows with the
  // content instead of overflowing invisibly like a `transform: scale` would.
  scale?: number;
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
          inWrapper: false,
          ignoreWidth: true,
          ignoreHeight: true,
          breakPages: false,
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
  }, [base64]);

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
