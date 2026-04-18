"use client";

import type { ImportSession } from "@/lib/import-types";

type Props = {
  session: ImportSession;
  onConfirm: () => void;
  onBack: () => void;
  isLoading: boolean;
};

const CONFIDENCE_COLORS = {
  high: "text-[var(--green)] bg-[rgba(16,185,129,0.12)]",
  medium: "text-[var(--accent)] bg-[rgba(246,184,74,0.12)]",
  low: "text-red-400 bg-red-400/10",
};

export function ImportPreviewStep({ session, onConfirm, onBack, isLoading }: Props) {
  const { mappings, validatedRows } = session;
  const validCount = validatedRows.filter((r) => r.errors.length === 0).length;
  const errorCount = validatedRows.length - validCount;
  const mappedFields = mappings.filter((m) => m.schemaField !== null);

  return (
    <div className="flex flex-col gap-5">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-[8px] border border-[var(--green)]/30 bg-[rgba(16,185,129,0.1)] px-3 py-2 text-[13px] text-[var(--green)]">
          {validCount} row{validCount !== 1 ? "s" : ""} ready
        </div>
        {errorCount > 0 && (
          <div className="rounded-[8px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
            {errorCount} row{errorCount !== 1 ? "s" : ""} with errors (will be skipped)
          </div>
        )}
      </div>

      {/* Column mapping */}
      <div className="rounded-[10px] border border-white/10 bg-white/4 p-4">
        <p className="mb-3 text-[12px] font-semibold text-white/50 uppercase tracking-wide">Column mapping</p>
        <div className="flex flex-wrap gap-2">
          {mappings.map((m) => (
            <div key={m.csvHeader} className="flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/5 px-2 py-1 text-[12px]">
              <span className="text-white/60">{m.csvHeader}</span>
              <span className="text-white/30">→</span>
              {m.schemaField ? (
                <>
                  <code className="text-white/85">{m.schemaField}</code>
                  <span className={`rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold ${CONFIDENCE_COLORS[m.confidence]}`}>
                    {m.confidence}
                  </span>
                </>
              ) : (
                <span className="text-white/30 italic">unmapped</span>
              )}
            </div>
          ))}
        </div>
        {mappedFields.length < 3 && (
          <p className="mt-2 text-[12px] text-yellow-400/70">
            Few columns mapped — check that your CSV headers are recognizable.
          </p>
        )}
      </div>

      {/* Row table */}
      <div className="overflow-x-auto rounded-[10px] border border-white/10">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/6 text-left text-white/50">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Property name</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">City</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Zip</th>
              <th className="px-3 py-2">Units</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Issues</th>
            </tr>
          </thead>
          <tbody>
            {validatedRows.map((row) => {
              const hasError = row.errors.length > 0;
              const hasWarning = row.warnings.length > 0;
              return (
                <tr
                  key={row.rowIndex}
                  className={`border-b border-white/8 ${
                    hasError
                      ? "border-l-2 border-l-red-500 bg-red-500/5"
                      : hasWarning
                      ? "border-l-2 border-l-[var(--accent)] bg-[rgba(246,184,74,0.04)]"
                      : "border-l-2 border-l-[var(--green)]"
                  }`}
                >
                  <td className="px-3 py-2 text-white/40">{row.rowIndex + 1}</td>
                  <td className="px-3 py-2 text-white/85">{row.data.property_name || <span className="text-red-400 italic">missing</span>}</td>
                  <td className="px-3 py-2 text-white/65">{row.data.address || "—"}</td>
                  <td className="px-3 py-2 text-white/65">{row.data.city || "—"}</td>
                  <td className="px-3 py-2 text-white/65">{row.data.state || "—"}</td>
                  <td className="px-3 py-2 text-white/65">{row.data.zip || "—"}</td>
                  <td className="px-3 py-2 text-white/65">{row.data.unit_count}</td>
                  <td className="px-3 py-2 text-white/65">{row.data.property_type}</td>
                  <td className="px-3 py-2">
                    {hasError ? (
                      <div className="flex flex-col gap-0.5">
                        {row.errors.map((e, i) => (
                          <span key={i} className="text-red-400">{e.message}</span>
                        ))}
                      </div>
                    ) : hasWarning ? (
                      <div className="flex flex-col gap-0.5">
                        {row.warnings.map((w, i) => (
                          <span key={i} className="text-[var(--accent)]">{w.message}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[var(--green)]">✓</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="rounded-[8px] border border-white/15 bg-white/8 px-4 py-2 text-[13px] text-white/70 hover:bg-white/12 disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading || validCount === 0}
          className="rounded-[8px] bg-[linear-gradient(180deg,rgba(16,185,129,1),rgba(10,145,100,1))] px-5 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {isLoading ? "Importing…" : `Import ${validCount} propert${validCount !== 1 ? "ies" : "y"}`}
        </button>
      </div>
    </div>
  );
}
