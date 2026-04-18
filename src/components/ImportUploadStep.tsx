"use client";

import { useRef, useState } from "react";

const SAMPLE_CSV = `property_name,address,city,state,zip,unit_count,property_type,manager_email
Oak Terrace,123 Oak Ave,Atlanta,GA,30303,4,rental,manager@example.com
Park Towers,456 Park Blvd,Chicago,IL,60601,12,rental,
Cedar House,789 Cedar Ln,Austin,TX,78701,1,rental,
`;

type Props = {
  onFileParsed: (file: File) => void;
  isLoading: boolean;
  error: string | null;
};

export function ImportUploadStep({ onFileParsed, isLoading, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      return;
    }
    onFileParsed(file);
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "amrika-housing-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="text-center">
        <h2 className="text-[24px] font-semibold text-white">Upload your portfolio</h2>
        <p className="mt-1 text-[13px] text-white/60">
          CSV file with your properties. Up to 500 rows, 5 MB max.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`w-full max-w-lg cursor-pointer rounded-[12px] border-2 border-dashed p-10 text-center transition-colors ${
          dragging
            ? "border-[var(--accent)] bg-[rgba(246,184,74,0.08)]"
            : "border-white/20 bg-white/4 hover:border-white/35 hover:bg-white/7"
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-[14px] text-white/70">
            {isLoading ? "Parsing…" : "Drop CSV here or click to browse"}
          </p>
          {isLoading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="w-full max-w-lg rounded-[8px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </div>
      )}

      {/* Column reference */}
      <div className="w-full max-w-lg rounded-[10px] border border-white/10 bg-white/4 p-4">
        <p className="mb-3 text-[12px] font-semibold text-white/50 uppercase tracking-wide">Expected columns</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
          {[
            ["property_name", "required"],
            ["address", "required"],
            ["city", "required"],
            ["state", "required (2-letter)"],
            ["zip", "required"],
            ["unit_count", "optional, default 1"],
            ["property_type", "rental or association"],
            ["manager_email", "optional"],
          ].map(([col, note]) => (
            <div key={col} className="flex gap-2">
              <code className="text-[var(--accent)]">{col}</code>
              <span className="text-white/40">{note}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-white/35">Column headers don&apos;t need to match exactly — we&apos;ll map them automatically.</p>
      </div>

      <button
        onClick={downloadSample}
        className="text-[13px] text-white/50 underline underline-offset-2 hover:text-white/80 transition-colors"
      >
        Download sample template
      </button>
    </div>
  );
}
