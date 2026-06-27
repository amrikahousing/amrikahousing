"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ToastProvider";
import { DocxPreview } from "./DocxPreview";

type LeaseClause = {
  id: string;
  title: string;
  body: string | null;
  summary: string | null;
  riskLevel: string | null;
  explanation: string | null;
  source: string;
};

type LeaseTemplate = {
  id: string;
  name: string;
  fileName: string;
  contentType: string;
  isActive: boolean;
  createdAt: string;
  reviewData: unknown;
  clauseCount: number;
  clauses: LeaseClause[];
};

type LeaseUnit = {
  id: string;
  unitNumber: string;
  unitStatus: string;
  rentAmount: number | null;
  leaseStatus: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  tenantName: string | null;
  tenantEmail: string | null;
  signatureStatus: string | null;
  signatureSentAt: string | null;
  signatureCompletedAt: string | null;
};

type LeaseProperty = {
  id: string;
  name: string;
  state: string;
  address: string;
  leaseProfile: LeaseProfile;
  stateClauses: StateClause[];
  templates: LeaseTemplate[];
  units: LeaseUnit[];
};

type PropertyNameMismatchWarning = {
  expectedName: string;
  extractedName: string;
};

type LeaseProfile = {
  landlordName: string;
  landlordSignatory: string;
  propertyManagerName: string;
  propertyManagerEmail: string;
  propertyManagerPhone: string;
  includesElectricity: boolean;
  includesLaundry: boolean;
  hasPetFee: boolean;
  includesParking: boolean;
  includesInternet: boolean;
};

type StateClause = {
  id: string;
  area: string;
  note: string;
  risk: string;
};

type WorkflowTerms = {
  leaseType: "fixed" | "month-to-month" | "unknown";
  leaseTerm: string;
  leaseEndBehavior: "renew" | "terminate" | "";
  lateFeeGraceDays: string;
  lateFeeType: "flat" | "pct";
  lateFeeFlat: string;
  lateFeePct: string;
  earlyTerminationFee: string;
  earlyTerminationMonths: string;
  petFeeAmount: string;
  utilities: Record<string, "tenant" | "landlord" | "na">;
};

const ALL_UTILITIES: Array<{ id: string; label: string; icon: React.ReactNode }> = [
  { id: "electricity", label: "Electricity", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg> },
  { id: "heat", label: "Heat", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /><circle cx="12" cy="12" r="4" /></svg> },
  { id: "gas", label: "Gas", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 22a7 7 0 0 0 7-7c0-4-7-13-7-13S5 11 5 15a7 7 0 0 0 7 7z" /></svg> },
  { id: "water", label: "Water", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 2C6 8 4 12 4 15a8 8 0 0 0 16 0c0-3-2-7-8-13z" /></svg> },
  { id: "sewer", label: "Sewer / Septic", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M4 17h16M4 13h16M8 17v2M16 17v2M8 7V5a2 2 0 0 1 4 0v2m0 0h4v6H8V7h4z" /></svg> },
  { id: "trash", label: "Trash", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg> },
  { id: "internet", label: "Internet", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M5 12.5a10 10 0 0 1 14 0M2 8.8a15 15 0 0 1 20 0M8 16.3a5 5 0 0 1 8 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></svg> },
  { id: "cable", label: "Cable / Satellite", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="2" y="7" width="20" height="12" rx="2" /><path d="M8 7V5M16 7V5M12 19v2M8 21h8" /></svg> },
  { id: "phone", label: "Phone", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9z" /></svg> },
  { id: "laundry", label: "Laundry", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="2" y="2" width="20" height="20" rx="2" /><circle cx="12" cy="13" r="4" /><path d="M5 5h.01M8 5h.01" /></svg> },
  { id: "parking", label: "Parking", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 17V7h4a3 3 0 0 1 0 6H9" /></svg> },
  { id: "lawnCare", label: "Lawn Care", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M2 20h20M6 20V10c3-1 5 2 5 2s2-5 6-5c0 4-2 6-4 7v6" /></svg> },
  { id: "snowRemoval", label: "Snow Removal", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 2v20M4.9 7l14.2 10M19.1 7 4.9 17M2 12h20M4.9 17l14.2-10M19.1 17 4.9 7" /></svg> },
  { id: "hoa", label: "HOA / Condo Fee", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></svg> },
];

// Essential utilities (electricity, heat, gas, water, sewer, trash) and connectivity
// default to tenant-paid since that's the most common residential setup.
// Property services (laundry, parking, lawnCare, snowRemoval, hoa) default to N/A
// since they're often not applicable or landlord-handled in apartment buildings.
const PROPERTY_SERVICES = new Set(["laundry", "parking", "lawnCare", "snowRemoval", "hoa"]);
const defaultUtilities: Record<string, "tenant" | "landlord" | "na"> = Object.fromEntries(
  ALL_UTILITIES.map((u) => [u.id, PROPERTY_SERVICES.has(u.id) ? "na" : "tenant"])
);

const defaultWorkflowTerms: WorkflowTerms = {
  leaseType: "unknown",
  leaseTerm: "",
  leaseEndBehavior: "",
  lateFeeGraceDays: "",
  lateFeeType: "flat",
  lateFeeFlat: "",
  lateFeePct: "",
  earlyTerminationFee: "",
  earlyTerminationMonths: "",
  petFeeAmount: "",
  utilities: { ...defaultUtilities },
};

type LeaseReview = {
  extractedTerms?: {
    propertyAddress?: string;
    state?: string;
    landlordName?: string;
    landlordSignatory?: string;
    leaseType?: string;
    leaseTerm?: string;
    gracePeriodDays?: number;
    lateFeeFlat?: number;
    lateFeePct?: number;
    earlyTerminationFee?: number;
    earlyTerminationMonths?: number;
    petFeeAmount?: number;
  };
  extractionEvidence?: {
    landlordName?: {
      confidence?: "low" | "medium" | "high";
      evidence?: string;
    };
  };
  leaseProfileSuggestions?: {
    propertyManagerName?: string;
    propertyManagerEmail?: string;
    propertyManagerPhone?: string;
    includesElectricity?: "yes" | "no" | "unknown";
    includesHeat?: "yes" | "no" | "unknown";
    includesGas?: "yes" | "no" | "unknown";
    includesWater?: "yes" | "no" | "unknown";
    includesSewer?: "yes" | "no" | "unknown";
    includesTrash?: "yes" | "no" | "unknown";
    includesInternet?: "yes" | "no" | "unknown";
    includesCable?: "yes" | "no" | "unknown";
    includesPhone?: "yes" | "no" | "unknown";
    includesLaundry?: "yes" | "no" | "unknown";
    includesParking?: "yes" | "no" | "unknown";
    includesLawnCare?: "yes" | "no" | "unknown";
    includesSnowRemoval?: "yes" | "no" | "unknown";
    includesHoa?: "yes" | "no" | "unknown";
    hasPetFee?: "yes" | "no" | "unknown";
  };
  clauseSummaries?: Array<{
    title: string;
    summary: string;
    riskLevel: "low" | "medium" | "high";
    explanation: string;
  }>;
  missingConcepts?: Array<{ concept: string; importance: string; description: string }>;
  stateLawNotes?: Array<{ area: string; note: string; risk: "info" | "caution" | "warning" }>;
  readabilitySuggestions?: Array<{ section: string; issue: string; suggestion: string }>;
  overallRiskLevel?: "low" | "medium" | "high";
  executiveSummary?: string;
};

type PendingWorkflowUpload = {
  blobUrl: string;
  contentType: string;
  fileName: string;
  name: string;
  review: LeaseReview;
  previewFileBase64?: string | null;
  previewError?: string | null;
};

type CreationSection = {
  id: CreationSectionId;
  title: string;
  description: string;
  icon: string;
  complete: boolean;
};

type ClauseForm = {
  id: string | null;
  title: string;
  body: string;
  summary: string;
  riskLevel: string;
  explanation: string;
};

type WorkspaceMode = "create" | "builder" | "templates" | "status";
type CreationSectionId =
  | "start"
  | "specifics"
  | "terms"
  | "policies"
  | "clauses"
  | "tags"
  | "review";

type TagPaletteItem = {
  id: string;
  label: string;
  token: string;
  kind: "signature" | "autofill";
  role?: string;
};

type PlacedTag = TagPaletteItem & {
  placementId: string;
  x: number;
  y: number;
};

const emptyClause: ClauseForm = {
  id: null,
  title: "",
  body: "",
  summary: "",
  riskLevel: "",
  explanation: "",
};

const inputClass =
  "ui-input px-3 py-2 text-sm";

const defaultLeaseProfile: LeaseProfile = {
  landlordName: "",
  landlordSignatory: "",
  propertyManagerName: "",
  propertyManagerEmail: "",
  propertyManagerPhone: "",
  includesElectricity: false,
  includesLaundry: false,
  hasPetFee: false,
  includesParking: false,
  includesInternet: false,
};

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const shared = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "upload") return <svg {...shared}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></svg>;
  if (name === "spark") return <svg {...shared}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
  if (name === "arrow-left") return <svg {...shared}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>;
  if (name === "arrow-right") return <svg {...shared}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>;
  if (name === "file") return <svg {...shared}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M8 13h8M8 17h5" /></svg>;
  if (name === "edit") return <svg {...shared}><path d="m14.5 5.5 4 4" /><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" /></svg>;
  if (name === "check") return <svg {...shared}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === "plus") return <svg {...shared}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "home") return <svg {...shared}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></svg>;
  if (name === "columns") return <svg {...shared}><path d="M4 5h16v14H4z" /><path d="M9 5v14M15 5v14" /></svg>;
  if (name === "money") return <svg {...shared}><path d="M4 7h16v10H4z" /><path d="M8 12h.01M16 12h.01" /><circle cx="12" cy="12" r="2" /></svg>;
  if (name === "people") return <svg {...shared}><path d="M16 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M3.5 20a5.5 5.5 0 0 1 9-4.2M13.5 20a5 5 0 0 1 8 0" /></svg>;
  if (name === "shield") return <svg {...shared}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-5" /></svg>;
  if (name === "key") return <svg {...shared}><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M17 6l2 2M14.5 8.5l2 2" /></svg>;
  if (name === "list") return <svg {...shared}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></svg>;
  if (name === "refresh") return <svg {...shared}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>;
  if (name === "download") return <svg {...shared}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>;
  return <svg {...shared}><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></svg>;
}

function SectionHeader({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100">
          <Icon name={icon} className="h-5 w-5 text-slate-600" />
        </div>
        <span className="text-base font-bold text-slate-900">{title}</span>
      </div>
      {description && <p className="mt-1.5 pl-12 text-sm text-slate-600">{description}</p>}
    </div>
  );
}

function PillToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="ui-segmented inline-grid max-w-full grid-flow-col auto-cols-fr rounded-lg p-1"
      role="radiogroup"
    >
      {options.map((opt) => {
        const selected = value === opt.value;

        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={[
              "ui-segment min-w-0 rounded-md px-3 py-1.5 text-sm font-semibold leading-5 transition-all",
              selected
                ? "bg-[var(--green)] text-white shadow-sm"
                : "text-slate-600 hover:bg-white/80 hover:text-slate-900",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function statusClass(status: string | null) {
  if (status === "active" || status === "completed" || status === "occupied" || status === "low") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "pending_signature" || status === "creating" || status === "sent" || status === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "high") return "border-red-200 bg-red-50 text-red-700";
  if (status === "vacant") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "inactive" || !status) return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-slate-200 bg-white text-slate-700";
}

function normalizeLeaseText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getPropertyNameMismatchWarning(
  propertyName: string,
  extractedLeaseName: string,
): PropertyNameMismatchWarning | null {
  const expectedName = propertyName.trim();
  const extractedName = extractedLeaseName.trim();
  if (!expectedName || !extractedName) return null;
  return normalizeLeaseText(expectedName) === normalizeLeaseText(extractedName)
    ? null
    : { expectedName, extractedName };
}

const LEGAL_ENTITY_RE = /\b(llc|inc|corp|ltd|lp|llp|pllc|co\.?)\b/i;

function isProbablyPropertyOrAddress(value: string, property: LeaseProperty) {
  const candidate = normalizeLeaseText(value);
  if (!candidate) return true;
  // Legal entity names (LLC, Inc., Corp., etc.) are definitively landlord names — never discard them
  if (LEGAL_ENTITY_RE.test(value)) return false;
  const propertyName = normalizeLeaseText(property.name);
  const propertyAddress = normalizeLeaseText(property.address);
  return (
    candidate === propertyName ||
    candidate === propertyAddress ||
    (propertyName.length > 8 && candidate.includes(propertyName)) ||
    (propertyAddress.length > 12 && candidate.includes(propertyAddress))
  );
}

function applyProfileChoice(currentValue: boolean, extractedValue?: "yes" | "no" | "unknown") {
  if (extractedValue === "yes") return true;
  if (extractedValue === "no") return false;
  return currentValue;
}

function humanStatus(status: string | null) {
  return (status ?? "no lease").replace(/_/g, " ");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function clauseToForm(clause: LeaseClause): ClauseForm {
  return {
    id: clause.id,
    title: clause.title,
    body: clause.body ?? "",
    summary: clause.summary ?? "",
    riskLevel: clause.riskLevel ?? "",
    explanation: clause.explanation ?? "",
  };
}

function TemplateUploadCard({
  busy,
  onUploadClick,
}: {
  busy: boolean;
  onUploadClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onUploadClick}
      disabled={busy}
      className="group flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm transition-colors group-hover:text-emerald-700">
        <Icon name="upload" className="h-5 w-5" />
      </span>
      <span className="mt-3 text-sm font-semibold text-slate-900">
        {busy ? "Uploading and extracting..." : "Upload existing lease"}
      </span>
      <span className="mt-1 text-xs leading-5 text-slate-500">
        {busy ? "Reading terms, clauses, and reusable tags." : "PDF, DOCX, or RTF. Clauses are extracted and stored for reuse."}
      </span>
    </button>
  );
}

function TemplateList({
  templates,
  selectedTemplate,
  busy,
  canManageTemplates,
  onSelect,
  onSetActive,
}: {
  templates: LeaseTemplate[];
  selectedTemplate: LeaseTemplate | null;
  busy: string | null;
  canManageTemplates: boolean;
  onSelect: (templateId: string) => void;
  onSetActive: (templateId: string) => void;
}) {
  if (templates.length === 0) {
    return (
      <div className="ui-empty-state p-4 text-sm">
        No lease templates yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onSelect(template.id)}
          className={[
            "w-full rounded-lg border p-3 text-left transition-colors",
            selectedTemplate?.id === template.id
              ? "border-emerald-300 bg-emerald-50 shadow-sm"
              : "ui-card-interactive hover:bg-slate-50",
          ].join(" ")}
        >
          <div className="flex gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Icon name="file" className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{template.name}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">{template.fileName}</span>
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                {template.isActive ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Active</span>
                ) : null}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {template.clauseCount} clauses
                </span>
                {!template.isActive && canManageTemplates ? (
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      onSetActive(template.id);
                    }}
                    className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
                  >
                    {busy === template.id ? "Setting..." : "Set active"}
                  </span>
                ) : null}
              </span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function LeasePreview({
  property,
  template,
}: {
  property: LeaseProperty;
  template: LeaseTemplate | null;
}) {
  const previewClauses = template?.clauses.slice(0, 5) ?? [];
  const firstUnit = property.units.find((unit) => unit.leaseStatus) ?? property.units[0] ?? null;

  return (
    <section className="min-h-[680px] rounded-lg border border-slate-200 bg-slate-100 p-4">
      <div className="mx-auto max-w-2xl rounded-sm bg-white px-8 py-10 shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-200 pb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Residential lease template</p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {template?.name ?? "No template selected"}
          </h3>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Property</p>
              <p className="mt-1 font-medium text-slate-800">{property.name}</p>
              <p className="text-slate-500">{property.address}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lease sample</p>
              <p className="mt-1 font-medium text-slate-800">Unit {firstUnit?.unitNumber ?? "—"}</p>
              <p className="text-slate-500">{firstUnit?.tenantName ?? "Tenant name"}</p>
            </div>
          </div>
        </div>

        <div className="space-y-5 py-6">
          {previewClauses.length === 0 ? (
            <>
              <div className="h-4 w-2/3 rounded bg-slate-100" />
              <div className="h-3 w-full rounded bg-slate-100" />
              <div className="h-3 w-11/12 rounded bg-slate-100" />
              <div className="h-3 w-4/5 rounded bg-slate-100" />
              <div className="ui-empty-state mt-8 p-5 text-center text-sm">
                Upload or review a template to see extracted clauses here.
              </div>
            </>
          ) : (
            previewClauses.map((clause, index) => (
              <div key={clause.id}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h4 className="font-semibold text-slate-950">{clause.title}</h4>
                    <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm leading-6 text-slate-600">
                      {clause.body || clause.summary || "Clause content will appear after extraction."}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="grid gap-5 border-t border-slate-200 pt-6 text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold text-slate-900">Tenant signature</p>
            <div className="mt-6 border-t border-slate-300 pt-2 text-xs text-slate-500">Name / date</div>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Manager signature</p>
            <div className="mt-6 border-t border-slate-300 pt-2 text-xs text-slate-500">Name / date</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClauseWorkspace({
  clauses,
  canManageTemplates,
  selectedClauseId,
  onSelect,
  onAdd,
}: {
  clauses: LeaseClause[];
  canManageTemplates: boolean;
  selectedClauseId: string | null;
  onSelect: (clause: LeaseClause) => void;
  onAdd: () => void;
}) {
  return (
    <section className="ui-panel">
      <div className="ui-panel-section flex items-center justify-between px-4 py-3">
        <div>
          <h3 className="font-bold text-slate-900">Extracted clauses</h3>
          <p className="text-xs text-slate-500">Review and update reusable language.</p>
        </div>
        {canManageTemplates ? (
          <button
            type="button"
            onClick={onAdd}
            className="ui-btn ui-btn-secondary h-8 gap-1.5 px-3 text-xs"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            Add
          </button>
        ) : null}
      </div>
      <div className="max-h-[590px] space-y-2 overflow-y-auto p-3">
        {clauses.length === 0 ? (
          <div className="ui-empty-state p-5 text-center text-sm">
            No clauses extracted yet.
          </div>
        ) : (
          clauses.map((clause) => (
            <button
              key={clause.id}
              type="button"
              onClick={() => onSelect(clause)}
              className={[
                "w-full rounded-lg border p-3 text-left transition-colors",
                selectedClauseId === clause.id ? "border-emerald-300 bg-emerald-50" : "ui-panel-soft hover:bg-white",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{clause.title}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                    {clause.summary || clause.body || "No clause text yet."}
                  </span>
                </span>
                {clause.riskLevel ? (
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(clause.riskLevel)}`}>
                    {clause.riskLevel}
                  </span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function UnitStatusTable({ units }: { units: LeaseUnit[] }) {
  return (
    <section className="ui-panel overflow-hidden">
      <div className="ui-panel-section px-5 py-4">
        <h3 className="font-bold text-slate-900">Lease status by property/unit</h3>
        <p className="mt-1 text-sm text-slate-500">Track active leases, pending signatures, and vacant units.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Unit</th>
              <th className="px-5 py-3">Tenant</th>
              <th className="px-5 py-3">Lease</th>
              <th className="px-5 py-3">Term</th>
              <th className="px-5 py-3">E-sign</th>
              <th className="px-5 py-3 text-right">Rent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {units.map((unit) => (
              <tr key={unit.id} className="hover:bg-slate-50/70">
                <td className="px-5 py-4 font-semibold text-slate-900">Unit {unit.unitNumber}</td>
                <td className="px-5 py-4">
                  <p className="font-medium text-slate-800">{unit.tenantName ?? "No tenant"}</p>
                  <p className="text-xs text-slate-500">{unit.tenantEmail ?? "—"}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(unit.leaseStatus ?? unit.unitStatus)}`}>
                    {humanStatus(unit.leaseStatus ?? unit.unitStatus)}
                  </span>
                </td>
                <td className="px-5 py-4 text-slate-600">{formatDate(unit.leaseStart)} - {formatDate(unit.leaseEnd)}</td>
                <td className="px-5 py-4 text-slate-600">{humanStatus(unit.signatureStatus)}</td>
                <td className="px-5 py-4 text-right font-semibold text-slate-900">
                  {unit.rentAmount === null ? "—" : `$${unit.rentAmount.toLocaleString()}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


const tagPalette: TagPaletteItem[] = [
  { id: "tenant-signature", label: "Tenant signature", token: "{{Sign;type=signature;role=Tenant 1}}", kind: "signature", role: "Tenant 1" },
  { id: "tenant-initials", label: "Tenant initials", token: "{{Sign;type=initials;role=Tenant 1}}", kind: "signature", role: "Tenant 1" },
  { id: "tenant-date", label: "Tenant date", token: "{{Sign;type=date_signed;role=Tenant 1}}", kind: "signature", role: "Tenant 1" },
  { id: "manager-signature", label: "Manager signature", token: "{{Sign;type=signature;role=Manager}}", kind: "signature", role: "Manager" },
  { id: "manager-date", label: "Manager date", token: "{{Sign;type=date_signed;role=Manager}}", kind: "signature", role: "Manager" },
  { id: "property-name", label: "Property name", token: "{{property_name}}", kind: "autofill" },
  { id: "property-address", label: "Property address", token: "{{property_address}}", kind: "autofill" },
  { id: "landlord", label: "Landlord / org", token: "{{organization_name}}", kind: "autofill" },
  { id: "manager-name", label: "Manager name", token: "{{property_manager_name}}", kind: "autofill" },
  { id: "tenant-name", label: "Tenant name", token: "{{tenant_name}}", kind: "autofill" },
  { id: "unit-number", label: "Unit number", token: "{{unit_number}}", kind: "autofill" },
];

// ── Tag field icons ──────────────────────────────────────────────────────────
const TAG_ICONS: Record<string, React.ReactNode> = {
  signature: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m14.5 5.5 4 4" /><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" /></svg>,
  initials: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 12h8M12 8v8" /></svg>,
  date: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  autofill: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" /></svg>,
};

function tagIcon(tag: TagPaletteItem) {
  if (tag.token.includes("initials")) return TAG_ICONS.initials;
  if (tag.token.includes("date_signed")) return TAG_ICONS.date;
  if (tag.kind === "signature") return TAG_ICONS.signature;
  return TAG_ICONS.autofill;
}

const tagGroups = [
  { label: "Signature fields", items: tagPalette.filter((t) => t.kind === "signature") },
  { label: "Auto-fill fields", items: tagPalette.filter((t) => t.kind === "autofill") },
];

function placedTagStyle(kind: TagPaletteItem["kind"]) {
  return kind === "signature"
    ? "border-blue-300 bg-blue-50/90 text-blue-700 shadow-blue-100"
    : "border-emerald-300 bg-emerald-50/90 text-emerald-700 shadow-emerald-100";
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));
}

function ZoomControls({
  zoom,
  onZoomChange,
  className = "",
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-0.5 rounded-lg bg-white p-0.5 ring-1 ring-slate-200 ${className}`}>
      <button
        type="button"
        onClick={() => onZoomChange(clampZoom(zoom - ZOOM_STEP))}
        disabled={zoom <= ZOOM_MIN}
        aria-label="Zoom out"
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M5 12h14" /></svg>
      </button>
      <button
        type="button"
        onClick={() => onZoomChange(1)}
        aria-label="Reset zoom"
        className="min-w-[3rem] rounded-md px-1.5 py-1 text-center text-xs font-semibold tabular-nums text-slate-600 transition-colors hover:bg-slate-100"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={() => onZoomChange(clampZoom(zoom + ZOOM_STEP))}
        disabled={zoom >= ZOOM_MAX}
        aria-label="Zoom in"
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
}

const chevronLeftIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15 18l-6-6 6-6" /></svg>;
const chevronRightIcon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 18l6-6-6-6" /></svg>;

// Thin vertical rail shown when a side panel is collapsed. Clicking anywhere expands it
// again; the freed width flows to the flex-1 document canvas between the two rails.
function CollapsedPanelRail({ label, side, onExpand }: { label: string; side: "left" | "right"; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${label} panel`}
      title={`Expand ${label}`}
      className={`group flex w-9 flex-shrink-0 flex-col items-center gap-2 bg-white py-3 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 ${side === "left" ? "border-r" : "border-l"} border-slate-100`}
    >
      <span className="flex h-6 w-6 items-center justify-center">{side === "left" ? chevronRightIcon : chevronLeftIcon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">{label}</span>
    </button>
  );
}

function DragDropTagPreview({ base64, loading }: { base64: string | null; loading?: boolean }) {
  const [placedTags, setPlacedTags] = useState<PlacedTag[]>([
    { ...tagPalette[1], placementId: "seed-tenant-initials", x: 63, y: 28 },
    { ...tagPalette[3], placementId: "seed-manager-signature", x: 56, y: 78 },
  ]);
  const [draggedTagId, setDraggedTagId] = useState<string | null>(null);
  const [selectedPlaced, setSelectedPlaced] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fieldsCollapsed, setFieldsCollapsed] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const paletteId = event.dataTransfer.getData("application/x-lease-tag");
    const movingId = event.dataTransfer.getData("application/x-placed-tag");
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(2, Math.min(85, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(1, Math.min(95, ((event.clientY - rect.top) / rect.height) * 100));
    if (movingId) {
      setPlacedTags((tags) => tags.map((t) => t.placementId === movingId ? { ...t, x, y } : t));
      setDraggedTagId(null);
      return;
    }
    const tag = tagPalette.find((t) => t.id === paletteId);
    if (!tag) return;
    const newId = `${tag.id}-${Date.now()}`;
    setPlacedTags((tags) => [...tags, { ...tag, placementId: newId, x, y }]);
    setSelectedPlaced(newId);
  }

  const selected = placedTags.find((t) => t.placementId === selectedPlaced) ?? null;

  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" style={{ height: 620 }}>

      {/* ── Left sidebar ─────────────────────────────────────────── */}
      {fieldsCollapsed ? (
        <CollapsedPanelRail label="Fields" side="left" onExpand={() => setFieldsCollapsed(false)} />
      ) : (
      <div className="flex w-48 flex-shrink-0 flex-col border-r border-slate-100 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Fields</p>
          <button
            type="button"
            onClick={() => setFieldsCollapsed(true)}
            aria-label="Collapse Fields panel"
            title="Collapse"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            {chevronLeftIcon}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          {tagGroups.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{group.label}</p>
              {group.items.map((tag) => (
                <div
                  key={tag.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/x-lease-tag", tag.id)}
                  className="flex cursor-grab items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-50 active:cursor-grabbing"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                    {tagIcon(tag)}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{tag.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ── Document canvas ──────────────────────────────────────── */}
      <div className="relative flex flex-1 flex-col overflow-hidden bg-[#f3f4f6]">
        {/* toolbar strip */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
          <span className="text-xs text-slate-500">Drag a field onto the page · click a placed field to select</span>
          <div className="flex items-center gap-2">
            <ZoomControls zoom={zoom} onZoomChange={setZoom} />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{placedTags.length} field{placedTags.length !== 1 ? "s" : ""} placed</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-8 py-6">
          {/* Paper page */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => setSelectedPlaced(null)}
            style={zoom !== 1 ? { zoom } : undefined}
            className={[
              "relative mx-auto min-h-[500px] rounded-sm bg-white shadow-[0_2px_16px_rgba(0,0,0,0.12)]",
              // Shrink the paper to the rendered document's real page width so it
              // looks like an actual page; fall back to full width for the empty state.
              base64 ? "w-fit" : "w-full",
            ].join(" ")}
          >
            {loading ? (
              <div className="flex min-h-[500px] flex-col items-center justify-center gap-3 text-slate-400">
                <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                <span className="text-sm">Generating document preview…</span>
              </div>
            ) : base64 ? (
              <DocxPreview
                base64={base64}
                className="lease-preview pointer-events-none select-none"
              />
            ) : (
              <div className="flex min-h-[500px] flex-col items-center justify-center gap-2 px-10 text-center text-slate-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-slate-300">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M8 13h8M8 17h5" />
                </svg>
                <p className="text-sm">Document preview not available</p>
                <p className="text-xs text-slate-300">Upload a lease in the Start step to see the full document</p>
              </div>
            )}

            {/* Placed tags */}
            {placedTags.map((tag) => {
              const isSelected = tag.placementId === selectedPlaced;
              return (
                <button
                  key={tag.placementId}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setDraggedTagId(tag.placementId);
                    e.dataTransfer.setData("application/x-placed-tag", tag.placementId);
                  }}
                  onClick={(e) => { e.stopPropagation(); setSelectedPlaced(isSelected ? null : tag.placementId); }}
                  className={[
                    "absolute cursor-move rounded border px-2 py-0.5 text-[11px] font-semibold shadow-sm transition-all",
                    placedTagStyle(tag.kind),
                    isSelected ? "ring-2 ring-sky-400 ring-offset-1 scale-105" : "",
                    draggedTagId === tag.placementId ? "opacity-30" : "",
                  ].join(" ")}
                  style={{ left: `${tag.x}%`, top: `${tag.y}%` }}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right detail panel ───────────────────────────────────── */}
      {detailsCollapsed ? (
        <CollapsedPanelRail label="Details" side="right" onExpand={() => setDetailsCollapsed(false)} />
      ) : (
      <div className="flex w-44 flex-shrink-0 flex-col border-l border-slate-100 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Details</p>
          <button
            type="button"
            onClick={() => setDetailsCollapsed(true)}
            aria-label="Collapse Details panel"
            title="Collapse"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            {chevronRightIcon}
          </button>
        </div>
        {selected ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                {tagIcon(selected)}
              </span>
              <span className="text-sm font-semibold text-slate-800">{selected.label}</span>
            </div>
            {selected.role && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Signer</p>
                <p className="text-xs font-medium text-slate-700">{selected.role}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Token</p>
              <p className="break-all font-mono text-[10px] text-slate-400 leading-4">{selected.token}</p>
            </div>
            <button
              type="button"
              onClick={() => { setPlacedTags((ts) => ts.filter((t) => t.placementId !== selected.placementId)); setSelectedPlaced(null); }}
              className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              Remove field
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-slate-300">
              <path d="m14.5 5.5 4 4" /><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
            </svg>
            <p className="text-xs font-semibold text-slate-500">Nothing selected</p>
            <p className="text-[11px] leading-4 text-slate-400">Select a field to make changes</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function LeaseCreationWorkflow({
  property,
  properties,
  selectedPropertyId,
  selectedTemplate,
  canManageTemplates,
  busy,
  profile,
  terms,
  pendingUpload,
  acceptedSuggestions,
  onSelectProperty,
  onSelectTemplate,
  onUploadClick,
  onProfileChange,
  onSaveProfile,
  onTermsChange,
  onAcceptSuggestions,
  onGeneratePreview,
  onGeneratePreviewSilent,
  onSaveTemplate,
  advanceToken,
  workflowStarted,
  onWorkflowStarted,
}: {
  property: LeaseProperty;
  properties: LeaseProperty[];
  selectedPropertyId: string;
  selectedTemplate: LeaseTemplate | null;
  canManageTemplates: boolean;
  busy: string | null;
  profile: LeaseProfile;
  terms: WorkflowTerms;
  pendingUpload: PendingWorkflowUpload | null;
  acceptedSuggestions: boolean;
  onSelectProperty: (propertyId: string) => void;
  onSelectTemplate: (templateId: string) => void;
  onUploadClick: () => void;
  onProfileChange: (profile: LeaseProfile) => void;
  onSaveProfile: () => void;
  onTermsChange: (terms: WorkflowTerms) => void;
  onAcceptSuggestions: (accepted: boolean) => void;
  onGeneratePreview: () => void;
  onGeneratePreviewSilent: () => void;
  onSaveTemplate: () => void;
  advanceToken: number;
  workflowStarted: boolean;
  onWorkflowStarted: (started: boolean) => void;
}) {
  // A fresh upload carries its analysis on `pendingUpload.review`. When updating an
  // existing template there is no upload, so fall back to the template's stored AI
  // review so clauses, missing provisions, state-law notes, and readability still show.
  const selectedTemplateReview = selectedTemplate?.reviewData as LeaseReview | null | undefined;
  const review = pendingUpload?.review ?? selectedTemplateReview;
  const reviewClauses = Array.isArray(review?.clauseSummaries) ? review.clauseSummaries : [];
  const stateNotes = Array.isArray(review?.stateLawNotes) ? review.stateLawNotes : [];
  const [activeSection, setActiveSection] = useState<CreationSectionId>("start");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [startPanel, setStartPanel] = useState<"choose" | "existing">("choose");
  const [startChoice, setStartChoice] = useState<"upload" | "existing" | null>(null);
  const [expandedClauses, setExpandedClauses] = useState<Set<string>>(new Set());
  const [selectedFixes, setSelectedFixes] = useState<Set<string>>(new Set());
  const [clauseTab, setClauseTab] = useState<"clauses" | "missing" | "statelaw" | "readability">("clauses");
  const [previewZoom, setPreviewZoom] = useState(1);
  const lastAdvanceToken = useRef(advanceToken);
  const selectedTemplateLeaseName = selectedTemplateReview?.extractedTerms?.landlordName?.trim() || selectedTemplate?.name || "";
  const selectedTemplateNeedsValidation = startChoice === "existing" && Boolean(selectedTemplate);
  const validationLeaseName = pendingUpload ? profile.landlordName : selectedTemplateNeedsValidation ? selectedTemplateLeaseName : "";
  const hasTemplateValidationSource = Boolean(pendingUpload || selectedTemplateNeedsValidation);
  const propertyNameMismatchWarning = hasTemplateValidationSource
    ? getPropertyNameMismatchWarning(property.name, validationLeaseName)
    : null;
  const propertyNameMatchesTemplate =
    Boolean(hasTemplateValidationSource && validationLeaseName.trim()) &&
    normalizeLeaseText(validationLeaseName) === normalizeLeaseText(property.name);
  const propertyConfirmed = Boolean(profile.landlordName || profile.landlordSignatory || profile.propertyManagerName);
  const policyConfigured =
    profile.hasPetFee ||
    profile.includesElectricity ||
    profile.includesLaundry ||
    profile.includesInternet ||
    profile.includesParking;
  const sectionOrder: CreationSectionId[] = ["start", "specifics", "terms", "policies", "clauses", "tags", "review"];
  const activeSectionPosition = sectionOrder.indexOf(activeSection);
  const sections: CreationSection[] = [
    {
      id: "start",
      title: "Start",
      description: "Create a reusable lease template for the selected property.",
      icon: "spark",
      complete: workflowStarted,
    },
    {
      id: "specifics",
      title: "Lease Parties",
      description: "Verify the property, landlord, and manager. Unit and tenant values are ignored.",
      icon: "people",
      complete: propertyConfirmed,
    },
    {
      id: "terms",
      title: "Lease Terms & Fees",
      description: "Confirm extracted defaults for lease duration, late fees, and termination.",
      icon: "money",
      complete: Boolean(terms.leaseType !== "unknown" || terms.leaseTerm),
    },
    {
      id: "policies",
      title: "Utilities & Services",
      description: "Toggle on = tenant pays · Toggle off = included by landlord.",
      icon: "shield",
      complete: policyConfigured || acceptedSuggestions,
    },
    {
      id: "clauses",
      title: "Clause Review",
      description: "Review extracted clauses and state-law notes, then accept suggested improvements.",
      icon: "list",
      complete: acceptedSuggestions,
    },
    {
      id: "tags",
      title: "Tags",
      description: "Place reusable property and signature tags in the document before saving.",
      icon: "columns",
      complete: workflowStarted && activeSectionPosition > sectionOrder.indexOf("tags"),
    },
    {
      id: "review",
      title: "Review & Save Template",
      description: "Confirm the setup and save this as a reusable lease template.",
      icon: "check",
      complete: false,
    },
  ];
  const progress = Math.round((sections.filter((section) => section.complete).length / sections.length) * 100);
  const activeIndex = sections.findIndex((section) => section.id === activeSection);
  const nextSection = sections[activeIndex + 1] ?? null;

  function goToNextSection() {
    const next = sections[Math.min(activeIndex + 1, sections.length - 1)];
    if (next) {
      setActiveSection(next.id);
      // Fire preview generation in the background so the review step loads instantly
      if (next.id !== "review") onGeneratePreviewSilent();
    }
  }

  function goToPrevSection() {
    const prev = sections[Math.max(activeIndex - 1, 0)];
    if (prev) setActiveSection(prev.id);
  }

  const prevSection = sections[activeIndex - 1] ?? null;

  function BackButton() {
    if (!prevSection) return null;
    return (
      <button
        type="button"
        onClick={goToPrevSection}
        className="ui-btn h-10 px-4 text-sm"
      >
        ← Back
      </button>
    );
  }

  useEffect(() => {
    if (advanceToken === lastAdvanceToken.current) return;
    lastAdvanceToken.current = advanceToken;
    goToNextSection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceToken]);

  // Auto-generate preview when user reaches the Tags step so the document is visible
  useEffect(() => {
    if (activeSection === "tags" && pendingUpload && !pendingUpload.previewFileBase64 && busy !== "workflow-preview") {
      onGeneratePreview();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  function renderActiveSection() {
    if (activeSection === "start") {
      const workflowUploading = busy === "workflow-upload";

      if (startPanel === "existing") {
        const templatesForSelectedProperty = property.templates;

        return (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setStartPanel("choose")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              <Icon name="arrow-left" className="h-3.5 w-3.5" />
              Change start option
            </button>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Saved templates for selected property</p>
              <p className="mt-1 text-xs text-slate-500">{property.name}</p>
            </div>

            <div className="space-y-2">
              {templatesForSelectedProperty.length === 0 ? (
                <div className="ui-empty-state p-5 text-sm">
                  No saved templates for this property yet. Upload a lease to create the first one.
                </div>
              ) : (
	                templatesForSelectedProperty.map((template) => {
	                  return (
	                    <div
                      key={template.id}
                      className={[
                        "group relative flex w-full items-start gap-4 p-4 text-left",
                        selectedTemplate?.id === template.id ? "ui-card-selected" : "",
                        "ui-card-interactive",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        aria-label={`Select template ${template.name}`}
                        onClick={() => {
                          onSelectTemplate(template.id);
                          setStartPanel("choose");
                        }}
                        className="absolute inset-0 z-0 rounded-[inherit]"
                      />
                      <span className="pointer-events-none relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700">
                        <Icon name="file" className="h-5 w-5" />
                      </span>
                      <span className="pointer-events-none relative z-10 min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">{template.name}</span>
                          {template.isActive ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Active</span>
                          ) : null}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {template.fileName} · {template.clauseCount} clauses · {formatDate(template.createdAt)}
                        </span>
                      </span>
                      {template.isActive ? (
                        <a
                          href={`/api/properties/${property.id}/lease-templates/${template.id}/file?download=1`}
                          download={template.fileName}
                          className="relative z-10 mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          <Icon name="download" className="h-4 w-4" />
                          Download
                        </a>
                      ) : (
                        <Icon name="arrow-right" className="pointer-events-none relative z-10 mt-2 h-4 w-4 text-slate-300 group-hover:text-emerald-600" />
                      )}
                    </div>
                  );
	                })
	              )}
	            </div>
	          </div>
	        );
	      }

      return (
	        <div className="space-y-4">
          {/* Property */}
	          <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
	            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
	              <Icon name="home" className="h-5 w-5" />
	            </span>
	            <div className="min-w-0 flex-1">
	              <p className="text-sm font-semibold text-slate-900">Property</p>
	              <p className="mb-2 text-xs text-slate-500">Which property is this lease template for?</p>
	              <select value={selectedPropertyId} onChange={(e) => onSelectProperty(e.target.value)} className={`${inputClass} h-9 text-sm`}>
	                {properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
	              </select>
            </div>
          </div>

          {/* Question */}
          <div className="pt-1">
            <p className="text-base font-semibold text-slate-800">What would you like to do?</p>
            <p className="mt-0.5 text-sm text-slate-500">Update an existing template, or create a new one from a lease document.</p>
          </div>

          <div className="grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            {/* Upload */}
            <button
              type="button"
              onClick={() => { setStartChoice("upload"); onUploadClick(); }}
              disabled={!canManageTemplates}
              className={[
                "group flex min-h-[150px] w-full flex-col justify-between rounded-xl border p-4 text-left transition-colors disabled:opacity-60",
                startChoice === "upload"
                  ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
                  : "border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40",
              ].join(" ")}
            >
              <span className="flex items-start justify-between gap-3">
                <span className={["flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors", startChoice === "upload" ? "bg-amber-100 text-amber-700" : "bg-amber-50 text-amber-700 group-hover:bg-amber-100"].join(" ")}>
                  <Icon name="upload" className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium text-amber-600">PDF · DOCX</span>
              </span>
              <span className="mt-4 block">
                <span className="block text-base font-semibold text-slate-900">Upload existing lease</span>
                <span className="mt-1 block text-sm leading-6 text-slate-500">Create a new reusable template from a lease document.</span>
              </span>
            </button>

            <div className="flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400 md:flex-col">
              <span className="h-px flex-1 bg-slate-200 md:h-full md:w-px" />
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Or</span>
              <span className="h-px flex-1 bg-slate-200 md:h-full md:w-px" />
            </div>

            {/* Update existing */}
            <button
              type="button"
              onClick={() => { setStartChoice("existing"); setStartPanel("existing"); }}
              className={[
                "group flex min-h-[150px] w-full flex-col justify-between rounded-xl border p-4 text-left transition-colors",
                startChoice === "existing"
                  ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200"
                  : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40",
              ].join(" ")}
            >
              <span className="flex items-start justify-between gap-3">
                <span className={["flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors", startChoice === "existing" ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100"].join(" ")}>
                  <Icon name="file" className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium text-emerald-600">{property.templates.length} saved</span>
              </span>
              <span className="mt-4 block">
                <span className="block text-base font-semibold text-slate-900">Update existing template</span>
                <span className="mt-1 block text-sm leading-6 text-slate-500">Start from a saved template and make changes.</span>
              </span>
            </button>
          </div>

          {propertyNameMismatchWarning ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <p className="font-semibold">Review the property name before continuing.</p>
              <div className="mt-3 grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Selected property</p>
                  <p className="mt-1 font-semibold text-slate-900">{propertyNameMismatchWarning.expectedName}</p>
                </div>
                <div className="flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-wide text-amber-600 md:flex-col">
                  <span className="h-px flex-1 bg-amber-200 md:h-full md:w-px" />
                  <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1">Or</span>
                  <span className="h-px flex-1 bg-amber-200 md:h-full md:w-px" />
                </div>
                <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Lease name</p>
                  <p className="mt-1 font-semibold text-slate-900">{propertyNameMismatchWarning.extractedName}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-amber-700">Confirm this is the right property before continuing.</p>
            </div>
          ) : null}

          {propertyNameMatchesTemplate ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Icon name="check" className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">Property name matches the template.</span>
                <span className="block truncate text-xs text-emerald-700">{property.name}</span>
              </span>
            </div>
          ) : null}

          {workflowUploading && (
            <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-live="polite" aria-busy="true">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-r-transparent" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">Scanning lease with AI</p>
                <p className="text-xs text-slate-500">Extracting terms, clauses, and tags. Keep this page open.</p>
              </div>
            </div>
          )}
	          {pendingUpload || selectedTemplateNeedsValidation ? (
	            <div className="flex items-center gap-3">
	              <button
	                type="button"
	                onClick={() => {
	                  onWorkflowStarted(true);
	                  goToNextSection();
	                }}
	                className="ui-btn ui-btn-primary h-10 px-5 text-sm"
	              >
	                {nextSection ? `Next: ${nextSection.title} →` : "Next →"}
	              </button>
	            </div>
	          ) : null}
        </div>
      );
    }

    if (activeSection === "specifics") {
      return (
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Who are the landlord and manager on this lease?</p>
            <label className="space-y-1 text-xs font-semibold text-slate-600">
              Landlord Name
              <input className={inputClass} value={profile.landlordSignatory}
                onChange={(e) => onProfileChange({ ...profile, landlordSignatory: e.target.value })}
                placeholder="Individual who signs on behalf of the entity" />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">
              Property Manager
              <input className={inputClass} value={profile.propertyManagerName}
                onChange={(e) => onProfileChange({ ...profile, propertyManagerName: e.target.value })}
                placeholder="Manager or signing contact" />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">
              Property Manager Email
              <input className={inputClass} type="email" value={profile.propertyManagerEmail ?? ""}
                onChange={(e) => onProfileChange({ ...profile, propertyManagerEmail: e.target.value })}
                placeholder="Extracted from lease" />
            </label>
            <label className="space-y-1 text-xs font-semibold text-slate-600">
              Property Manager Phone
              <input className={inputClass} type="tel" value={profile.propertyManagerPhone ?? ""}
                onChange={(e) => onProfileChange({ ...profile, propertyManagerPhone: e.target.value })}
                placeholder="Extracted from lease" />
            </label>
            {(() => {
              const dbName = property.leaseProfile.propertyManagerName?.trim();
              const extractedName = profile.propertyManagerName?.trim();
              const nameMismatch = dbName && extractedName && dbName.toLowerCase() !== extractedName.toLowerCase();
              const dbEmail = property.leaseProfile.propertyManagerEmail?.trim();
              const extractedEmail = profile.propertyManagerEmail?.trim();
              const emailMismatch = dbEmail && extractedEmail && dbEmail.toLowerCase() !== extractedEmail.toLowerCase();
              const dbPhone = property.leaseProfile.propertyManagerPhone?.trim();
              const extractedPhone = profile.propertyManagerPhone?.trim();
              const normalizePhone = (p: string) => p.replace(/\D/g, "");
              const phoneMismatch = dbPhone && extractedPhone && normalizePhone(dbPhone) !== normalizePhone(extractedPhone);
              if (!nameMismatch && !emailMismatch && !phoneMismatch) return null;
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1.5">
                  <p className="font-semibold">Some contact details differ from your saved record.</p>
                  {nameMismatch && <p className="text-amber-700">Name — Saved: <span className="font-medium">{dbName}</span> · Lease: <span className="font-medium">{extractedName}</span></p>}
                  {emailMismatch && <p className="text-amber-700">Email — Saved: <span className="font-medium">{dbEmail}</span> · Lease: <span className="font-medium">{extractedEmail}</span></p>}
                  {phoneMismatch && <p className="text-amber-700">Phone — Saved: <span className="font-medium">{dbPhone}</span> · Lease: <span className="font-medium">{extractedPhone}</span></p>}
                  <p>Update the fields above if the lease is correct, or leave as-is to keep the saved values.</p>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-3">
            <BackButton />
            <button
              type="button"
              onClick={() => { onSaveProfile(); goToNextSection(); }}
              disabled={!canManageTemplates}
              className="ui-btn ui-btn-primary h-10 px-4 text-sm"
            >
              {nextSection ? `Next: ${nextSection.title} →` : "Next →"}
            </button>
          </div>
        </div>
      );
    }

    if (activeSection === "terms") {
      const numInput = inputClass + " text-right";
      return (
        <div className="space-y-6">
          <div>
            <SectionHeader icon="file" title="Lease Term" description="What is the term type for this lease?" />
            <div className="flex items-center gap-3 pl-12">
              <PillToggle
                options={[
                  { value: "month-to-month", label: "Month-to-Month" },
                  { value: "fixed", label: "Fixed Term" },
                ]}
                value={terms.leaseType === "unknown" ? "fixed" : terms.leaseType}
                onChange={(v) => onTermsChange({ ...terms, leaseType: v })}
              />
              {terms.leaseType === "fixed" && (
                <div className="ui-input-frame inline-flex items-center overflow-hidden">
                  <input type="number" min="1" max="120"
                    className="w-12 bg-transparent py-2 pl-3 pr-1 text-right text-sm font-semibold text-slate-900 outline-none"
                    value={terms.leaseTerm}
                    onChange={(e) => onTermsChange({ ...terms, leaseTerm: e.target.value })}
                    placeholder="12" />
                  <span className="pr-3 text-sm text-slate-400">mo</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <SectionHeader icon="refresh" title="When the Lease Ends" description="What happens when the lease term expires?" />
            <div className="pl-12">
              {terms.leaseType === "month-to-month" ? (
                <p className="text-sm text-slate-400 italic">Not applicable for month-to-month leases</p>
              ) : (
                <PillToggle
                  options={[
                    { value: "renew", label: "Auto-renew monthly" },
                    { value: "terminate", label: "Terminate on end date" },
                  ]}
                  value={terms.leaseEndBehavior as "renew" | "terminate"}
                  onChange={(v) => onTermsChange({ ...terms, leaseEndBehavior: v })}
                />
              )}
            </div>
          </div>
          <div>
            <SectionHeader icon="money" title="Late Fee" description="What late fee applies after the grace period?" />
            <div className="space-y-3 pl-12">
              <div className="flex items-center gap-3">
                <PillToggle
                  options={[
                    { value: "flat" as const, label: "Flat ($)" },
                    { value: "pct" as const, label: "Percentage (%)" },
                  ]}
                  value={terms.lateFeeType}
                  onChange={(v) => onTermsChange({ ...terms, lateFeeType: v })}
                />
                <div className="ui-input-frame inline-flex items-center overflow-hidden">
                  {terms.lateFeeType === "flat" ? (
                    <>
                      <span className="pl-3 text-sm text-slate-400">$</span>
                      <input type="number" min="0"
                        className="w-16 bg-transparent py-2 pl-1 pr-3 text-right text-sm font-semibold text-slate-900 outline-none"
                        value={terms.lateFeeFlat}
                        onChange={(e) => onTermsChange({ ...terms, lateFeeFlat: e.target.value })}
                        placeholder="0" />
                    </>
                  ) : (
                    <>
                      <input type="number" min="0"
                        className="w-16 bg-transparent py-2 pl-3 pr-1 text-right text-sm font-semibold text-slate-900 outline-none"
                        value={terms.lateFeePct}
                        onChange={(e) => onTermsChange({ ...terms, lateFeePct: e.target.value })}
                        placeholder="0" />
                      <span className="pr-3 text-sm text-slate-400">%</span>
                    </>
                  )}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center gap-3">
                  <p className="text-xs font-semibold text-slate-500">Grace period before late fee applies</p>
                  <div className="ui-input-frame inline-flex items-center overflow-hidden">
                    <input type="number" min="0"
                      className="w-12 bg-transparent py-2 pl-3 pr-1 text-right text-sm font-semibold text-slate-900 outline-none"
                      value={terms.lateFeeGraceDays}
                      onChange={(e) => onTermsChange({ ...terms, lateFeeGraceDays: e.target.value })}
                      placeholder="0" />
                    <span className="pr-3 text-sm text-slate-400">days</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <SectionHeader icon="key" title="Early Termination" description="How many months of rent is the early termination fee?" />
            <div className="flex items-center gap-3 pl-12">
              <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/15">
                <input type="number" min="0"
                  className="w-12 bg-transparent py-2 pl-3 pr-1 text-right text-sm font-semibold text-slate-900 outline-none"
                  value={terms.earlyTerminationMonths}
                  onChange={(e) => onTermsChange({ ...terms, earlyTerminationMonths: e.target.value })}
                  placeholder="0" />
                <span className="pr-3 text-sm text-slate-400">mo</span>
              </div>
            </div>
          </div>
          <div>
            <SectionHeader icon="shield" title="Pet Fee" description="Is there a monthly or one-time fee for pets?" />
            <div className="pl-12">
              <label className="block max-w-[180px] space-y-1 text-xs font-semibold text-slate-600">
                Amount ($)
                <input type="number" min="0" className={numInput} value={terms.petFeeAmount}
                  onChange={(e) => onTermsChange({ ...terms, petFeeAmount: e.target.value })} placeholder="0" />
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <BackButton />
            <button
              type="button"
              onClick={goToNextSection}
              disabled={!canManageTemplates}
              className="ui-btn ui-btn-primary h-10 px-4 text-sm"
            >
              {nextSection ? `Next: ${nextSection.title} →` : "Next →"}
            </button>
          </div>
        </div>
      );
    }

    if (activeSection === "policies") {
      const isTenantPays = (id: string) => (terms.utilities[id] ?? "tenant") === "tenant";
      const toggleUtility = (id: string) =>
        onTermsChange({ ...terms, utilities: { ...terms.utilities, [id]: isTenantPays(id) ? "landlord" : "tenant" } });

      const utilityById = Object.fromEntries(ALL_UTILITIES.map((u) => [u.id, u]));
      const utilityGroups: Array<{ label: string; ids: string[] }> = [
        { label: "Essential Utilities", ids: ["electricity", "heat", "gas", "water", "sewer", "trash"] },
        { label: "Connectivity", ids: ["internet", "cable", "phone"] },
        { label: "Property Services", ids: ["laundry", "parking", "lawnCare", "snowRemoval", "hoa"] },
      ];

      const UtilityRow = ({ id }: { id: string }) => {
        const row = utilityById[id];
        if (!row) return null;
        const tenantPays = isTenantPays(id);
        return (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={["flex h-7 w-7 shrink-0 items-center justify-center rounded-md", tenantPays ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-600"].join(" ")}>
                {row.icon}
              </span>
              <span className="text-sm font-medium text-slate-800 truncate">{row.label}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={tenantPays}
              onClick={() => toggleUtility(id)}
              className={tenantPays ? "ui-switch ui-switch-on cursor-pointer shrink-0" : "ui-switch cursor-pointer shrink-0"}
            />
          </div>
        );
      };

      return (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Which utilities does the tenant pay?</p>
            <p className="mt-0.5 text-xs text-slate-500">Toggle <span className="font-medium text-slate-700">on</span> for tenant-paid, <span className="font-medium text-slate-700">off</span> for landlord-included or not applicable.</p>
          </div>
          {utilityGroups.map((group) => {
	            const allLandlord = group.ids.every((id) => terms.utilities[id] === "landlord");
	            const someLandlord = group.ids.some((id) => terms.utilities[id] === "landlord");
	            const toggleAll = () => {
	              const next = allLandlord ? "tenant" : "landlord";
	              onTermsChange({
	                ...terms,
	                utilities: {
	                  ...terms.utilities,
	                  ...Object.fromEntries(group.ids.map((id) => [id, next])),
	                },
	              });
	            };
            return (
              <div key={group.label}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${allLandlord ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : someLandlord ? "bg-slate-100 text-slate-500 hover:bg-slate-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${allLandlord ? "bg-emerald-500" : someLandlord ? "bg-amber-400" : "bg-slate-300"}`} />
                    {allLandlord ? "All landlord" : someLandlord ? "Select all" : "Select all"}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.ids.map((id) => <UtilityRow key={id} id={id} />)}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <BackButton />
            <button
              type="button"
              onClick={() => { onSaveProfile(); goToNextSection(); }}
              disabled={!canManageTemplates}
              className="ui-btn ui-btn-primary h-10 px-4 text-sm"
            >
              {nextSection ? `Next: ${nextSection.title} →` : "Next →"}
            </button>
          </div>
        </div>
      );
    }

    if (activeSection === "clauses") {
      const riskOrder: Record<string, number> = { high: 0, warning: 0, medium: 1, caution: 1, low: 2, info: 2 };
      const importanceOrder: Record<string, number> = { critical: 0, important: 1, recommended: 2 };

      const sortedClauses = [...reviewClauses].sort((a, b) => (riskOrder[a.riskLevel] ?? 3) - (riskOrder[b.riskLevel] ?? 3));
      const missingConcepts = [...(Array.isArray(review?.missingConcepts) ? review.missingConcepts : [])].sort((a, b) => (importanceOrder[a.importance] ?? 3) - (importanceOrder[b.importance] ?? 3));
      const readabilitySuggestions = Array.isArray(review?.readabilitySuggestions) ? review.readabilitySuggestions : [];
      const allNotes = [...(stateNotes.length ? stateNotes : property.stateClauses)].sort((a, b) => (riskOrder[a.risk] ?? 3) - (riskOrder[b.risk] ?? 3));

      // Parse "..intro. (1) first item; (2) second item." into intro + numbered list
      const parsedSummary = (() => {
        const raw = review?.executiveSummary ?? "";
        if (!raw) return null;
        const match = raw.match(/^([\s\S]*?)\s*\(1\)/);
        const intro = match ? match[1].trim() : raw;
        const items: string[] = [];
        const re = /\(\d+\)\s+([^(]+?)(?=\s*\(\d+\)|$)/g;
        let m;
        while ((m = re.exec(raw)) !== null) items.push(m[1].replace(/;\s*$/, "").trim());
        return { intro, items };
      })();

      const riskBorder = (risk: string) => {
        if (risk === "high" || risk === "warning") return "border-l-red-400";
        if (risk === "medium" || risk === "caution") return "border-l-amber-400";
        return "border-l-emerald-300";
      };
      const importanceClass = (importance: string) => {
        if (importance === "critical") return "border-red-200 bg-red-50 text-red-700";
        if (importance === "important") return "border-amber-200 bg-amber-50 text-amber-700";
        return "border-slate-200 bg-slate-50 text-slate-500";
      };
      const importanceBorder = (importance: string) => {
        if (importance === "critical") return "border-l-red-400";
        if (importance === "important") return "border-l-amber-400";
        return "border-l-slate-300";
      };

      const tabs = [
        { id: "clauses" as const, label: "Clauses", count: reviewClauses.length, color: "text-slate-700 border-slate-700" },
        { id: "missing" as const, label: "Missing", count: missingConcepts.length, color: "text-amber-700 border-amber-500" },
        { id: "statelaw" as const, label: "State Law", count: allNotes.length, color: "text-red-700 border-red-500" },
        { id: "readability" as const, label: "Readability", count: readabilitySuggestions.length, color: "text-emerald-700 border-emerald-600" },
      ];

      return (
        <div className="space-y-4">
          {/* Executive summary with parsed numbered list */}
          {parsedSummary && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="leading-relaxed">{parsedSummary.intro}</p>
              {parsedSummary.items.length > 0 && (
                <ol className="mt-2 space-y-1 pl-1">
                  {parsedSummary.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[10px] font-bold text-white">{i + 1}</span>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* Colored tabs */}
          <div className="flex gap-1 rounded-xl border border-slate-100 bg-slate-50 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setClauseTab(tab.id)}
                className={[
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
                  clauseTab === tab.id
                    ? `border-b-2 bg-white shadow-sm ${tab.color}`
                    : "text-slate-400 hover:text-slate-600",
                ].join(" ")}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={["rounded-full px-1.5 py-0.5 text-[10px] font-bold", clauseTab === tab.id ? "bg-slate-100" : "bg-slate-200 text-slate-500"].join(" ")}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="space-y-1.5">
            {clauseTab === "clauses" && (
              sortedClauses.length === 0 ? (
                <p className="ui-empty-state p-4 text-sm">Clauses will appear after upload and extraction.</p>
              ) : (
                sortedClauses.map((clause, i) => {
                  const key = `c:${i}`;
                  const isChecked = selectedFixes.has(key);
                  const isExpanded = expandedClauses.has(clause.title);
                  return (
                    <div key={clause.title} className={`rounded-lg border border-l-4 border-slate-100 transition-colors ${riskBorder(clause.riskLevel)} ${isChecked ? "bg-emerald-50" : "bg-white"}`}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
	                          onChange={() => setSelectedFixes((prev) => {
	                            const next = new Set(prev);
	                            if (isChecked) {
	                              next.delete(key);
	                            } else {
	                              next.add(key);
	                            }
	                            return next;
	                          })}
                          className="ui-checkbox mt-0.5 h-4 w-4 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">{clause.title}</p>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(clause.riskLevel)}`}>{clause.riskLevel}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{clause.summary}</p>
                        </div>
                      </label>
                      {clause.explanation && (
                        <button
                          type="button"
	                          onClick={() => setExpandedClauses((prev) => {
	                            const next = new Set(prev);
	                            if (isExpanded) {
	                              next.delete(clause.title);
	                            } else {
	                              next.add(clause.title);
	                            }
	                            return next;
	                          })}
                          className="w-full border-t border-slate-100 px-3 py-1.5 text-left text-xs text-slate-400 hover:text-slate-600"
                        >
                          {isExpanded ? "▲ Hide detail" : "▼ Show detail"}
                        </button>
                      )}
                      {isExpanded && clause.explanation && (
                        <p className="px-3 pb-2.5 text-sm text-slate-500">{clause.explanation}</p>
                      )}
                    </div>
                  );
                })
              )
            )}

            {clauseTab === "missing" && (
              missingConcepts.length === 0 ? (
                <p className="ui-empty-state p-4 text-sm">No missing provisions identified.</p>
              ) : (
                missingConcepts.map((item, i) => {
                  const key = `m:${i}`;
                  const isChecked = selectedFixes.has(key);
                  return (
                    <label key={i} className={`flex cursor-pointer items-start gap-3 rounded-lg border border-l-4 border-slate-100 px-3 py-2.5 transition-colors hover:bg-slate-50 ${importanceBorder(item.importance)} ${isChecked ? "bg-emerald-50" : "bg-white"}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
	                        onChange={() => setSelectedFixes((prev) => {
	                          const next = new Set(prev);
	                          if (isChecked) {
	                            next.delete(key);
	                          } else {
	                            next.add(key);
	                          }
	                          return next;
	                        })}
                        className="ui-checkbox mt-0.5 h-4 w-4 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{item.concept}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${importanceClass(item.importance)}`}>{item.importance}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                      </div>
                    </label>
                  );
                })
              )
            )}

            {clauseTab === "statelaw" && (
              allNotes.length === 0 ? (
                <p className="ui-empty-state p-4 text-sm">Upload a lease to get state-law suggestions for {property.state}.</p>
              ) : (
                allNotes.map((note, index) => {
                  const key = `s:${index}`;
                  const isChecked = selectedFixes.has(key);
                  return (
                    <label
                      key={`${note.area}-${index}`}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-l-4 border-slate-100 px-3 py-2.5 transition-colors hover:bg-slate-50 ${riskBorder(note.risk)} ${isChecked ? "bg-emerald-50" : "bg-white"}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
	                        onChange={() => setSelectedFixes((prev) => {
	                          const next = new Set(prev);
	                          if (isChecked) {
	                            next.delete(key);
	                          } else {
	                            next.add(key);
	                          }
	                          return next;
	                        })}
                        className="ui-checkbox mt-0.5 h-4 w-4 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">{note.area}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(note.risk)}`}>{note.risk}</span>
                        </div>
                        <p className="mt-1 text-sm leading-5 text-slate-600">{note.note}</p>
                      </div>
                    </label>
                  );
                })
              )
            )}

            {clauseTab === "readability" && (
              readabilitySuggestions.length === 0 ? (
                <p className="ui-empty-state p-4 text-sm">No readability suggestions.</p>
              ) : (
                readabilitySuggestions.map((item, i) => {
                  const key = `r:${i}`;
                  const isChecked = selectedFixes.has(key);
                  return (
                    <label key={i} className={`flex cursor-pointer items-start gap-3 rounded-lg border border-l-4 border-emerald-200 border-slate-100 px-3 py-2.5 transition-colors hover:bg-slate-50 ${isChecked ? "bg-emerald-50" : "bg-white"}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
	                        onChange={() => setSelectedFixes((prev) => {
	                          const next = new Set(prev);
	                          if (isChecked) {
	                            next.delete(key);
	                          } else {
	                            next.add(key);
	                          }
	                          return next;
	                        })}
                        className="ui-checkbox mt-0.5 h-4 w-4 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-400">{item.section}</p>
                        <p className="mt-0.5 text-sm text-slate-700">{item.issue}</p>
                        <p className="mt-1 text-sm text-emerald-700">→ {item.suggestion}</p>
                      </div>
                    </label>
                  );
                })
              )
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <BackButton />
            <button
              type="button"
              onClick={() => { onAcceptSuggestions(selectedFixes.size > 0); goToNextSection(); }}
              className="ui-btn ui-btn-primary h-10 px-4 text-sm"
            >
              {selectedFixes.size > 0
                ? `Apply ${selectedFixes.size} fix${selectedFixes.size !== 1 ? "es" : ""} & continue`
                : "Skip & continue"}
            </button>
          </div>
        </div>
      );
    }

    if (activeSection === "tags") {
      return (
        <div className="space-y-4">
          <DragDropTagPreview base64={pendingUpload?.previewFileBase64 ?? null} loading={busy === "workflow-preview"} />
          <div className="flex items-center gap-3">
            <BackButton />
            <button
              type="button"
              onClick={goToNextSection}
              className="ui-btn ui-btn-primary h-10 px-4 text-sm"
            >
              {nextSection ? `Next: ${nextSection.title} →` : "Next →"}
            </button>
          </div>
        </div>
      );
    }

    const previewDownloadUrl = pendingUpload?.previewFileBase64
      ? `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${pendingUpload.previewFileBase64}`
      : null;

    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="ui-panel-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{property.name}</p>
            <p className="text-sm text-slate-500">{property.address}</p>
          </div>
          <div className="ui-panel-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template source</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{pendingUpload?.fileName ?? selectedTemplate?.name ?? "Blank template"}</p>
            <p className="text-sm text-slate-500">{reviewClauses.length} extracted clauses</p>
          </div>
          <div className="ui-panel-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parties</p>
            <p className="mt-1 text-sm text-slate-700">Org: {profile.landlordName || "Not set"}</p>
            <p className="text-sm text-slate-700">Landlord: {profile.landlordSignatory || "Not set"}</p>
            <p className="text-sm text-slate-700">Manager: {profile.propertyManagerName || "Not set"}</p>
          </div>
          <div className="ui-panel-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">State improvements</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{acceptedSuggestions ? "Accepted" : "Not accepted"}</p>
            <p className="text-sm text-slate-500">{stateNotes.length || property.stateClauses.length} notes reviewed</p>
          </div>
        </div>
        <div className="ui-panel overflow-hidden">
          <div className="ui-panel-section flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Template preview</p>
              <p className="text-xs text-slate-500">Review the tokenized template before saving.</p>
            </div>
            <div className="flex items-center gap-2">
              {pendingUpload?.previewFileBase64 && busy !== "workflow-preview" ? (
                <ZoomControls zoom={previewZoom} onZoomChange={setPreviewZoom} />
              ) : null}
              {previewDownloadUrl ? (
                <a
                  href={previewDownloadUrl}
                  download={`${pendingUpload?.name ?? "lease-template"}-preview.docx`}
                  className="ui-btn ui-btn-secondary h-9 px-3 text-xs"
                >
                  Download preview
                </a>
              ) : null}
              <button
                type="button"
                onClick={onGeneratePreview}
                disabled={!pendingUpload || busy === "workflow-preview"}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
              >
                {busy === "workflow-preview" ? "Generating..." : pendingUpload?.previewFileBase64 ? "Refresh preview" : "Generate preview"}
              </button>
            </div>
          </div>
          {busy === "workflow-preview" ? (
            <div className="flex h-80 items-center justify-center bg-white text-sm text-slate-500">Generating template preview...</div>
          ) : pendingUpload?.previewError ? (
            <div className="bg-red-50 px-4 py-5 text-sm text-red-700">{pendingUpload.previewError}</div>
          ) : pendingUpload?.previewFileBase64 ? (
            <DocxPreview
              base64={pendingUpload.previewFileBase64}
              scale={previewZoom}
              page
              fallbackHint="Use “Download preview” to inspect the file."
              className="lease-preview h-[520px] overflow-auto"
            />
          ) : (
            <div className="bg-white px-4 py-8 text-center text-sm text-slate-500">
              Generate a preview to inspect the tokenized lease template with extracted clauses.
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <BackButton />
          <button
            type="button"
            onClick={onSaveTemplate}
            disabled={!pendingUpload || busy === "workflow-save" || !acceptedSuggestions || !pendingUpload.previewFileBase64}
            className="ui-btn ui-btn-primary h-10 flex-1 px-4 text-sm"
          >
            {busy === "workflow-save" ? "Saving..." : "Save template"}
          </button>
        </div>
      </div>
    );
  }

  const chevronLeft = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15 18l-6-6 6-6" /></svg>;
  const chevronRight = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 18l6-6-6-6" /></svg>;
	  const showSidebarHeader = activeSection === "start" && !workflowStarted;

  return (
    <>
      <div className="grid gap-5" style={{ gridTemplateColumns: `${sidebarOpen ? "300px" : "60px"} minmax(0,1fr)` }}>

        {/* ── Stepper sidebar ── */}
        <section className="ui-panel overflow-hidden">
          {sidebarOpen ? (
            <>
              {showSidebarHeader ? (
                <div className="ui-panel-section px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <Icon name="file" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">Template builder</span>
                        <span className="block truncate text-xs text-slate-500">Reusable templates</span>
                      </span>
                    </div>
                    <button type="button" title="Collapse" onClick={() => setSidebarOpen(false)}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                      {chevronLeft}
                    </button>
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>Progress</span><span>{progress}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={showSidebarHeader ? "space-y-0.5 p-2" : "space-y-0.5 p-3"}>
                {sections.map((section, index) => (
                  <button key={section.id} type="button" onClick={() => setActiveSection(section.id)}
                    className={["group relative grid w-full grid-cols-[34px_minmax(0,1fr)] items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                      activeSection === section.id ? "bg-emerald-50 ring-1 ring-emerald-100" : "hover:bg-slate-50"].join(" ")}>
                    {index < sections.length - 1 && (
                      <span className={["absolute left-[27px] top-[40px] h-[calc(100%-4px)] w-px", section.complete ? "bg-emerald-300" : "bg-slate-200"].join(" ")} />
                    )}
                    <span className={["relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full border transition-all",
                      activeSection === section.id ? "border-emerald-600 bg-emerald-600 text-white ring-4 ring-emerald-100" :
                        section.complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                          "border-slate-200 bg-slate-100 text-slate-400"].join(" ")}>
                      <Icon name={section.icon} className="h-3 w-3" />
                      {section.complete && (
                        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-white">
                          <Icon name="check" className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{section.title}</span>
                      <span className={["mt-0.5 block truncate text-[11px]", activeSection === section.id ? "text-emerald-700" : "text-slate-400"].join(" ")}>
                        {section.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Collapsed icon rail */
            <div className="flex flex-col items-center gap-1 py-3">
              <button type="button" title="Expand sidebar" onClick={() => setSidebarOpen(true)}
                className="mb-1 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                {chevronRight}
              </button>

              {/* Mini progress ring */}
              <div className="relative mb-2 flex h-9 w-9 items-center justify-center">
                <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#059669" strokeWidth="3"
                    strokeDasharray={`${(progress / 100) * 87.96} 87.96`} strokeLinecap="round" />
                </svg>
                <span className="absolute text-[9px] font-bold text-emerald-700">{progress}%</span>
              </div>

              {sections.map((section, index) => (
                <div key={section.id} className="relative flex flex-col items-center">
                  <button type="button" title={section.title} onClick={() => setActiveSection(section.id)}
                    className={["flex h-[26px] w-[26px] items-center justify-center rounded-full border transition-all",
                      activeSection === section.id ? "border-emerald-600 bg-emerald-600 text-white ring-4 ring-emerald-100" :
                        section.complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                          "border-slate-200 bg-slate-100 text-slate-400 hover:border-slate-300"].join(" ")}>
                    <Icon name={section.icon} className="h-3 w-3" />
                    {section.complete && (
                      <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-white">
                        <Icon name="check" className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                  {index < sections.length - 1 && <span className={["mt-0.5 h-3 w-px", section.complete ? "bg-emerald-300" : "bg-slate-200"].join(" ")} />}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Content panel ── */}
        <aside className="ui-panel self-start p-6 xl:sticky xl:top-5">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {!sidebarOpen && (
                <button type="button" title="Expand sidebar" onClick={() => setSidebarOpen(true)}
                  className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                  {chevronRight}
                </button>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Current section</p>
                <div className="mt-2 flex items-center gap-3">
                  {(() => {
                    const s = sections.find((sec) => sec.id === activeSection);
                    return s ? (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                        <Icon name={s.icon} className="h-5 w-5 text-slate-600" />
                      </div>
                    ) : null;
                  })()}
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                    {sections.find((s) => s.id === activeSection)?.title}
                  </h3>
                </div>
                <p className="mt-1.5 pl-[52px] text-sm leading-6 text-slate-500">
                  {sections.find((s) => s.id === activeSection)?.description}
                </p>
              </div>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {property.state}
            </span>
          </div>
          <div className="mt-5">{renderActiveSection()}</div>
        </aside>
      </div>
    </>
  );
}

export function LeaseWorkspaceClient({
  properties,
  canManageTemplates,
}: {
  properties: LeaseProperty[];
  canManageTemplates: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const workflowFileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<WorkspaceMode>("create");
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id ?? "");
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) ?? properties[0] ?? null;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    selectedProperty?.templates.find((template) => template.isActive)?.id ?? selectedProperty?.templates[0]?.id ?? null,
  );
  const selectedTemplate =
    selectedProperty?.templates.find((template) => template.id === selectedTemplateId) ??
    selectedProperty?.templates.find((template) => template.isActive) ??
    selectedProperty?.templates[0] ??
    null;
  const [busy, setBusy] = useState<string | null>(null);
  const [editingClause, setEditingClause] = useState<ClauseForm | null>(null);
  const [workflowProfile, setWorkflowProfile] = useState<LeaseProfile>(defaultLeaseProfile);
  const [workflowTerms, setWorkflowTerms] = useState<WorkflowTerms>(defaultWorkflowTerms);
  const [pendingWorkflowUpload, setPendingWorkflowUpload] = useState<PendingWorkflowUpload | null>(null);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState(false);
  const [workflowStarted, setWorkflowStarted] = useState(false);
  const [workflowAdvanceToken, setWorkflowAdvanceToken] = useState(0);

  function populateFromTemplate(template: LeaseTemplate, property: LeaseProperty) {
    const review = template.reviewData as LeaseReview | null | undefined;
    const et = review?.extractedTerms;
    const lps = review?.leaseProfileSuggestions;

    setWorkflowProfile({
      landlordName: et?.landlordName ?? property.leaseProfile.landlordName,
      landlordSignatory: et?.landlordSignatory ?? property.leaseProfile.landlordSignatory,
      propertyManagerName: lps?.propertyManagerName?.trim() || property.leaseProfile.propertyManagerName,
      propertyManagerEmail: lps?.propertyManagerEmail?.trim() || property.leaseProfile.propertyManagerEmail,
      propertyManagerPhone: lps?.propertyManagerPhone?.trim() || property.leaseProfile.propertyManagerPhone,
      includesElectricity: applyProfileChoice(property.leaseProfile.includesElectricity, lps?.includesElectricity),
      includesLaundry: applyProfileChoice(property.leaseProfile.includesLaundry, lps?.includesLaundry),
      hasPetFee: applyProfileChoice(property.leaseProfile.hasPetFee, lps?.hasPetFee),
      includesParking: applyProfileChoice(property.leaseProfile.includesParking, lps?.includesParking),
      includesInternet: applyProfileChoice(property.leaseProfile.includesInternet, lps?.includesInternet),
    });

    setWorkflowTerms({
      leaseType: (et?.leaseType === "fixed" || et?.leaseType === "month-to-month") ? et.leaseType : "unknown",
      leaseTerm: et?.leaseTerm ? (et.leaseTerm.match(/\d+/)?.[0] ?? "") : "",
      leaseEndBehavior: "",
      lateFeeGraceDays: et?.gracePeriodDays ? String(et.gracePeriodDays) : "",
      lateFeeType: et?.lateFeePct ? "pct" : "flat",
      lateFeeFlat: et?.lateFeeFlat ? String(et.lateFeeFlat) : "",
      lateFeePct: et?.lateFeePct ? String(et.lateFeePct) : "",
      earlyTerminationFee: et?.earlyTerminationFee ? String(et.earlyTerminationFee) : "",
      earlyTerminationMonths: et?.earlyTerminationMonths ? String(et.earlyTerminationMonths) : "",
      petFeeAmount: et?.petFeeAmount ? String(et.petFeeAmount) : "",
      utilities: {
        ...defaultUtilities,
        electricity: lps?.includesElectricity === "yes" ? "landlord" : "tenant",
        heat: lps?.includesHeat === "yes" ? "landlord" : "tenant",
        gas: lps?.includesGas === "yes" ? "landlord" : "tenant",
        water: lps?.includesWater === "yes" ? "landlord" : "tenant",
        sewer: lps?.includesSewer === "yes" ? "landlord" : "tenant",
        trash: lps?.includesTrash === "yes" ? "landlord" : "tenant",
        internet: lps?.includesInternet === "yes" ? "landlord" : "tenant",
        cable: lps?.includesCable === "yes" ? "landlord" : "tenant",
        phone: lps?.includesPhone === "yes" ? "landlord" : "tenant",
        // Property services: "yes" = landlord, "no" = tenant, "unknown"/missing = na
        laundry: lps?.includesLaundry === "yes" ? "landlord" : lps?.includesLaundry === "no" ? "tenant" : "na",
        parking: lps?.includesParking === "yes" ? "landlord" : lps?.includesParking === "no" ? "tenant" : "na",
        lawnCare: lps?.includesLawnCare === "yes" ? "landlord" : lps?.includesLawnCare === "no" ? "tenant" : "na",
        snowRemoval: lps?.includesSnowRemoval === "yes" ? "landlord" : lps?.includesSnowRemoval === "no" ? "tenant" : "na",
        hoa: lps?.includesHoa === "yes" ? "landlord" : lps?.includesHoa === "no" ? "tenant" : "na",
      },
    });
  }

  function selectProperty(propertyId: string) {
    const property = properties.find((item) => item.id === propertyId);
    setSelectedPropertyId(propertyId);
    setSelectedTemplateId(property?.templates.find((template) => template.isActive)?.id ?? property?.templates[0]?.id ?? null);
    setWorkflowProfile(defaultLeaseProfile);
    setWorkflowTerms(defaultWorkflowTerms);
    setPendingWorkflowUpload(null);
    setAcceptedSuggestions(false);
    setWorkflowStarted(false);
  }

  async function uploadTemplate(file: File) {
    if (!selectedProperty) return;
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("name", file.name.replace(/\.[^.]+$/, "") || "Lease template");
      const res = await fetch(`/api/properties/${selectedProperty.id}/lease-templates`, { method: "POST", body });
      const data = (await res.json()) as { error?: string; template?: { id: string } };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Could not upload template.");
      toast.success("Lease template uploaded and clause extraction started.", { title: "Leases" });
      setSelectedTemplateId(data.template.id);
      setMode("create");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload template.", { title: "Leases" });
    } finally {
      setBusy(null);
    }
  }

  async function runReview() {
    if (!selectedProperty || !selectedTemplate) return;
    setBusy("review");
    try {
      const res = await fetch(`/api/properties/${selectedProperty.id}/lease-templates/${selectedTemplate.id}/review`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not analyze lease.");
      toast.success("AI review saved and clauses updated.", { title: "Leases" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not analyze lease.", { title: "Leases" });
    } finally {
      setBusy(null);
    }
  }

  async function setActiveTemplate(templateId: string) {
    if (!selectedProperty) return;
    setBusy(templateId);
    try {
      const res = await fetch(`/api/properties/${selectedProperty.id}/lease-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not activate template.");
      toast.success("Active template updated.", { title: "Leases" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate template.", { title: "Leases" });
    } finally {
      setBusy(null);
    }
  }

  async function saveClause(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProperty || !selectedTemplate || !editingClause) return;
    const isNew = !editingClause.id;
    setBusy("clause");
    try {
      const res = await fetch(
        isNew
          ? `/api/properties/${selectedProperty.id}/lease-templates/${selectedTemplate.id}/clauses`
          : `/api/properties/${selectedProperty.id}/lease-templates/${selectedTemplate.id}/clauses/${editingClause.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingClause),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save clause.");
      toast.success(isNew ? "Clause added." : "Clause updated.", { title: "Leases" });
      setEditingClause(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save clause.", { title: "Leases" });
    } finally {
      setBusy(null);
    }
  }

  async function runWorkflowExtraction(file: File) {
    if (!selectedProperty) return;
    setBusy("workflow-upload");
    setPendingWorkflowUpload(null);
    setAcceptedSuggestions(false);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("name", file.name.replace(/\.[^.]+$/, "") || "Lease template");
      const res = await fetch(`/api/properties/${selectedProperty.id}/lease-templates/pre-review`, {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        error?: string;
        review?: LeaseReview;
        blobUrl?: string;
        contentType?: string;
        fileName?: string;
        name?: string;
      };
      if (!res.ok || !data.review || !data.blobUrl || !data.contentType || !data.fileName || !data.name) {
        throw new Error(data.error ?? "Could not extract lease details.");
      }
      setPendingWorkflowUpload({
        blobUrl: data.blobUrl,
        contentType: data.contentType,
        fileName: data.fileName,
        name: data.name,
        review: data.review,
      });
      const extractedLandlord = data.review?.extractedTerms?.landlordName?.trim();
      const extractedSignatory = data.review?.extractedTerms?.landlordSignatory?.trim();
      const extractedManager = data.review?.leaseProfileSuggestions?.propertyManagerName?.trim();
      const extractedManagerEmail = data.review?.leaseProfileSuggestions?.propertyManagerEmail?.trim();
      const extractedManagerPhone = data.review?.leaseProfileSuggestions?.propertyManagerPhone?.trim();
      setWorkflowProfile({
        landlordName: (extractedLandlord && !isProbablyPropertyOrAddress(extractedLandlord, selectedProperty))
          ? extractedLandlord
          : "",
        landlordSignatory: (extractedSignatory && !isProbablyPropertyOrAddress(extractedSignatory, selectedProperty))
          ? extractedSignatory
          : "",
        propertyManagerName: (extractedManager && extractedManager.toLowerCase() !== extractedLandlord?.toLowerCase())
          ? extractedManager
          : "",
        propertyManagerEmail: extractedManagerEmail ?? "",
        propertyManagerPhone: extractedManagerPhone ?? "",
        includesElectricity: applyProfileChoice(false, data.review?.leaseProfileSuggestions?.includesElectricity),
        includesLaundry: applyProfileChoice(false, data.review?.leaseProfileSuggestions?.includesLaundry),
        hasPetFee: applyProfileChoice(false, data.review?.leaseProfileSuggestions?.hasPetFee),
        includesParking: applyProfileChoice(false, data.review?.leaseProfileSuggestions?.includesParking),
        includesInternet: applyProfileChoice(false, data.review?.leaseProfileSuggestions?.includesInternet),
      });
      const propertyNameMismatchWarning = getPropertyNameMismatchWarning(
        selectedProperty.name,
        extractedLandlord ?? "",
      );
      if (propertyNameMismatchWarning) {
        toast.info(
          `Property "${propertyNameMismatchWarning.expectedName}" does not match lease name "${propertyNameMismatchWarning.extractedName}". Please review before saving.`,
          { title: "Lease upload" },
        );
      }
      const et = data.review?.extractedTerms;
      const lps = data.review?.leaseProfileSuggestions;
      setWorkflowTerms({
        leaseType: (et?.leaseType === "fixed" || et?.leaseType === "month-to-month") ? et.leaseType : "unknown",
        leaseTerm: et?.leaseTerm ? (et.leaseTerm.match(/\d+/)?.[0] ?? "") : "",
        leaseEndBehavior: "",
        lateFeeGraceDays: et?.gracePeriodDays ? String(et.gracePeriodDays) : "",
        lateFeeType: et?.lateFeePct ? "pct" : "flat",
        lateFeeFlat: et?.lateFeeFlat ? String(et.lateFeeFlat) : "",
        lateFeePct: et?.lateFeePct ? String(et.lateFeePct) : "",
        earlyTerminationFee: et?.earlyTerminationFee ? String(et.earlyTerminationFee) : "",
        earlyTerminationMonths: et?.earlyTerminationMonths ? String(et.earlyTerminationMonths) : "",
        petFeeAmount: et?.petFeeAmount ? String(et.petFeeAmount) : "",
        utilities: {
          ...defaultUtilities,
          electricity: lps?.includesElectricity === "yes" ? "landlord" : "tenant",
          heat: lps?.includesHeat === "yes" ? "landlord" : "tenant",
          gas: lps?.includesGas === "yes" ? "landlord" : "tenant",
          water: lps?.includesWater === "yes" ? "landlord" : "tenant",
          sewer: lps?.includesSewer === "yes" ? "landlord" : "tenant",
          trash: lps?.includesTrash === "yes" ? "landlord" : "tenant",
          internet: lps?.includesInternet === "yes" ? "landlord" : "tenant",
          cable: lps?.includesCable === "yes" ? "landlord" : "tenant",
          phone: lps?.includesPhone === "yes" ? "landlord" : "tenant",
          laundry: lps?.includesLaundry === "yes" ? "landlord" : lps?.includesLaundry === "no" ? "tenant" : "na",
          parking: lps?.includesParking === "yes" ? "landlord" : lps?.includesParking === "no" ? "tenant" : "na",
          lawnCare: lps?.includesLawnCare === "yes" ? "landlord" : lps?.includesLawnCare === "no" ? "tenant" : "na",
          snowRemoval: lps?.includesSnowRemoval === "yes" ? "landlord" : lps?.includesSnowRemoval === "no" ? "tenant" : "na",
          hoa: lps?.includesHoa === "yes" ? "landlord" : lps?.includesHoa === "no" ? "tenant" : "na",
        },
      });
      setAcceptedSuggestions(false);
      setWorkflowStarted(true);
      setMode("create");
      if (!propertyNameMismatchWarning) {
        setWorkflowAdvanceToken((token) => token + 1);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not extract lease.", { title: "Leases" });
    } finally {
      setBusy(null);
    }
  }

  async function saveLeaseProfile() {
    if (!selectedProperty) return;
    setBusy("profile");
    try {
      const res = await fetch(`/api/properties/${selectedProperty.id}/lease-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowProfile),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save property lease fields.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save property fields.", { title: "Leases" });
    } finally {
      setBusy(null);
    }
  }

  function computeTenantPaidUtilities() {
    const utilMap = Object.fromEntries(ALL_UTILITIES.map((u) => [u.id, u.label]));
    return Object.entries(workflowTerms.utilities ?? {})
      .filter(([, v]) => v === "tenant")
      .map(([id]) => utilMap[id] ?? id)
      .join(", ");
  }

  async function generateWorkflowPreviewSilent() {
    if (!selectedProperty || !pendingWorkflowUpload || busy === "workflow-preview") return;
    try {
      const res = await fetch(`/api/properties/${selectedProperty.id}/lease-templates/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: pendingWorkflowUpload.blobUrl,
          organizationName: workflowProfile.landlordName || undefined,
          landlordSignatory: workflowProfile.landlordSignatory || undefined,
          propertyManagerName: workflowProfile.propertyManagerName || undefined,
          propertyManagerEmail: workflowProfile.propertyManagerEmail || undefined,
          propertyManagerPhone: workflowProfile.propertyManagerPhone || undefined,
          tenantPaidUtilities: computeTenantPaidUtilities() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { fileBase64?: string };
      if (res.ok && data.fileBase64) {
        setPendingWorkflowUpload((upload) => upload ? {
          ...upload,
          previewFileBase64: data.fileBase64 ?? null,
          previewError: null,
        } : upload);
      }
    } catch {
      // silent — user can still manually generate in the review step
    }
  }

  async function generateWorkflowPreview() {
    if (!selectedProperty || !pendingWorkflowUpload) return;
    setBusy("workflow-preview");
    setPendingWorkflowUpload((upload) => upload ? { ...upload, previewError: null } : upload);
    try {
      const res = await fetch(`/api/properties/${selectedProperty.id}/lease-templates/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: pendingWorkflowUpload.blobUrl,
          organizationName: workflowProfile.landlordName || undefined,
          landlordSignatory: workflowProfile.landlordSignatory || undefined,
          propertyManagerName: workflowProfile.propertyManagerName || undefined,
          propertyManagerEmail: workflowProfile.propertyManagerEmail || undefined,
          propertyManagerPhone: workflowProfile.propertyManagerPhone || undefined,
          tenantPaidUtilities: computeTenantPaidUtilities() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fileBase64?: string;
      };
      if (!res.ok || !data.fileBase64) throw new Error(data.error ?? "Could not generate template preview.");
      setPendingWorkflowUpload((upload) => upload ? {
        ...upload,
        previewFileBase64: data.fileBase64 ?? null,
        previewError: null,
      } : upload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate template preview.";
      setPendingWorkflowUpload((upload) => upload ? { ...upload, previewError: message } : upload);
      toast.error(message, { title: "Leases" });
    } finally {
      setBusy(null);
    }
  }

  async function saveWorkflowTemplate() {
    if (!selectedProperty || !pendingWorkflowUpload) return;
    setBusy("workflow-save");
    try {
      const res = await fetch(`/api/properties/${selectedProperty.id}/lease-templates/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: pendingWorkflowUpload.blobUrl,
          contentType: pendingWorkflowUpload.contentType,
          fileName: pendingWorkflowUpload.fileName,
          name: (() => {
            const street = selectedProperty.address.split(",")[0].trim();
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, "0");
            const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}`;
            return `${street} ${datePart} ${timePart}`;
          })(),
          workflowTerms,
          organizationName: workflowProfile.landlordName || undefined,
          landlordSignatory: workflowProfile.landlordSignatory || undefined,
          propertyManagerName: workflowProfile.propertyManagerName || undefined,
          propertyManagerEmail: workflowProfile.propertyManagerEmail || undefined,
          propertyManagerPhone: workflowProfile.propertyManagerPhone || undefined,
          reviewData: {
            ...pendingWorkflowUpload.review,
            acceptedStateSuggestions: acceptedSuggestions,
            generatedTags: [
              // Tenant identity (max 2 tenants)
              "{{tenant_name}}",
              "{{co_tenant_names}}",
              // Unit
              "{{unit_number}}",
              // Initials (up to 2 tenants)
              "{{Initial;type=initials;role=Tenant 1}}",
              "{{Initial;type=initials;role=Tenant 2}}",
              // Signatures (up to 2 tenants + 1 manager)
              "{{Sign;type=signature;role=Tenant 1}}",
              "{{Sign;type=signature;role=Tenant 2}}",
              "{{Sign;type=signature;role=Manager}}",
              // Sign dates
              "{{Date;type=date;role=Tenant 1}}",
              "{{Date;type=date;role=Tenant 2}}",
              "{{Date;type=date;role=Manager}}",
              // Key lease dates & financials
              "{{lease_start}}",
              "{{lease_end}}",
              "{{security_deposit}}",
              // Pet fee — only relevant when tenant has a pet
              "{{pet_fee_amount}}",
            ],
          },
        }),
      });
      const data = (await res.json()) as { error?: string; template?: { id: string } };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Could not save generated template.");
      setSelectedTemplateId(data.template.id);
      setPendingWorkflowUpload(null);
      setAcceptedSuggestions(false);
      setWorkflowStarted(false);
      setMode("create");
      toast.success("Tagged lease template saved.", { title: "Leases" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save template.", { title: "Leases" });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (busy !== "workflow-upload") return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [busy]);

  return (
    <>
      <div className="space-y-5">
      {!selectedProperty ? (
        <div className="ui-empty-state p-10 text-center text-slate-500">
          Add a property before creating lease templates.
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf,text/rtf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadTemplate(file);
              event.target.value = "";
            }}
          />
          <input
            ref={workflowFileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void runWorkflowExtraction(file);
              event.target.value = "";
            }}
          />

          {mode === "create" ? (
            <LeaseCreationWorkflow
              property={selectedProperty}
              properties={properties}
              selectedPropertyId={selectedPropertyId}
              selectedTemplate={selectedTemplate}
              canManageTemplates={canManageTemplates}
              busy={busy}
              profile={workflowProfile}
              terms={workflowTerms}
              pendingUpload={pendingWorkflowUpload}
              acceptedSuggestions={acceptedSuggestions}
              onSelectProperty={selectProperty}
              onSelectTemplate={(templateId) => {
                setSelectedTemplateId(templateId);
                const template = selectedProperty?.templates.find((t) => t.id === templateId);
                if (template && selectedProperty) populateFromTemplate(template, selectedProperty);
              }}
              onUploadClick={() => workflowFileRef.current?.click()}
              onProfileChange={setWorkflowProfile}
              onSaveProfile={() => void saveLeaseProfile()}
              onTermsChange={setWorkflowTerms}
	              onAcceptSuggestions={setAcceptedSuggestions}
	              onGeneratePreview={() => void generateWorkflowPreview()}
	              onGeneratePreviewSilent={() => void generateWorkflowPreviewSilent()}
	              onSaveTemplate={() => void saveWorkflowTemplate()}
              advanceToken={workflowAdvanceToken}
              workflowStarted={workflowStarted}
              onWorkflowStarted={setWorkflowStarted}
            />
          ) : null}

          {mode === "builder" ? (
            <div className="grid gap-5 2xl:grid-cols-[320px_minmax(0,1fr)_380px]">
              <aside className="space-y-4">
                <section className="ui-panel p-4">
                  <div className="mb-3">
                    <h2 className="font-bold text-slate-900">{selectedProperty.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{selectedProperty.address}</p>
                  </div>
                  {canManageTemplates ? (
                    <TemplateUploadCard busy={busy === "upload"} onUploadClick={() => fileRef.current?.click()} />
                  ) : null}
                </section>

                <section className="ui-panel p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900">Templates</h3>
                      <p className="text-xs text-slate-500">Choose the working template.</p>
                    </div>
                  </div>
                  <TemplateList
                    templates={selectedProperty.templates}
                    selectedTemplate={selectedTemplate}
                    busy={busy}
                    canManageTemplates={canManageTemplates}
                    onSelect={setSelectedTemplateId}
                    onSetActive={(templateId) => void setActiveTemplate(templateId)}
                  />
                </section>
              </aside>

              <LeasePreview property={selectedProperty} template={selectedTemplate} />

              <div className="space-y-4">
                <section className="ui-panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900">Current template</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedTemplate ? selectedTemplate.fileName : "No template selected"}
                      </p>
                    </div>
                    {selectedTemplate?.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Active</span>
                    ) : null}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <a
                      href={selectedTemplate ? `/api/properties/${selectedProperty.id}/lease-templates/${selectedTemplate.id}/file` : "#"}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View file
                    </a>
                    <button
                      type="button"
                      onClick={() => void runReview()}
                      disabled={!selectedTemplate || busy === "review"}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      <Icon name="spark" className="h-4 w-4" />
                      {busy === "review" ? "Reviewing..." : "Review"}
                    </button>
                  </div>
                </section>

                <ClauseWorkspace
                  clauses={selectedTemplate?.clauses ?? []}
                  canManageTemplates={canManageTemplates}
                  selectedClauseId={editingClause?.id ?? null}
                  onSelect={(clause) => setEditingClause(clauseToForm(clause))}
                  onAdd={() => setEditingClause(emptyClause)}
                />
              </div>
            </div>
          ) : null}

          {mode === "templates" ? (
            <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <section className="ui-panel p-4">
                {canManageTemplates ? (
                  <TemplateUploadCard busy={busy === "upload"} onUploadClick={() => fileRef.current?.click()} />
                ) : null}
                <div className="mt-4">
                  <TemplateList
                    templates={selectedProperty.templates}
                    selectedTemplate={selectedTemplate}
                    busy={busy}
                    canManageTemplates={canManageTemplates}
                    onSelect={setSelectedTemplateId}
                    onSetActive={(templateId) => void setActiveTemplate(templateId)}
                  />
                </div>
              </section>
              <section className="ui-panel p-5">
                <h2 className="text-lg font-bold text-slate-900">Template details</h2>
                {selectedTemplate ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">File</p>
                      <p className="mt-2 break-words text-sm font-semibold text-slate-900">{selectedTemplate.fileName}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{formatDate(selectedTemplate.createdAt)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clauses</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{selectedTemplate.clauseCount}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Select a template to see details.</p>
                )}
              </section>
            </div>
          ) : null}

          {mode === "status" ? <UnitStatusTable units={selectedProperty.units} /> : null}
        </>
      )}

      {editingClause ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingClause(null)} />
          <form onSubmit={saveClause} className="ui-modal-panel relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{editingClause.id ? "Edit extracted clause" : "Add clause"}</h3>
                <p className="mt-1 text-sm text-slate-500">Stored clauses can be reused in future lease templates.</p>
              </div>
              <button type="button" onClick={() => setEditingClause(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                Title
                <input className={inputClass} value={editingClause.title} onChange={(event) => setEditingClause({ ...editingClause, title: event.target.value })} />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                Summary
                <input className={inputClass} value={editingClause.summary} onChange={(event) => setEditingClause({ ...editingClause, summary: event.target.value })} />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                Risk
                <select className={inputClass} value={editingClause.riskLevel} onChange={(event) => setEditingClause({ ...editingClause, riskLevel: event.target.value })}>
                  <option value="">Unrated</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                Clause body
                <textarea className={`${inputClass} min-h-40 resize-y leading-6`} value={editingClause.body} onChange={(event) => setEditingClause({ ...editingClause, body: event.target.value })} />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                Explanation
                <textarea className={`${inputClass} min-h-24 resize-y leading-6`} value={editingClause.explanation} onChange={(event) => setEditingClause({ ...editingClause, explanation: event.target.value })} />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setEditingClause(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={busy === "clause"} className="ui-btn ui-btn-primary px-4 py-2 text-sm">
                {busy === "clause" ? "Saving..." : "Save clause"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      </div>
    </>
  );
}
