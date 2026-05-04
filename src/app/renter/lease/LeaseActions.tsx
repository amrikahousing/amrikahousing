"use client";

export function LeaseActions({ hasDocument }: { hasDocument: boolean }) {
  if (hasDocument) {
    return (
      <a
        href="/api/renter/lease/download"
        className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        Download Lease Agreement
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
    >
      Print Lease Details
    </button>
  );
}
