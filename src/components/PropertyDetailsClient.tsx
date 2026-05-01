"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPropertyTypeLabel } from "@/lib/property-types";
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
  futurePaymentCount: number;
  tenant: UnitTenant | null;
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

// ─── Unit Card Menu ───────────────────────────────────────────────────────────

function UnitCardMenu({
  unit,
  onEdit,
  onActivate,
  onDeactivate,
  canManageUnits,
}: {
  unit: UnitDetails;
  onEdit: (unit: UnitDetails) => void;
  onActivate: (unit: UnitDetails) => void;
  onDeactivate: (unit: UnitDetails) => void;
  canManageUnits: boolean;
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
  onOnboardRenter,
  savingStatus,
  canManageUnits,
  canInviteRenters,
  onboarded,
}: {
  unit: UnitDetails;
  onEdit: (unit: UnitDetails) => void;
  onActivate: (unit: UnitDetails) => void;
  onDeactivate: (unit: UnitDetails) => void;
  onOnboardRenter: (unit: UnitDetails) => void;
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
            canManageUnits={canManageUnits}
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
  canManageUnits = false,
  canInviteRenters = false,
}: {
  initialProperty: PropertyDetails;
  canManageUnits?: boolean;
  canInviteRenters?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [property, setProperty] = useState(initialProperty);

  // Unit state
  const [unitSearch, setUnitSearch] = useState("");
  const [unitStatusFilter, setUnitStatusFilter] = useState("all");
  const [savingUnitStatusId, setSavingUnitStatusId] = useState<string | null>(null);

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

  function handleOnboardSuccess(unitId: string) {
    setOnboardedUnitIds((prev) => new Set(prev).add(unitId));
    setProperty((p) => ({
      ...p,
      units: p.units.map((u) => u.id === unitId ? { ...u, status: "occupied" } : u),
    }));
    notify("Tenant onboarded successfully.");
    router.refresh();
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
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
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
                  onOnboardRenter={(u) => setOnboardingUnitId(u.id)}
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
          onSuccess={(unitId) => {
            handleOnboardSuccess(unitId);
          }}
        />
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-2xl">
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
