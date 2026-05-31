"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getPropertyTypeLabel, PROPERTY_TYPE_OPTIONS } from "@/lib/property-types";
import { useToast } from "./ToastProvider";
import { OnboardRenterWizard, type WizardUnit } from "./OnboardRenterWizard";

type PropertyDetails = {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  isActive: boolean;
  units: UnitDetails[];
};

type UnitTenant = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};

type UnitDetails = {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number | null;
  rentAmount: number | null;
  status: string;
  hasActiveLease: boolean;
  activeLeaseId: string | null;
  hasLeaseDocument: boolean;
  pendingSignatureLeaseId: string | null;
  futurePaymentCount: number;
  tenant: UnitTenant | null;
};

type PropertyFormState = {
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
};

type LeaseTemplate = {
  id: string;
  name: string;
  fileName: string;
  contentType: string;
  blobUrl: string;
  isActive: boolean;
  createdAt: string;
};

type LeaseReview = {
  extractedTerms: {
    monthlyRent: number;
    securityDeposit: number;
    startDate: string;
    endDate: string;
    propertyAddress: string;
    state: string;
    landlordName: string;
    leaseType: string;
    gracePeriodDays: number;
    lateFeeFlat: number;
    lateFeePct: number;
  };
  clauseSummaries: Array<{ title: string; summary: string; riskLevel: "low" | "medium" | "high"; explanation: string }>;
  missingConcepts: Array<{ concept: string; importance: "recommended" | "important" | "critical"; description: string }>;
  inconsistencies: Array<{ description: string; severity: "low" | "medium" | "high" }>;
  stateLawNotes: Array<{ area: string; note: string; risk: "info" | "caution" | "warning" }>;
  readabilitySuggestions: Array<{ section: string; issue: string; suggestion: string }>;
  overallRiskLevel: "low" | "medium" | "high";
  executiveSummary: string;
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function MapPinIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function HomeIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function BuildingIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V21" />
      <path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V21" />
      <path d="M8 8h4M8 12h4M8 16h4M3 21h18" />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SparklesIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

function EditIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m14.5 5.5 4 4" /><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    </svg>
  );
}

function LeaseDocumentIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h8" />
    </svg>
  );
}

function RentCreditIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M14.5 9.5a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.9-2.5 2s1.1 1.6 2.5 2 2.5.9 2.5 2-1.1 2-2.5 2a2.5 2.5 0 0 1-2.5-1.5M12 6.5v1.5M12 16v1.5" />
    </svg>
  );
}

function DeactivateIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  );
}

function ActivateIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

function MoreVerticalIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "occupied":
      return "bg-green-100 text-green-700 border-green-200";
    case "maintenance":
      return "bg-red-100 text-red-600 border-red-200";
    case "inactive":
      return "bg-gray-100 text-gray-600 border-gray-200";
    default:
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const modalInputClass =
  "w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

function unitFormFromUnit(unit: UnitDetails) {
  return {
    unitNumber: unit.unitNumber,
    bedrooms: String(unit.bedrooms),
    bathrooms: String(unit.bathrooms),
    squareFeet: unit.squareFeet === null ? "" : String(unit.squareFeet),
    rentAmount: unit.rentAmount === null ? "" : String(unit.rentAmount),
    status: unit.status,
  };
}

const emptyUnitForm = {
  unitNumber: "",
  bedrooms: "1",
  bathrooms: "1",
  squareFeet: "",
  rentAmount: "",
  status: "vacant",
};

// ─── Lease Template Button ────────────────────────────────────────────────────

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function DownloadIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

const TOKEN_LABELS: Record<string, string> = {
  "{{tenant_name}}": "Primary tenant name",
  "{{tenant_email}}": "Tenant email",
  "{{all_tenant_names}}": "All tenant names (primary + co-tenants)",
  "{{co_tenant_names}}": "Co-tenant names only",
  "{{property_name}}": "Property name",
  "{{property_address}}": "Property address (full)",
  "{{property_address_with_unit}}": "Property address + unit number",
  "{{property_street}}": "Property street only",
  "{{unit_number}}": "Unit number",
  "{{lease_start}}": "Lease start date",
  "{{lease_end}}": "Lease end date",
  "{{rent_amount}}": "Monthly rent",
  "{{security_deposit}}": "Security deposit",
  "{{total_rent}}": "Total rent (words + figures)",
  "{{organization_name}}": "Organization / landlord entity name",
  "{{property_manager_name}}": "Property manager name",
  "{{property_manager_email}}": "Property manager email",
};

const SIGNATURE_TAGS = [
  { label: "Tenant 1 — signature", tag: "{{Sign;type=signature;role=Tenant 1}}" },
  { label: "Tenant 1 — initials",  tag: "{{Initial;type=initials;role=Tenant 1}}" },
  { label: "Tenant 1 — date",      tag: "{{Date;type=date;role=Tenant 1}}" },
  { label: "Tenant 2 — signature", tag: "{{Sign;type=signature;role=Tenant 2}}" },
  { label: "Tenant 2 — initials",  tag: "{{Initial;type=initials;role=Tenant 2}}" },
  { label: "Tenant 2 — date",      tag: "{{Date;type=date;role=Tenant 2}}" },
  { label: "Manager — signature",  tag: "{{Sign;type=signature;role=Manager}}" },
  { label: "Manager — initials",   tag: "{{Initial;type=initials;role=Manager}}" },
  { label: "Manager — date",       tag: "{{Date;type=date;role=Manager}}" },
];

function PlaceholdersModal({
  propertyId,
  template,
  onClose,
}: {
  propertyId: string;
  template: LeaseTemplate;
  onClose: () => void;
}) {
  const [pairs, setPairs] = useState<Array<{ search: string; token: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/lease-templates/${template.id}`)
      .then((r) => r.json())
      .then((data: { pairs?: Array<{ search: string; token: string }> | null }) => {
        setPairs(data.pairs ?? []);
      })
      .catch(() => setPairs([]))
      .finally(() => setLoading(false));
  }, [propertyId, template.id]);

  function updatePair(i: number, field: "search" | "token", value: string) {
    setPairs((prev) => prev.map((p, j) => (j === i ? { ...p, [field]: value } : p)));
  }

  function removePair(i: number) {
    setPairs((prev) => prev.filter((_, j) => j !== i));
  }

  function addPair() {
    setPairs((prev) => [...prev, { search: "", token: "{{tenant_name}}" }]);
  }

  async function save() {
    setSaving(true);
    try {
      const valid = pairs.filter((p) => p.search.trim() && p.token);
      const res = await fetch(`/api/properties/${propertyId}/lease-templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs: valid }),
      });
      if (!res.ok) throw new Error("Save failed");
      setPairs(valid);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Lease placeholders</h2>
            <p className="mt-0.5 text-sm text-gray-500">{template.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : (
            <>
              {/* Column headers */}
              <div className="mb-2 grid grid-cols-[1fr_200px_32px] gap-3 text-xs font-medium text-gray-500">
                <span>Text in your template</span>
                <span>Fill with</span>
                <span />
              </div>

              {/* Rows */}
              <div className="space-y-2">
                {pairs.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_200px_32px] items-center gap-3">
                    <input
                      type="text"
                      value={p.search}
                      placeholder="e.g. ____________ or [Tenant Name]"
                      onChange={(e) => updatePair(i, "search", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-700 placeholder:font-sans placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                    <select
                      value={p.token}
                      onChange={(e) => updatePair(i, "token", e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    >
                      <optgroup label="Lease data">
                        {Object.entries(TOKEN_LABELS).map(([token, label]) => (
                          <option key={token} value={token}>{label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="E-signature (DocuSeal)">
                        {SIGNATURE_TAGS.map(({ label, tag }) => (
                          <option key={tag} value={tag}>{label}</option>
                        ))}
                      </optgroup>
                    </select>
                    <button
                      type="button"
                      onClick={() => removePair(i)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500"
                      aria-label="Remove"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {pairs.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">
                  No placeholders yet. Add one below or re-upload the template to auto-detect.
                </p>
              )}

              {/* Add row */}
              <button
                type="button"
                onClick={addPair}
                className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Add placeholder
              </button>

              {/* Signature tags reference */}
              <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  E-signature tags
                </p>
                <p className="mb-3 text-xs text-blue-600">
                  Paste these into your Word document where each person should sign. DocuSeal auto-places the signature field there.
                </p>
                <div className="space-y-1.5">
                  {SIGNATURE_TAGS.map(({ label, tag }) => (
                    <div key={tag} className="flex items-center gap-2">
                      <code className="flex-1 rounded-md border border-blue-200 bg-white px-2 py-1 font-mono text-xs text-slate-700 select-all">
                        {tag}
                      </code>
                      <span className="w-36 shrink-0 text-xs text-blue-600">{label}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(tag);
                          setCopiedTag(tag);
                          setTimeout(() => setCopiedTag(null), 1500);
                        }}
                        className="shrink-0 rounded-md border border-blue-200 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        {copiedTag === tag ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || loading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save placeholders"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaseTemplateButton({
  propertyId,
  templates,
  uploading,
  onUpload,
  onUploadDirect,
  onDelete,
  onReview,
}: {
  propertyId: string;
  templates: LeaseTemplate[];
  uploading: boolean;
  onUpload: () => void;
  onUploadDirect: () => void;
  onDelete: (id: string) => void;
  onReview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [modalOpen, setModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeTemplate = templates.find((t) => t.isActive) ?? templates[0] ?? null;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        ref.current && !ref.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < menuHeight && rect.top > menuHeight) {
      setMenuStyle({ position: "fixed", bottom: window.innerHeight - rect.top, left: rect.left, width: 208 });
    } else {
      setMenuStyle({ position: "fixed", top: rect.bottom + 4, left: rect.left, width: 208 });
    }
  }, [open]);

  if (uploading) {
    return (
      <button disabled className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-400">
        Reviewing template…
      </button>
    );
  }

  if (!activeTemplate) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onUpload}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <UploadIcon className="h-4 w-4" />
          Upload template
        </button>
        <button
          type="button"
          onClick={onUploadDirect}
          className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
        >
          Skip review
        </button>
      </div>
    );
  }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 max-w-[200px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
        >
          <span className="truncate">{activeTemplate.name}</span>
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
        </button>
        {open && createPortal(
          <div ref={menuRef} style={{ ...menuStyle, zIndex: 9999 }} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            <a
              href={`/api/properties/${propertyId}/lease-templates/${activeTemplate.id}/file`}
              download={activeTemplate.fileName}
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <DownloadIcon className="h-4 w-4 shrink-0" />
              Download
            </a>
            <button
              type="button"
              onClick={() => { setOpen(false); setModalOpen(true); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
                <path d="M9 12h6M9 16h4"/>
              </svg>
              Placeholders
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onReview(); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50"
            >
              <SparklesIcon className="h-4 w-4 shrink-0" />
              AI Review
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onUpload(); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <UploadIcon className="h-4 w-4 shrink-0" />
              Replace
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onUploadDirect(); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <UploadIcon className="h-4 w-4 shrink-0" />
              Replace (skip review)
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete(activeTemplate.id); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
            >
              <TrashIcon className="h-4 w-4 shrink-0" />
              Delete
            </button>
          </div>,
          document.body
        )}
      </div>
      {modalOpen && (
        <PlaceholdersModal
          propertyId={propertyId}
          template={activeTemplate}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ─── Lease Review Panel ───────────────────────────────────────────────────────

const REVIEW_STATUS_MESSAGES = [
  "Reading your lease…",
  "Analyzing clauses…",
  "Checking for gaps…",
  "Reviewing state law…",
  "Almost done…",
];

const RISK_COLORS = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

const IMPORTANCE_COLORS = {
  critical: "bg-red-100 text-red-800",
  important: "bg-amber-100 text-amber-800",
  recommended: "bg-slate-100 text-slate-700",
};

const STATE_LAW_COLORS = {
  info: "bg-blue-50 border-blue-200 text-blue-800",
  caution: "bg-amber-50 border-amber-200 text-amber-800",
  warning: "bg-red-50 border-red-200 text-red-800",
};

function ReviewAccordion({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900 text-sm">{title}</span>
        <div className="flex items-center gap-2 shrink-0">
          {count !== undefined && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{count}</span>
          )}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && <div className="px-6 pb-5">{children}</div>}
    </div>
  );
}

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="rounded bg-amber-100 px-0.5 font-semibold text-amber-900 not-italic">{part}</mark>
      : part,
  );
}

function SummaryBody({ text }: { text: string }) {
  const firstItem = text.indexOf("(1)");
  if (firstItem === -1) {
    return <p className="text-sm leading-relaxed text-gray-700">{renderBold(text)}</p>;
  }
  const intro = text.slice(0, firstItem).trim();
  const itemsText = text.slice(firstItem).trim();
  const items = itemsText
    .split(/\s*\(\d+\)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="space-y-3">
      {intro && <p className="text-sm leading-relaxed text-gray-700">{renderBold(intro)}</p>}
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">{i + 1}</span>
            <span className="leading-relaxed">{renderBold(item.replace(/[.;]\s*$/, ""))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}



function LeaseReviewPanel({
  open,
  loading,
  error,
  data,
  templateName,
  isPending,
  confirming,
  onClose,
  onRetry,
  onConfirm,
  onDiscard,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  data: LeaseReview | null;
  templateName: string;
  isPending: boolean;
  confirming: boolean;
  onClose: () => void;
  onRetry: () => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => {
      setStatusIdx((i) => (i + 1) % REVIEW_STATUS_MESSAGES.length);
    }, 2800);
    return () => clearInterval(iv);
  }, [loading]);

  if (!open) return null;

  const riskLabel = data?.overallRiskLevel ? data.overallRiskLevel.charAt(0).toUpperCase() + data.overallRiskLevel.slice(1) : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 print:hidden" onClick={onClose} />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl print:static print:shadow-none print:max-w-none">
        {/* Disclaimer — always visible */}
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800 leading-snug">
          <strong>AI-generated suggestions are informational only and are not legal advice.</strong> Please consult a qualified attorney for legal review.
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <SparklesIcon className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="truncate text-sm font-semibold text-gray-900">{templateName}</span>
            {riskLabel && (
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${RISK_COLORS[data!.overallRiskLevel]}`}>
                {riskLabel} risk
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 ml-3">
            {data && (
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Print
              </button>
            )}
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors" aria-label="Close review panel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
              <svg className="h-8 w-8 animate-spin text-emerald-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm font-medium text-gray-600">{REVIEW_STATUS_MESSAGES[statusIdx]}</p>
            </div>
          )}

          {!loading && error && (
            <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-semibold text-red-800">Could not complete review</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex h-8 items-center rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && data && (() => {
            const riskOrder = { high: 0, medium: 1, low: 2 } as const;
            const importanceOrder = { critical: 0, important: 1, recommended: 2 } as const;
            const stateRiskOrder = { warning: 0, caution: 1, info: 2 } as const;
            const clauseSummaries = (data.clauseSummaries ?? []).slice().sort((a, b) => (riskOrder[a.riskLevel] ?? 1) - (riskOrder[b.riskLevel] ?? 1));
            const missingConcepts = (data.missingConcepts ?? []).slice().sort((a, b) => (importanceOrder[a.importance] ?? 1) - (importanceOrder[b.importance] ?? 1));
            const inconsistencies = (data.inconsistencies ?? []).slice().sort((a, b) => (riskOrder[a.severity] ?? 1) - (riskOrder[b.severity] ?? 1));
            const stateLawNotes = (data.stateLawNotes ?? []).slice().sort((a, b) => (stateRiskOrder[a.risk] ?? 1) - (stateRiskOrder[b.risk] ?? 1));
            const readabilitySuggestions = data.readabilitySuggestions ?? [];
            return (
            <div className="divide-y divide-gray-100">
              {/* Executive summary */}
              <div className="px-6 py-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Summary</p>
                <div className={`rounded-lg border-l-4 bg-gray-50 px-4 py-3 ${data.overallRiskLevel === "high" ? "border-red-400" : data.overallRiskLevel === "medium" ? "border-amber-400" : "border-green-400"}`}>
                  <SummaryBody text={data.executiveSummary ?? ""} />
                </div>
              </div>

              {/* 1. Clause Analysis */}
              <ReviewAccordion title="Clause Analysis" count={clauseSummaries.length}>
                <div className="space-y-3">
                  {clauseSummaries.length === 0 && <p className="text-sm text-gray-400">No clauses identified.</p>}
                  {clauseSummaries.map((c, i) => (
                    <ClauseCard key={i} clause={c} />
                  ))}
                </div>
              </ReviewAccordion>

              {/* 2. Missing Sections */}
              <ReviewAccordion title="Missing Sections" count={missingConcepts.length}>
                <div className="space-y-2">
                  {missingConcepts.length === 0 && <p className="text-sm text-gray-400">No missing sections detected.</p>}
                  {missingConcepts.map((m, i) => (
                    <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">{m.concept}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${IMPORTANCE_COLORS[m.importance] ?? "bg-slate-100 text-slate-700"}`}>{m.importance}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{m.description}</p>
                    </div>
                  ))}
                </div>
              </ReviewAccordion>

              {/* 3. Inconsistencies */}
              <ReviewAccordion title="Inconsistencies" count={inconsistencies.length}>
                <div className="space-y-2">
                  {inconsistencies.length === 0 && <p className="text-sm text-gray-400">No inconsistencies detected.</p>}
                  {inconsistencies.map((inc, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_COLORS[inc.severity] ?? "bg-gray-100 text-gray-700"}`}>{inc.severity}</span>
                      <p className="text-sm text-gray-700">{inc.description}</p>
                    </div>
                  ))}
                </div>
              </ReviewAccordion>

              {/* 4. State Law Notes */}
              <ReviewAccordion title="State Law Notes" count={stateLawNotes.length}>
                <div className="space-y-2">
                  {stateLawNotes.length === 0 && <p className="text-sm text-gray-400">No state law notes.</p>}
                  {stateLawNotes.map((n, i) => (
                    <div key={i} className={`rounded-lg border p-3 ${STATE_LAW_COLORS[n.risk] ?? "bg-gray-50 border-gray-200 text-gray-800"}`}>
                      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{n.area}</p>
                      <p className="mt-1 text-sm">{n.note}</p>
                    </div>
                  ))}
                </div>
              </ReviewAccordion>

              {/* 5. Readability */}
              <ReviewAccordion title="Readability Suggestions" count={readabilitySuggestions.length}>
                <div className="space-y-3">
                  {readabilitySuggestions.length === 0 && <p className="text-sm text-gray-400">No readability suggestions.</p>}
                  {readabilitySuggestions.map((r, i) => (
                    <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{r.section}</p>
                      <p className="mt-1 text-sm font-medium text-gray-800">{r.issue}</p>
                      <p className="mt-1 text-sm text-gray-600">{r.suggestion}</p>
                    </div>
                  ))}
                </div>
              </ReviewAccordion>

              {/* Bottom disclaimer (visible in print) */}
              <div className="px-6 py-5 text-xs text-gray-400">
                AI-generated suggestions are informational only and are not legal advice. Please consult a qualified attorney for legal review.
              </div>
            </div>
            );
          })()}
        </div>

        {/* Confirm / Discard footer — only shown for pending (not-yet-saved) uploads */}
        {isPending && !loading && (
          <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4 print:hidden">
            <p className="mb-3 text-sm text-gray-600">
              Review the findings above. Click <strong>Confirm Upload</strong> to save this template, or <strong>Discard</strong> to cancel.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirming}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {confirming ? "Saving…" : "Confirm Upload"}
              </button>
              <button
                type="button"
                onClick={onDiscard}
                disabled={confirming}
                className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ClauseCard({ clause }: { clause: LeaseReview["clauseSummaries"][number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">{clause.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_COLORS[clause.riskLevel]}`}>{clause.riskLevel}</span>
      </div>
      <p className="mt-1 text-sm text-gray-600">{clause.summary}</p>
      {clause.explanation && (
        <>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1.5 text-xs text-emerald-700 hover:underline">
            {expanded ? "Show less" : "Why this risk level?"}
          </button>
          {expanded && <p className="mt-1.5 text-xs text-gray-500">{clause.explanation}</p>}
        </>
      )}
    </div>
  );
}

// ─── Unit Card Menu ───────────────────────────────────────────────────────────

function UnitCardMenu({
  unit,
  onEdit,
  onActivate,
  onDeactivate,
  onRentCredit,
  canManageUnits,
  canInviteRenters,
}: {
  unit: UnitDetails;
  onEdit: (unit: UnitDetails) => void;
  onActivate: (unit: UnitDetails) => void;
  onDeactivate: (unit: UnitDetails) => void;
  onRentCredit: (unit: UnitDetails) => void;
  canManageUnits: boolean;
  canInviteRenters: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!canManageUnits) {
    return null;
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Unit options"
      >
        <MoreVerticalIcon className="h-4 w-4 text-gray-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(unit); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <EditIcon className="h-4 w-4" />
            Edit unit
          </button>
          {unit.activeLeaseId && unit.hasLeaseDocument && (
            <a
              href={`/api/leases/${unit.activeLeaseId}/document`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <LeaseDocumentIcon className="h-4 w-4" />
              View latest lease
            </a>
          )}
          {unit.activeLeaseId && canInviteRenters && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onRentCredit(unit); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <RentCreditIcon className="h-4 w-4" />
              Payment plan
            </button>
          )}
          {unit.status === "inactive" ? (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onActivate(unit); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50"
            >
              <ActivateIcon className="h-4 w-4" />
              Activate
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDeactivate(unit); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50"
            >
              <DeactivateIcon className="h-4 w-4" />
              Deactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Unit Card ────────────────────────────────────────────────────────────────

function UnitCard({
  unit,
  onEdit,
  onActivate,
  onDeactivate,
  onRentCredit,
  onOnboardRenter,
  onSyncSignature,
  syncingLeaseId,
  savingStatus,
  canManageUnits,
  canInviteRenters,
  onboarded,
}: {
  unit: UnitDetails;
  onEdit: (unit: UnitDetails) => void;
  onActivate: (unit: UnitDetails) => void;
  onDeactivate: (unit: UnitDetails) => void;
  onRentCredit: (unit: UnitDetails) => void;
  onOnboardRenter: (unit: UnitDetails) => void;
  onSyncSignature: (leaseId: string) => void;
  syncingLeaseId: string | null;
  savingStatus: boolean;
  canManageUnits: boolean;
  canInviteRenters: boolean;
  onboarded: boolean;
}) {
  const accentColor =
    unit.status === "occupied"
      ? "bg-emerald-500"
      : unit.status === "vacant"
      ? "bg-blue-400"
      : unit.status === "maintenance"
      ? "bg-amber-400"
      : unit.status === "inactive"
      ? "bg-gray-300"
      : "bg-gray-300";

  function openEditUnit() {
    if (canManageUnits) onEdit(unit);
  }

  return (
    <div
      role={canManageUnits ? "button" : undefined}
      tabIndex={canManageUnits ? 0 : undefined}
      onClick={openEditUnit}
      onKeyDown={(e) => {
        if (!canManageUnits) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openEditUnit();
        }
      }}
      className={[
        "group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm transition-all hover:shadow-md",
        canManageUnits ? "cursor-pointer hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30" : "",
      ].join(" ")}
    >
      {/* Status accent bar */}
      <div className={`h-1 w-full ${accentColor}`} />

      {/* Top row */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3">
        <div>
          <p className="text-base font-bold text-gray-900 tracking-tight">Unit {unit.unitNumber}</p>
          <span className={`mt-1.5 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(unit.status)}`}>
            {statusLabel(unit.status)}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Monthly Rent</p>
            <p className="text-xl font-bold text-gray-900">
              {unit.rentAmount !== null ? `$${unit.rentAmount.toLocaleString()}` : "—"}
            </p>
          </div>
          <UnitCardMenu
            unit={unit}
            onEdit={onEdit}
            onActivate={onActivate}
            onDeactivate={onDeactivate}
            onRentCredit={onRentCredit}
            canManageUnits={canManageUnits}
            canInviteRenters={canInviteRenters}
          />
        </div>
      </div>

      {/* Specs */}
      <div className="mx-5 my-3 grid grid-cols-3 divide-x divide-gray-100 rounded-xl bg-gray-50 px-1 py-2.5">
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Beds</p>
          <p className="text-sm font-bold text-gray-800">{unit.bedrooms} BD</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Baths</p>
          <p className="text-sm font-bold text-gray-800">{unit.bathrooms} BA</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Sq Ft</p>
          <p className="text-sm font-bold text-gray-800">
            {unit.squareFeet ? unit.squareFeet.toLocaleString() : "—"}
          </p>
        </div>
      </div>

      {/* Tenant section */}
      <div className="border-t border-gray-100 px-5 py-3">
        {unit.tenant ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 font-semibold text-sm">
              {unit.tenant.firstName[0]}{unit.tenant.lastName[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{unit.tenant.firstName} {unit.tenant.lastName}</p>
              <p className="truncate text-xs text-gray-500">{unit.tenant.email}</p>
              {unit.tenant.phone && (
                <p className="text-xs text-gray-400">{unit.tenant.phone}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1 text-center">
            {canInviteRenters && unit.status !== "inactive" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!onboarded) onOnboardRenter(unit);
                }}
                disabled={onboarded}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  onboarded
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600 cursor-default"
                    : "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                }`}
              >
                <SendIcon className="h-3.5 w-3.5" />
                {onboarded ? "Onboarded" : "Onboard New Tenant"}
              </button>
            )}
          </div>
        )}
      </div>

      {unit.pendingSignatureLeaseId && (
        <div className="border-t border-amber-100 bg-amber-50 px-5 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs text-amber-700">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span className="font-medium">Awaiting e-signatures</span>
            </div>
            <button
              type="button"
              onClick={() => onSyncSignature(unit.pendingSignatureLeaseId!)}
              disabled={syncingLeaseId === unit.pendingSignatureLeaseId}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
            >
              {syncingLeaseId === unit.pendingSignatureLeaseId ? (
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>
              )}
              Sync
            </button>
          </div>
        </div>
      )}

      {savingStatus && (
        <div className="border-t border-gray-100 px-5 py-2 text-center text-xs text-gray-400">
          Updating...
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PropertyDetailsClient({
  initialProperty,
  canManageProperties = false,
  canManageUnits = false,
  canInviteRenters = false,
}: {
  initialProperty: PropertyDetails;
  canManageProperties?: boolean;
  canManageUnits?: boolean;
  canInviteRenters?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [property, setProperty] = useState(initialProperty);
  const [editingProperty, setEditingProperty] = useState(false);
  const [propertyForm, setPropertyForm] = useState<PropertyFormState>({
    name: initialProperty.name,
    type: initialProperty.type,
    address: initialProperty.address,
    city: initialProperty.city,
    state: initialProperty.state,
    zip: initialProperty.zip,
    description: initialProperty.description,
  });
  const [savingProperty, setSavingProperty] = useState(false);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [leaseTemplates, setLeaseTemplates] = useState<LeaseTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const templateFileRef = useRef<HTMLInputElement>(null);
  const templateFileDirectRef = useRef<HTMLInputElement>(null);

  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [reviewData, setReviewData] = useState<LeaseReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewingTemplateId, setReviewingTemplateId] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ blobUrl: string; contentType: string; fileName: string; name: string; review: LeaseReview } | null>(null);
  const [confirmingUpload, setConfirmingUpload] = useState(false);

  // Unit state
  const [unitSearch, setUnitSearch] = useState("");
  const [unitStatusFilter, setUnitStatusFilter] = useState("all");
  const [savingUnitStatusId, setSavingUnitStatusId] = useState<string | null>(null);
  const [syncingLeaseId, setSyncingLeaseId] = useState<string | null>(null);

  // Edit unit modal
  const [editingUnit, setEditingUnit] = useState<UnitDetails | null>(null);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [unitFieldErrors, setUnitFieldErrors] = useState<UnitFieldErrors>({});
  const [savingUnit, setSavingUnit] = useState(false);

  // Add unit modal
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitForm, setNewUnitForm] = useState(emptyUnitForm);
  const [newUnitFieldErrors, setNewUnitFieldErrors] = useState<UnitFieldErrors>({});
  const [savingNewUnit, setSavingNewUnit] = useState(false);
  const unitFieldRefs = useRef<Partial<Record<keyof UnitFormState, HTMLInputElement | HTMLSelectElement | null>>>({});

  // Deactivate unit confirmation
  const [deactivatingUnit, setDeactivatingUnit] = useState<UnitDetails | null>(null);

  // Rent credit
  const [rentCreditUnit, setRentCreditUnit] = useState<UnitDetails | null>(null);

  // Onboard tenant state
  const [onboardingUnitId, setOnboardingUnitId] = useState<string | null>(null);
  const [onboardedUnitIds, setOnboardedUnitIds] = useState<Set<string>>(new Set());

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalUnits = property.units.length;
  const occupiedCount = property.units.filter((u) => u.status === "occupied").length;
  const vacantCount = property.units.filter((u) => u.status === "vacant").length;
  const revenue = property.units
    .filter((u) => u.status === "occupied" && u.rentAmount !== null)
    .reduce((sum, u) => sum + (u.rentAmount ?? 0), 0);

  // ── Filtered units ─────────────────────────────────────────────────────────

  const filteredUnits = useMemo(() => {
    const q = unitSearch.trim().toLowerCase();
    return property.units.filter((u) => {
      const matchesStatus = unitStatusFilter === "all" || u.status === unitStatusFilter;
      const matchesSearch = !q || u.unitNumber.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [property.units, unitSearch, unitStatusFilter]);

  const addWithAiHref = `/ai-import?propertyId=${property.id}&name=${encodeURIComponent(property.name)}&type=${encodeURIComponent(property.type)}&address=${encodeURIComponent(property.address)}&city=${encodeURIComponent(property.city)}&state=${encodeURIComponent(property.state)}&zip=${encodeURIComponent(property.zip)}`;

  useEffect(() => {
    if (canManageProperties) void loadLeaseTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function notify(msg: string) {
    toast.success(msg, { title: "Property" });
  }

  function fail(msg: string) {
    toast.error(msg, { title: "Property" });
  }

  function validateUnitForm(form: UnitFormState) {
    const errors: UnitFieldErrors = {};
    if (!form.unitNumber.trim()) errors.unitNumber = "Unit number is required.";
    if (form.bedrooms.trim() === "" || Number(form.bedrooms) < 0) errors.bedrooms = "Bedrooms is required.";
    if (form.bathrooms.trim() === "" || Number(form.bathrooms) <= 0) errors.bathrooms = "Bathrooms is required.";
    if (form.squareFeet.trim() === "" || Number(form.squareFeet) <= 0) errors.squareFeet = "Sq ft is required.";
    if (form.rentAmount.trim() === "" || Number(form.rentAmount) <= 0) errors.rentAmount = "Monthly rent is required.";
    return errors;
  }

  function openPropertyEdit() {
    setPropertyForm({
      name: property.name,
      type: property.type,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
      description: property.description,
    });
    setPropertyError(null);
    setEditingProperty(true);
  }

  function setPropertyField(field: keyof PropertyFormState, value: string) {
    setPropertyForm((form) => ({ ...form, [field]: field === "state" ? value.toUpperCase() : value }));
  }

  async function loadLeaseTemplates() {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await fetch(`/api/properties/${property.id}/lease-templates`);
      const data = (await res.json()) as { error?: string; templates?: LeaseTemplate[] };
      if (!res.ok) throw new Error(data.error ?? "Could not load lease templates.");
      setLeaseTemplates(data.templates ?? []);
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Could not load lease templates.");
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function preReviewTemplate(file: File) {
    setUploadingTemplate(true);
    setTemplatesError(null);
    setReviewError(null);
    setReviewData(null);
    setPendingUpload(null);
    setReviewLoading(true);
    setReviewPanelOpen(true);
    setReviewingTemplateId(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("name", file.name.replace(/\.[^.]+$/, "") || "Lease template");
      const res = await fetch(`/api/properties/${property.id}/lease-templates/pre-review`, {
        method: "POST",
        body,
      });
      const text = await res.text();
      if (!text) throw new Error("Server returned an empty response. Please try again.");
      let data: { error?: string; review?: LeaseReview; blobUrl?: string; contentType?: string; fileName?: string; name?: string };
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error("Unexpected server response. Please try again.");
      }
      if (!res.ok) throw new Error(data.error ?? "Could not analyze lease.");
      setReviewData(data.review as LeaseReview);
      setPendingUpload({
        blobUrl: data.blobUrl!,
        contentType: data.contentType!,
        fileName: data.fileName!,
        name: data.name!,
        review: data.review as LeaseReview,
      });
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not analyze lease.");
    } finally {
      setUploadingTemplate(false);
      setReviewLoading(false);
    }
  }

  async function confirmUpload() {
    if (!pendingUpload) return;
    setConfirmingUpload(true);
    try {
      const res = await fetch(`/api/properties/${property.id}/lease-templates/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobUrl: pendingUpload.blobUrl,
          contentType: pendingUpload.contentType,
          fileName: pendingUpload.fileName,
          name: pendingUpload.name,
          reviewData: pendingUpload.review,
        }),
      });
      const data = (await res.json()) as { error?: string; template?: LeaseTemplate };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Could not save template.");
      setLeaseTemplates((templates) => [data.template!, ...templates.map((t) => ({ ...t, isActive: false }))]);
      setReviewingTemplateId(data.template!.id);
      setPendingUpload(null);
      setReviewPanelOpen(false);
      setReviewData(null);
      notify("Lease template uploaded.");
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Could not save template.");
    } finally {
      setConfirmingUpload(false);
    }
  }

  function discardUpload() {
    setPendingUpload(null);
    setReviewPanelOpen(false);
    setReviewData(null);
    setReviewError(null);
  }

  async function setActiveLeaseTemplate(templateId: string) {
    setTemplatesError(null);
    try {
      const res = await fetch(`/api/properties/${property.id}/lease-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const data = (await res.json()) as { error?: string; template?: LeaseTemplate };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Could not update template.");
      setLeaseTemplates((templates) => templates.map((t) => ({ ...t, isActive: t.id === templateId })));
      notify("Active lease template updated.");
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Could not update template.");
    }
  }

  async function deleteLeaseTemplate(templateId: string) {
    setTemplatesError(null);
    try {
      const res = await fetch(`/api/properties/${property.id}/lease-templates/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Could not delete template.");
      }
      setLeaseTemplates((templates) => templates.filter((t) => t.id !== templateId));
      notify("Lease template removed.");
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Could not delete template.");
    }
  }

  async function uploadLeaseTemplateDirect(file: File) {
    setUploadingTemplate(true);
    setTemplatesError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("name", file.name.replace(/\.[^.]+$/, "") || "Lease template");
      const res = await fetch(`/api/properties/${property.id}/lease-templates`, {
        method: "POST",
        body,
      });
      const data = (await res.json()) as { error?: string; template?: LeaseTemplate };
      if (!res.ok || !data.template) throw new Error(data.error ?? "Could not upload template.");
      setLeaseTemplates((templates) => [data.template!, ...templates.map((t) => ({ ...t, isActive: false }))]);
      notify("Lease template uploaded.");
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Could not upload template.");
    } finally {
      setUploadingTemplate(false);
    }
  }

  async function runLeaseReview(templateId: string) {
    setReviewingTemplateId(templateId);
    setReviewLoading(true);
    setReviewError(null);
    setReviewData(null);
    setReviewPanelOpen(true);
    try {
      const res = await fetch(`/api/properties/${property.id}/lease-templates/${templateId}/review`, { method: "POST" });
      const text = await res.text();
      if (!text) throw new Error("Server returned an empty response. Please try again.");
      let data: { error?: string } & Partial<LeaseReview>;
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error("Unexpected server response. Please try again.");
      }
      if (!res.ok) throw new Error(data.error ?? "Could not analyze lease.");
      setReviewData(data as LeaseReview);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not analyze lease.");
    } finally {
      setReviewLoading(false);
    }
  }

  async function saveProperty(e: React.FormEvent) {
    e.preventDefault();
    setPropertyError(null);
    setSavingProperty(true);
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(propertyForm),
      });
      const data = await res.json() as {
        error?: string;
        property?: {
          id: string;
          name: string;
          type: string;
          address: string;
          city: string;
          state: string;
          zip: string;
          description: string | null;
        };
      };
      if (!res.ok || !data.property) throw new Error(data.error ?? "Could not update property.");
      setProperty((current) => ({
        ...current,
        name: data.property!.name,
        type: data.property!.type,
        address: data.property!.address,
        city: data.property!.city,
        state: data.property!.state,
        zip: data.property!.zip,
        description: data.property!.description ?? "",
      }));
      setEditingProperty(false);
      notify("Property updated.");
      router.refresh();
    } catch (err) {
      setPropertyError(err instanceof Error ? err.message : "Could not update property.");
    } finally {
      setSavingProperty(false);
    }
  }

  function focusFirstUnitError(errors: UnitFieldErrors) {
    const firstInvalidField = requiredUnitFields.find(({ field }) => errors[field])?.field;
    if (firstInvalidField) unitFieldRefs.current[firstInvalidField]?.focus();
  }

  function setUnitFieldRef(field: keyof UnitFormState, node: HTMLInputElement | HTMLSelectElement | null) {
    unitFieldRefs.current[field] = node;
  }

  function setNewUnitField(field: keyof UnitFormState, value: string) {
    setNewUnitForm((form) => ({ ...form, [field]: value }));
    if (newUnitFieldErrors[field]) {
      setNewUnitFieldErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  function setEditingUnitField(field: keyof UnitFormState, value: string) {
    setUnitForm((form) => ({ ...form, [field]: value }));
    if (unitFieldErrors[field]) {
      setUnitFieldErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  async function createUnit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validateUnitForm(newUnitForm);
    if (Object.keys(validationErrors).length > 0) {
      setNewUnitFieldErrors(validationErrors);
      focusFirstUnitError(validationErrors);
      return;
    }
    setNewUnitFieldErrors({});
    setSavingNewUnit(true);
    try {
      const res = await fetch(`/api/properties/${property.id}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitNumber: newUnitForm.unitNumber,
          bedrooms: Number(newUnitForm.bedrooms),
          bathrooms: Number(newUnitForm.bathrooms),
          squareFeet: Number(newUnitForm.squareFeet),
          rentAmount: Number(newUnitForm.rentAmount),
          status: newUnitForm.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create unit.");
      const created: UnitDetails = {
        id: data.unit.id,
        unitNumber: data.unit.unit_number,
        bedrooms: data.unit.bedrooms,
        bathrooms: Number(data.unit.bathrooms),
        squareFeet: data.unit.square_feet,
        rentAmount: data.unit.rent_amount === null ? null : Number(data.unit.rent_amount),
        status: data.unit.status,
        hasActiveLease: false,
        activeLeaseId: null,
        hasLeaseDocument: false,
        pendingSignatureLeaseId: null,
        futurePaymentCount: 0,
        tenant: null,
      };
      setProperty((p) => ({
        ...p,
        units: [...p.units, created].sort((a, b) =>
          a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
        ),
      }));
      setAddingUnit(false);
      setNewUnitForm(emptyUnitForm);
      setNewUnitFieldErrors({});
      notify(`Unit ${created.unitNumber} added.`);
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not create unit.");
    } finally {
      setSavingNewUnit(false);
    }
  }

  async function saveUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUnit) return;
    const validationErrors = validateUnitForm(unitForm);
    if (Object.keys(validationErrors).length > 0) {
      setUnitFieldErrors(validationErrors);
      focusFirstUnitError(validationErrors);
      return;
    }
    setUnitFieldErrors({});
    setSavingUnit(true);
    try {
      const res = await fetch(`/api/properties/${property.id}/units/${editingUnit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitNumber: unitForm.unitNumber,
          bedrooms: Number(unitForm.bedrooms),
          bathrooms: Number(unitForm.bathrooms),
          squareFeet: Number(unitForm.squareFeet),
          rentAmount: Number(unitForm.rentAmount),
          status: unitForm.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update unit.");
      const updated: UnitDetails = {
        id: data.unit.id,
        unitNumber: data.unit.unit_number,
        bedrooms: data.unit.bedrooms,
        bathrooms: Number(data.unit.bathrooms),
        squareFeet: data.unit.square_feet,
        rentAmount: data.unit.rent_amount === null ? null : Number(data.unit.rent_amount),
        status: data.unit.status,
        hasActiveLease: editingUnit.hasActiveLease,
        activeLeaseId: editingUnit.activeLeaseId,
        hasLeaseDocument: editingUnit.hasLeaseDocument,
        pendingSignatureLeaseId: editingUnit.pendingSignatureLeaseId,
        futurePaymentCount: editingUnit.futurePaymentCount,
        tenant: editingUnit?.tenant ?? null,
      };
      setProperty((p) => ({
        ...p,
        units: p.units
          .map((u) => (u.id === updated.id ? updated : u))
          .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })),
      }));
      setEditingUnit(null);
      setUnitFieldErrors({});
      notify(`Unit ${updated.unitNumber} updated.`);
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not update unit.");
    } finally {
      setSavingUnit(false);
    }
  }

  function handleOnboardSuccess(unitId: string, options?: { pendingSignature?: boolean }) {
    setOnboardedUnitIds((prev) => new Set(prev).add(unitId));
    if (!options?.pendingSignature) {
      setProperty((p) => ({
        ...p,
        units: p.units.map((u) => u.id === unitId ? { ...u, status: "occupied" } : u),
      }));
    }
    notify(options?.pendingSignature ? "Lease sent for e-signature." : "Tenant onboarded successfully.");
    router.refresh();
  }

  async function syncSignature(leaseId: string) {
    setSyncingLeaseId(leaseId);
    try {
      const res = await fetch(`/api/leases/${leaseId}/signature/sync`, { method: "POST" });
      const data = await res.json() as { synced?: boolean; status?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not sync signature status.");
      if (data.status === "completed") {
        notify("All signatures complete — lease is now active.");
        router.refresh();
      } else {
        notify(`Signature status: ${data.status ?? "pending"}. Not all parties have signed yet.`);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncingLeaseId(null);
    }
  }

  async function confirmDeactivateUnit() {
    if (!deactivatingUnit) return;
    setSavingUnitStatusId(deactivatingUnit.id);
    try {
      const res = await fetch(`/api/properties/${property.id}/units/${deactivatingUnit.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not deactivate unit.");
      setProperty((p) => ({
        ...p,
        units: p.units.map((u) =>
          u.id === deactivatingUnit.id
            ? { ...u, status: "inactive", futurePaymentCount: 0 }
            : u,
        ),
      }));
      const cancelledCount = Number(data.cancelledFuturePaymentCount ?? 0);
      notify(
        cancelledCount > 0
          ? `Unit ${deactivatingUnit.unitNumber} deactivated. ${cancelledCount} future payment${cancelledCount === 1 ? "" : "s"} cancelled.`
          : `Unit ${deactivatingUnit.unitNumber} deactivated.`,
      );
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not deactivate unit.");
    } finally {
      setSavingUnitStatusId(null);
      setDeactivatingUnit(null);
    }
  }

  async function activateUnit(unit: UnitDetails) {
    setSavingUnitStatusId(unit.id);
    try {
      const res = await fetch(`/api/properties/${property.id}/units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitNumber: unit.unitNumber,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          squareFeet: unit.squareFeet,
          rentAmount: unit.rentAmount,
          status: "vacant",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not activate unit.");
      setProperty((p) => ({
        ...p,
        units: p.units.map((u) => (u.id === unit.id ? { ...u, status: "vacant" } : u)),
      }));
      notify(`Unit ${unit.unitNumber} activated.`);
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not activate unit.");
    } finally {
      setSavingUnitStatusId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Property header */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
          {/* Image placeholder */}
          <div className="flex h-44 w-full shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 sm:h-44 sm:w-52">
            <BuildingIcon className="h-16 w-16 text-slate-500" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      property.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {property.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                  <MapPinIcon className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{property.address}, {property.city}, {property.state} {property.zip}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                  <HomeIcon className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{getPropertyTypeLabel(property.type)}</span>
                </div>
              </div>
              {canManageProperties && (
                <div className="flex items-center gap-2">
                  <LeaseTemplateButton
                    propertyId={property.id}
                    templates={leaseTemplates}
                    uploading={uploadingTemplate}
                    onUpload={() => templateFileRef.current?.click()}
                    onUploadDirect={() => templateFileDirectRef.current?.click()}
                    onDelete={(id) => void deleteLeaseTemplate(id)}
                    onReview={() => {
                      const active = leaseTemplates.find((t) => t.isActive) ?? leaseTemplates[0] ?? null;
                      if (active) void runLeaseReview(active.id);
                    }}
                  />
                  <button
                    type="button"
                    onClick={openPropertyEdit}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <EditIcon className="h-4 w-4" />
                    Edit property
                  </button>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-600">Total Units</p>
                <p className="mt-1 text-2xl font-bold text-blue-900">{totalUnits}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs text-green-600">Occupied</p>
                <p className="mt-1 text-2xl font-bold text-green-900">{occupiedCount}</p>
              </div>
              <div className="rounded-lg bg-yellow-50 p-3">
                <p className="text-xs text-yellow-600">Vacant</p>
                <p className="mt-1 text-2xl font-bold text-yellow-900">{vacantCount}</p>
              </div>
              <div className="rounded-lg bg-purple-50 p-3">
                <p className="text-xs text-purple-600">Revenue</p>
                <p className="mt-1 text-xl font-bold text-purple-900">
                  ${revenue.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {canManageProperties && (
        <>
          <input
            ref={templateFileRef}
            type="file"
            accept=".pdf,.docx,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf,text/rtf"
            className="sr-only"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void preReviewTemplate(picked);
              e.target.value = "";
            }}
          />
          <input
            ref={templateFileDirectRef}
            type="file"
            accept=".pdf,.docx,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf,text/rtf"
            className="sr-only"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void uploadLeaseTemplateDirect(picked);
              e.target.value = "";
            }}
          />
        </>
      )}

      {/* Apartments section */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Section header */}
        <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-gray-900">Apartments</h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search units..."
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
                className="h-9 w-44 rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            {/* Status filter */}
            <select
              value={unitStatusFilter}
              onChange={(e) => setUnitStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="all">All Status</option>
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>
            {/* Add units */}
            {canManageUnits ? (
              <>
                <Link
                  href={addWithAiHref}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <SparklesIcon className="h-4 w-4" />
                  Add with AI
                </Link>
                <button
                onClick={() => { setAddingUnit(true); setNewUnitForm(emptyUnitForm); setNewUnitFieldErrors({}); }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Unit
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Unit grid */}
        <div className="p-5">
          {filteredUnits.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <HomeIcon className="h-10 w-10 text-gray-200" />
              <p className="text-sm text-gray-500">
                {unitSearch || unitStatusFilter !== "all" ? "No units match that filter." : "No units yet. Add your first unit."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredUnits.map((unit) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  onEdit={(u) => { setEditingUnit(u); setUnitForm(unitFormFromUnit(u)); setUnitFieldErrors({}); }}
                  onActivate={activateUnit}
                  onDeactivate={(u) => setDeactivatingUnit(u)}
                  onRentCredit={(u) => setRentCreditUnit(u)}
                  onOnboardRenter={(u) => setOnboardingUnitId(u.id)}
                  onSyncSignature={syncSignature}
                  syncingLeaseId={syncingLeaseId}
                  savingStatus={savingUnitStatusId === unit.id}
                  canManageUnits={canManageUnits}
                  canInviteRenters={canInviteRenters}
                  onboarded={onboardedUnitIds.has(unit.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}

      {canManageProperties && editingProperty && (
        <Modal title="Edit property" onClose={() => setEditingProperty(false)} maxWidthClassName="max-w-2xl">
          <form onSubmit={saveProperty} noValidate className="space-y-5">
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property details</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-xs font-medium text-slate-700 sm:col-span-2">
                  Property name
                  <input className={modalInputClass} value={propertyForm.name} onChange={(e) => setPropertyField("name", e.target.value)} />
                </label>
                <label className="block space-y-1 text-xs font-medium text-slate-700">
                  Type
                  <select className={modalInputClass} value={propertyForm.type} onChange={(e) => setPropertyField("type", e.target.value)}>
                    {PROPERTY_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-xs font-medium text-slate-700 sm:col-span-2">
                  Street address
                  <input className={modalInputClass} value={propertyForm.address} onChange={(e) => setPropertyField("address", e.target.value)} />
                </label>
                <label className="block space-y-1 text-xs font-medium text-slate-700">
                  City
                  <input className={modalInputClass} value={propertyForm.city} onChange={(e) => setPropertyField("city", e.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1 text-xs font-medium text-slate-700">
                    State
                    <input className={modalInputClass} maxLength={2} value={propertyForm.state} onChange={(e) => setPropertyField("state", e.target.value)} />
                  </label>
                  <label className="block space-y-1 text-xs font-medium text-slate-700">
                    Zip
                    <input className={modalInputClass} value={propertyForm.zip} onChange={(e) => setPropertyField("zip", e.target.value)} />
                  </label>
                </div>
                <label className="block space-y-1 text-xs font-medium text-slate-700 sm:col-span-2">
                  Description
                  <textarea className={`${modalInputClass} resize-none`} rows={3} value={propertyForm.description} onChange={(e) => setPropertyField("description", e.target.value)} />
                </label>
              </div>
            </section>

            {propertyError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{propertyError}</p>}
            <ModalActions
              onCancel={() => setEditingProperty(false)}
              submitLabel={savingProperty ? "Saving..." : "Save property"}
              disabled={savingProperty}
            />
          </form>
        </Modal>
      )}

      {/* Add unit */}
      {canManageUnits && addingUnit && (
        <Modal title="Add Unit" onClose={() => { setAddingUnit(false); setNewUnitFieldErrors({}); }}>
          <form onSubmit={createUnit} noValidate className="space-y-4">
            <UnitFormFields
              form={newUnitForm}
              fieldErrors={newUnitFieldErrors}
              setFieldRef={setUnitFieldRef}
              onChange={setNewUnitField}
            />
            <ModalActions
              onCancel={() => { setAddingUnit(false); setNewUnitFieldErrors({}); }}
              submitLabel={savingNewUnit ? "Adding…" : "Add Unit"}
              disabled={savingNewUnit}
            />
          </form>
        </Modal>
      )}

      {/* Edit unit */}
      {canManageUnits && editingUnit && (
        <Modal title={`Edit Unit ${editingUnit.unitNumber}`} onClose={() => { setEditingUnit(null); setUnitFieldErrors({}); }}>
          <form onSubmit={saveUnit} noValidate className="space-y-4">
            <UnitFormFields
              form={unitForm}
              fieldErrors={unitFieldErrors}
              setFieldRef={setUnitFieldRef}
              onChange={setEditingUnitField}
            />
            <ModalActions
              onCancel={() => { setEditingUnit(null); setUnitFieldErrors({}); }}
              submitLabel={savingUnit ? "Saving…" : "Save Unit"}
              disabled={savingUnit}
            />
          </form>
        </Modal>
      )}

      {/* Deactivate unit confirmation */}
      {canManageUnits && deactivatingUnit && (
        <Modal title="Deactivate unit?" onClose={() => setDeactivatingUnit(null)}>
          <p className="text-sm text-gray-600">
            Unit <span className="font-semibold text-gray-900">{deactivatingUnit.unitNumber}</span> will
            be marked inactive and kept on file.
          </p>
          {deactivatingUnit.hasActiveLease || deactivatingUnit.tenant ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Active lease warning</p>
              <p className="mt-1">
                This unit has an active lease
                {deactivatingUnit.tenant
                  ? ` for ${deactivatingUnit.tenant.firstName} ${deactivatingUnit.tenant.lastName}`
                  : ""}
                . Deactivating it will cancel all future pending payments
                for the active lease
                {deactivatingUnit.futurePaymentCount > 0
                  ? ` (${deactivatingUnit.futurePaymentCount} payment${deactivatingUnit.futurePaymentCount === 1 ? "" : "s"}).`
                  : "."}
              </p>
            </div>
          ) : null}
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setDeactivatingUnit(null)}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeactivateUnit}
              disabled={!!savingUnitStatusId}
              className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {savingUnitStatusId ? "Deactivating..." : "Deactivate"}
            </button>
          </div>
        </Modal>
      )}

      {/* Payment plan */}
      {canInviteRenters && rentCreditUnit?.activeLeaseId && (
        <PaymentPlanModal
          leaseId={rentCreditUnit.activeLeaseId}
          unitNumber={rentCreditUnit.unitNumber}
          onClose={() => setRentCreditUnit(null)}
          onApplied={() => router.refresh()}
        />
      )}

      {/* Onboard tenant wizard */}
      {onboardingUnitId !== null && (
        <OnboardRenterWizard
          propertyId={property.id}
          propertyName={property.name}
          propertyAddress={`${property.address}, ${property.city}, ${property.state} ${property.zip}`}
          vacantUnits={property.units
            .filter((u) => u.status === "vacant")
            .map<WizardUnit>((u) => ({
              id: u.id,
              unitNumber: u.unitNumber,
              bedrooms: u.bedrooms,
              bathrooms: u.bathrooms,
              rentAmount: u.rentAmount,
            }))}
          initialUnitId={onboardingUnitId}
          onClose={() => setOnboardingUnitId(null)}
          onSuccess={(unitId, options) => {
            handleOnboardSuccess(unitId, options);
          }}
        />
      )}

      {/* AI Lease Review slide-over */}
      <LeaseReviewPanel
        open={reviewPanelOpen}
        loading={reviewLoading}
        error={reviewError}
        data={reviewData}
        templateName={
          pendingUpload?.name ??
          leaseTemplates.find((t) => t.id === reviewingTemplateId)?.name ??
          leaseTemplates.find((t) => t.isActive)?.name ??
          "Lease template"
        }
        isPending={!!pendingUpload}
        confirming={confirmingUpload}
        onClose={() => { if (!pendingUpload) setReviewPanelOpen(false); else discardUpload(); }}
        onRetry={() => { if (reviewingTemplateId) void runLeaseReview(reviewingTemplateId); }}
        onConfirm={confirmUpload}
        onDiscard={discardUpload}
      />
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

// ─── Payment Plan Modal ─────────────────────────────────────────────────────

type RentCreditMonth = {
  paymentId: string;
  month: number;
  dueDate: string | null;
  currentAmount: number;
  status: string;
};

type RentCreditData = {
  leaseId: string;
  rentAmount: number;
  monthlyRentCredit: number;
  months: RentCreditMonth[];
};

function rentCreditCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function rentCreditMonthLabel(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(value));
}

function paymentStatusBadge(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "paid" || normalized === "completed") {
    return { label: "Paid", className: "bg-emerald-100 text-emerald-700" };
  }
  if (normalized === "overdue" || normalized === "failed") {
    return { label: normalized === "failed" ? "Failed" : "Overdue", className: "bg-red-100 text-red-700" };
  }
  return { label: "Pending", className: "bg-amber-100 text-amber-700" };
}

function PaymentPlanModal({
  leaseId,
  unitNumber,
  onClose,
  onApplied,
}: {
  leaseId: string;
  unitNumber: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<RentCreditData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creditInput, setCreditInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function initSelection(body: RentCreditData) {
    // Default: every month checked. When a credit is already applied to specific
    // months, reflect that selection instead so re-editing is accurate.
    const credited = body.months.filter((m) => m.currentAmount < body.rentAmount).map((m) => m.paymentId);
    return new Set(credited.length > 0 ? credited : body.months.map((m) => m.paymentId));
  }

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetch(`/api/leases/${leaseId}/credit`)
      .then(async (res) => {
        const text = await res.text();
        const body = text ? JSON.parse(text) : {};
        if (!res.ok) throw new Error(body.error ?? "Could not load the rent schedule.");
        return body as RentCreditData;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setCreditInput(body.monthlyRentCredit > 0 ? String(body.monthlyRentCredit) : "");
        setSelectedIds(initSelection(body));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load the rent schedule.");
      });
    return () => {
      cancelled = true;
    };
  }, [leaseId]);

  const creditValue = creditInput.trim() === "" ? 0 : Number(creditInput);
  const creditValid = Number.isFinite(creditValue) && creditValue >= 0;
  const allSelected = !!data && data.months.length > 0 && data.months.every((m) => selectedIds.has(m.paymentId));

  function toggleMonth(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!data) return;
    setSelectedIds(allSelected ? new Set() : new Set(data.months.map((m) => m.paymentId)));
  }

  async function applyCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    if (!creditValid) {
      setFormError("Enter a valid credit amount.");
      return;
    }
    if (creditValue > data.rentAmount) {
      setFormError(`Credit cannot exceed the monthly rent of $${data.rentAmount.toFixed(2)}.`);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/leases/${leaseId}/credit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyRentCredit: creditValue, appliedPaymentIds: [...selectedIds] }),
      });
      const text = await res.text();
      const body = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(body.error ?? "Could not apply the credit.");
      const next = body as RentCreditData;
      const appliedCount = next.months.filter((m) => m.currentAmount < next.rentAmount).length;
      toast.success(
        appliedCount > 0
          ? `Rent credit applied to ${appliedCount} month${appliedCount === 1 ? "" : "s"}.`
          : "Rent credit removed.",
        { title: "Rent credit" },
      );
      onApplied();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not apply the credit.");
    } finally {
      setSaving(false);
    }
  }

  const effectiveCredit = creditValid ? creditValue : 0;
  const totalCredit = data
    ? data.months.reduce((sum, m) => sum + (selectedIds.has(m.paymentId) ? effectiveCredit : 0), 0)
    : 0;
  const totalPays = data
    ? data.months.reduce((sum, m) => sum + Math.max(0, data.rentAmount - (selectedIds.has(m.paymentId) ? effectiveCredit : 0)), 0)
    : 0;

  return (
    <Modal title={`Payment plan — Unit ${unitNumber}`} onClose={onClose} maxWidthClassName="max-w-2xl">
      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading payment plan…</p>
      ) : (
        <form onSubmit={applyCredit} className="space-y-5">
          <div className="space-y-3">
            <label className="block space-y-1 text-xs font-medium text-slate-700">
              Monthly rent credit
              <div className="relative max-w-[200px]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                <input
                  type="number"
                  min="0"
                  max={data.rentAmount}
                  step="0.01"
                  inputMode="decimal"
                  value={creditInput}
                  onChange={(e) => setCreditInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </label>
            <p className="text-xs text-slate-500">
              Monthly rent is <span className="font-semibold text-slate-700">${data.rentAmount.toLocaleString()}</span>.
              Check the months the credit should apply to — all months are selected by default. Enter $0 to remove the credit.
            </p>
            {formError && <p className="text-xs font-medium text-red-600">{formError}</p>}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      aria-label="Toggle all months"
                    />
                  </th>
                  <th className="px-3 py-2.5">Month</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Lease Rent</th>
                  <th className="px-3 py-2.5 text-right">Credit Applied</th>
                  <th className="px-3 py-2.5 text-right">Tenant Pays</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.months.map((m) => {
                  const checked = selectedIds.has(m.paymentId);
                  const credit = checked ? effectiveCredit : 0;
                  const due = rentCreditMonthLabel(m.dueDate);
                  const badge = paymentStatusBadge(m.status);
                  return (
                    <tr key={m.paymentId} className="text-slate-800">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMonth(m.paymentId)}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          aria-label={`Apply credit to month ${m.month}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium">Month {m.month}</span>
                        {due && <span className="ml-2 text-xs text-slate-400">{due}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rentCreditCurrency(data.rentAmount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                        {credit > 0 ? `-${rentCreditCurrency(credit)}` : "-$0"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {rentCreditCurrency(Math.max(0, data.rentAmount - credit))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 text-slate-900">
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Total</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-700">
                    {totalCredit > 0 ? `-${rentCreditCurrency(totalCredit)}` : "-$0"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rentCreditCurrency(Math.max(0, totalPays))}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <ModalActions
            onCancel={onClose}
            submitLabel={saving ? "Saving…" : "Save payment plan"}
            disabled={saving || !creditValid}
          />
        </form>
      )}
    </Modal>
  );
}

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

type UnitFormState = {
  unitNumber: string;
  bedrooms: string;
  bathrooms: string;
  squareFeet: string;
  rentAmount: string;
  status: string;
};

type UnitFieldErrors = Partial<Record<keyof UnitFormState, string>>;

const requiredUnitFields: Array<{ field: keyof UnitFormState; label: string }> = [
  { field: "unitNumber", label: "Unit number" },
  { field: "bedrooms", label: "Bedrooms" },
  { field: "bathrooms", label: "Bathrooms" },
  { field: "squareFeet", label: "Sq ft" },
  { field: "rentAmount", label: "Monthly rent" },
];

function UnitFormFields({
  form,
  fieldErrors,
  setFieldRef,
  onChange,
}: {
  form: UnitFormState;
  fieldErrors: UnitFieldErrors;
  setFieldRef: (field: keyof UnitFormState, node: HTMLInputElement | HTMLSelectElement | null) => void;
  onChange: (field: keyof UnitFormState, value: string) => void;
}) {
  const inputClass =
    "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";
  const invalidInputClass = "border-red-300 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20";
  const fieldClass = (field: keyof UnitFormState) =>
    `${inputClass} ${fieldErrors[field] ? invalidInputClass : ""}`;
  const fieldError = (field: keyof UnitFormState) =>
    fieldErrors[field] ? (
      <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors[field]}</p>
    ) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Unit number
        <input
          ref={(node) => setFieldRef("unitNumber", node)}
          className={fieldClass("unitNumber")}
          value={form.unitNumber}
          onChange={(e) => onChange("unitNumber", e.target.value)}
          required
          aria-invalid={!!fieldErrors.unitNumber}
        />
        {fieldError("unitNumber")}
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Status
        <select
          ref={(node) => setFieldRef("status", node)}
          className={fieldClass("status")}
          value={form.status}
          onChange={(e) => onChange("status", e.target.value)}
          required
        >
          <option value="vacant">Vacant</option>
          <option value="occupied">Occupied</option>
          <option value="maintenance">Maintenance</option>
          <option value="inactive">Inactive</option>
        </select>
        {fieldError("status")}
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Bedrooms
        <input
          ref={(node) => setFieldRef("bedrooms", node)}
          type="number"
          min="0"
          required
          className={fieldClass("bedrooms")}
          value={form.bedrooms}
          onChange={(e) => onChange("bedrooms", e.target.value)}
          aria-invalid={!!fieldErrors.bedrooms}
        />
        {fieldError("bedrooms")}
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Bathrooms
        <input
          ref={(node) => setFieldRef("bathrooms", node)}
          type="number"
          min="0.5"
          step="0.5"
          required
          className={fieldClass("bathrooms")}
          value={form.bathrooms}
          onChange={(e) => onChange("bathrooms", e.target.value)}
          aria-invalid={!!fieldErrors.bathrooms}
        />
        {fieldError("bathrooms")}
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Sq ft
        <input
          ref={(node) => setFieldRef("squareFeet", node)}
          type="number"
          min="1"
          required
          className={fieldClass("squareFeet")}
          value={form.squareFeet}
          onChange={(e) => onChange("squareFeet", e.target.value)}
          aria-invalid={!!fieldErrors.squareFeet}
        />
        {fieldError("squareFeet")}
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Monthly rent
        <input
          ref={(node) => setFieldRef("rentAmount", node)}
          type="number"
          min="1"
          step="50"
          required
          className={fieldClass("rentAmount")}
          value={form.rentAmount}
          onChange={(e) => onChange("rentAmount", e.target.value)}
          aria-invalid={!!fieldErrors.rentAmount}
        />
        {fieldError("rentAmount")}
      </label>
    </div>
  );
}

function ModalActions({
  onCancel,
  submitLabel,
  disabled,
}: {
  onCancel: () => void;
  submitLabel: string;
  disabled: boolean;
}) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
        Cancel
      </button>
      <button type="submit" disabled={disabled} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
        {submitLabel}
      </button>
    </div>
  );
}
