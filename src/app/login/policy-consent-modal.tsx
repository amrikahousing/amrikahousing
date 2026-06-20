"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-to-accept policy dialog. Renders the published legal document in a
 * same-origin iframe (so the bytes shown match the stored content hash) and
 * only enables the "I have read this" action once the user has scrolled to the
 * end. Confirming calls `onReviewed`, which the caller uses to enable the
 * acceptance checkbox.
 */
export function PolicyConsentModal({
  open,
  documentUrl,
  onReviewed,
  onClose,
}: {
  open: boolean;
  documentUrl: string;
  onReviewed: () => void;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [reachedBottom, setReachedBottom] = useState(false);

  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  function handleIframeLoad() {
    const win = iframeRef.current?.contentWindow;
    const doc = iframeRef.current?.contentDocument;
    const scroller = doc?.scrollingElement ?? doc?.documentElement;
    if (!win || !scroller) {
      // Can't observe scroll (shouldn't happen for a same-origin doc) — don't
      // trap the user behind an un-scrollable gate.
      setReachedBottom(true);
      return;
    }

    const check = () => {
      if (scroller.scrollTop + win.innerHeight >= scroller.scrollHeight - 24) {
        setReachedBottom(true);
      }
    };

    // Nothing to scroll (short document) → allow immediately.
    if (scroller.scrollHeight <= win.innerHeight + 24) {
      setReachedBottom(true);
      return;
    }
    // Long document: require a scroll to the end (reset in case the dialog was
    // opened before with a different/earlier state).
    setReachedBottom(false);
    win.addEventListener("scroll", check, { passive: true });
    check();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Privacy Policy and Terms of Service"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Privacy Policy &amp; Terms of Service
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <iframe
          ref={iframeRef}
          src={documentUrl}
          title="Privacy Policy and Terms of Service"
          onLoad={handleIframeLoad}
          className="min-h-0 w-full flex-1 bg-white"
        />

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <p
            className={`text-xs ${reachedBottom ? "text-emerald-700" : "text-slate-500"}`}
            aria-live="polite"
          >
            {reachedBottom
              ? "You've reached the end."
              : "Scroll to the end to continue."}
          </p>
          <button
            type="button"
            disabled={!reachedBottom}
            onClick={onReviewed}
            className="h-10 shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            I have read this
          </button>
        </div>
      </div>
    </div>
  );
}
