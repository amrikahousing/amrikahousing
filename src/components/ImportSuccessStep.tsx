"use client";

import Link from "next/link";
import type { ImportResult } from "@/lib/import-types";

type Props = {
  result: ImportResult;
  onImportMore: () => void;
};

export function ImportSuccessStep({ result, onImportMore }: Props) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--green)]/30 bg-[rgba(16,185,129,0.12)]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--green)]">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div>
        <h2 className="text-[28px] font-semibold text-white">
          {result.importedCount} propert{result.importedCount !== 1 ? "ies" : "y"} imported
        </h2>
        {result.skippedCount > 0 && (
          <p className="mt-1 text-[13px] text-white/50">
            {result.skippedCount} row{result.skippedCount !== 1 ? "s" : ""} skipped due to errors
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <Link
          href="/properties"
          className="rounded-[8px] bg-[linear-gradient(180deg,rgba(16,185,129,1),rgba(10,145,100,1))] px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
        >
          View properties
        </Link>
        <button
          onClick={onImportMore}
          className="rounded-[8px] border border-white/15 bg-white/8 px-5 py-2.5 text-[13px] text-white/70 hover:bg-white/12"
        >
          Import more
        </button>
      </div>
    </div>
  );
}
