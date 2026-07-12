"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "./ToastProvider";

type LeaseDocumentSummary = {
  id: string;
  fileName: string;
  contentType: string;
  kind: "uploaded" | "docuseal";
  uploadedBy: string | null;
  createdAt: string;
  isCurrent: boolean;
};

type LeaseTermDefaults = {
  startDate: string | null;
  endDate: string | null;
  rentAmount: number | null;
  securityDeposit: number | null;
  monthlyRentCredit: number | null;
};

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function Modal({
  title,
  onClose,
  children,
  maxWidthClassName = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-2xl ${maxWidthClassName}`}>
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function formatDocumentDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function LeaseFilePicker({
  file,
  onSelect,
  placeholder,
}: {
  file: File | null;
  onSelect: (file: File | null) => void;
  placeholder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors",
        file ? "border-emerald-400 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40",
      ].join(" ")}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="sr-only"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <p className="text-sm font-medium text-slate-800">{file.name}</p>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-700">{placeholder}</p>
          <p className="text-xs text-slate-400">PDF, JPG, or PNG · up to 20MB</p>
        </>
      )}
    </div>
  );
}

function DocumentHistoryList({ leaseId, documents }: { leaseId: string; documents: LeaseDocumentSummary[] }) {
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={`/api/leases/${leaseId}/documents/${doc.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm font-medium text-gray-900 hover:underline"
              >
                {doc.fileName}
              </a>
              {doc.isCurrent && (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Current
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {formatDocumentDate(doc.createdAt)}
              {doc.uploadedBy ? ` · ${doc.uploadedBy}` : ""}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
              doc.kind === "docuseal" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {doc.kind === "docuseal" ? "E-signed" : "Manual"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReplaceLeaseDocumentModal({
  leaseId,
  unitNumber,
  onClose,
  onReplaced,
}: {
  leaseId: string;
  unitNumber: string;
  onClose: () => void;
  onReplaced: () => void;
}) {
  const toast = useToast();
  const [documents, setDocuments] = useState<LeaseDocumentSummary[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leases/${leaseId}/documents`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load document history.");
        return body.documents as LeaseDocumentSummary[];
      })
      .then((docs) => {
        if (!cancelled) setDocuments(docs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load document history.");
      });
    return () => {
      cancelled = true;
    };
  }, [leaseId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a document to upload.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/leases/${leaseId}/document`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not replace the lease document.");
      toast.success(`Lease document for Unit ${unitNumber} replaced.`, { title: "Lease" });
      onReplaced();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not replace the lease document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Replace lease document · Unit ${unitNumber}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Upload a new signed copy for the current lease. The lease terms stay the same, and every
          previous document remains available below.
        </p>

        <LeaseFilePicker file={file} onSelect={setFile} placeholder="Click to upload the new signed lease" />

        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Document history</p>
          {documents === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-gray-500">No documents on file yet — this upload will be the first.</p>
          ) : (
            <DocumentHistoryList leaseId={leaseId} documents={documents} />
          )}
        </div>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !file}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
          >
            {saving ? "Uploading…" : "Replace document"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function RenewLeaseModal({
  leaseId,
  unitNumber,
  defaults,
  onClose,
  onRenewed,
}: {
  leaseId: string;
  unitNumber: string;
  defaults: LeaseTermDefaults;
  onClose: () => void;
  onRenewed: () => void;
}) {
  const toast = useToast();
  const [startDate, setStartDate] = useState(() => {
    if (!defaults.endDate) return "";
    const next = new Date(`${defaults.endDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState("");
  const [rentAmount, setRentAmount] = useState(defaults.rentAmount !== null ? String(defaults.rentAmount) : "");
  const [securityDeposit, setSecurityDeposit] = useState(
    defaults.securityDeposit !== null ? String(defaults.securityDeposit) : "",
  );
  const [monthlyRentCredit, setMonthlyRentCredit] = useState(
    defaults.monthlyRentCredit !== null && defaults.monthlyRentCredit > 0 ? String(defaults.monthlyRentCredit) : "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate) {
      setError("A lease start date is required.");
      return;
    }
    if (endDate && endDate <= startDate) {
      setError("Lease end date must be after the start date.");
      return;
    }
    const rent = Number(rentAmount);
    if (!rentAmount || !Number.isFinite(rent) || rent <= 0) {
      setError("A valid rent amount is required.");
      return;
    }
    if (!file) {
      setError("The new signed lease document is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const form = new FormData();
      form.append("startDate", startDate);
      if (endDate) form.append("endDate", endDate);
      form.append("rentAmount", rentAmount);
      if (securityDeposit) form.append("securityDeposit", securityDeposit);
      if (monthlyRentCredit) form.append("monthlyRentCredit", monthlyRentCredit);
      form.append("leaseFile", file);
      const res = await fetch(`/api/leases/${leaseId}/renew`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not renew the lease.");
      toast.success(`Lease for Unit ${unitNumber} renewed.`, { title: "Lease" });
      onRenewed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not renew the lease.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Renew lease · Unit ${unitNumber}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Start a new lease term with the same tenants and attach the new signed lease.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">
            Start date
            <input
              type="date"
              required
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">
            End date <span className="font-normal text-gray-400">(optional)</span>
            <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">
            Monthly rent
            <input
              type="number"
              min="1"
              step="50"
              required
              className={inputClass}
              value={rentAmount}
              onChange={(e) => setRentAmount(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">
            Security deposit <span className="font-normal text-gray-400">(optional)</span>
            <input
              type="number"
              min="0"
              step="50"
              className={inputClass}
              value={securityDeposit}
              onChange={(e) => setSecurityDeposit(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700 sm:col-span-2">
            Monthly rent credit <span className="font-normal text-gray-400">(optional)</span>
            <input
              type="number"
              min="0"
              step="10"
              className={inputClass}
              value={monthlyRentCredit}
              onChange={(e) => setMonthlyRentCredit(e.target.value)}
            />
          </label>
        </div>

        <LeaseFilePicker file={file} onSelect={setFile} placeholder="Click to upload the new signed lease" />

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          The current lease will be marked ended. Its pending payments are kept, and a new monthly
          payment schedule is created for the new term.
        </div>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !file || !startDate || !rentAmount}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
          >
            {saving ? "Renewing…" : "Renew lease"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
