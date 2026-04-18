"use client";

import { useState } from "react";
import { ImportUploadStep } from "./ImportUploadStep";
import { ImportPreviewStep } from "./ImportPreviewStep";
import { ImportSuccessStep } from "./ImportSuccessStep";
import type { ImportSession, ImportResult, ParseResponse } from "@/lib/import-types";

type Step = "upload" | "preview" | "success";

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "preview", label: "Preview" },
  { id: "success", label: "Done" },
];

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [session, setSession] = useState<ImportSession | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileParsed(file: File) {
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/import/parse", { method: "POST", body: formData });
      const data: ParseResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to parse CSV");
      setSession({ headers: data.headers, mappings: data.mappings, validatedRows: data.validatedRows });
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirm() {
    if (!session) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validatedRows: session.validatedRows }),
      });
      const data: ImportResult & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsLoading(false);
    }
  }

  function reset() {
    setStep("upload");
    setSession(null);
    setResult(null);
    setError(null);
  }

  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => {
          const isActive = s.id === step;
          const isDone = i < currentIndex;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${
                isDone
                  ? "bg-[var(--green)] text-white"
                  : isActive
                  ? "bg-[var(--accent)] text-black"
                  : "border border-white/20 text-white/40"
              }`}>
                {isDone ? "✓" : i + 1}
              </div>
              <span className={`text-[13px] ${isActive ? "text-white" : "text-white/40"}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className="mx-1 h-px w-8 bg-white/15" />}
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div className="rounded-[12px] border border-white/12 bg-[var(--card)] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.3)] backdrop-blur-[16px]">
        {step === "upload" && (
          <ImportUploadStep onFileParsed={handleFileParsed} isLoading={isLoading} error={error} />
        )}
        {step === "preview" && session && (
          <ImportPreviewStep
            session={session}
            onConfirm={handleConfirm}
            onBack={reset}
            isLoading={isLoading}
          />
        )}
        {step === "success" && result && (
          <ImportSuccessStep result={result} onImportMore={reset} />
        )}
      </div>

      {step === "preview" && error && (
        <div className="mt-3 rounded-[8px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
