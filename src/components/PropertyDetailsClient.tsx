"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PROPERTY_TYPE_OPTIONS, getPropertyTypeLabel, normalizePropertyType } from "@/lib/property-types";
import { useToast } from "./ToastProvider";

type PropertyDetails = {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
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

function UserIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MailIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.14 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.05 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17v-.08Z" />
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

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
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

const inputClass =
  "h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

const labelClass = "block space-y-1.5 text-sm font-medium text-gray-700";

function statusBadge(status: string) {
  switch (status) {
    case "occupied":
      return "bg-green-100 text-green-700 border-green-200";
    case "maintenance":
      return "bg-red-100 text-red-600 border-red-200";
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
  onDelete,
  onInviteRenter,
  canManageUnits,
  canInviteRenters,
}: {
  unit: UnitDetails;
  onEdit: (unit: UnitDetails) => void;
  onDelete: (unit: UnitDetails) => void;
  onInviteRenter: (unit: UnitDetails) => void;
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

  if (!canManageUnits && !canInviteRenters) {
    return null;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Unit options"
      >
        <MoreVerticalIcon className="h-4 w-4 text-gray-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {canManageUnits ? (
            <button
              onClick={() => { setOpen(false); onEdit(unit); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <EditIcon className="h-4 w-4" />
              Edit unit
            </button>
          ) : null}
          {canInviteRenters && (
            <button
              onClick={() => { setOpen(false); onInviteRenter(unit); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50"
            >
              <SendIcon className="h-4 w-4" />
              Invite renter
            </button>
          )}
          {canManageUnits ? (
            <button
              onClick={() => { setOpen(false); onDelete(unit); }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
            >
              <TrashIcon className="h-4 w-4" />
              Delete
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Unit Card ────────────────────────────────────────────────────────────────

function UnitCard({
  unit,
  onEdit,
  onDelete,
  onInviteRenter,
  deleting,
  canManageUnits,
  canInviteRenters,
  inviteSent,
}: {
  unit: UnitDetails;
  onEdit: (unit: UnitDetails) => void;
  onDelete: (unit: UnitDetails) => void;
  onInviteRenter: (unit: UnitDetails) => void;
  deleting: boolean;
  canManageUnits: boolean;
  canInviteRenters: boolean;
  inviteSent: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Top row */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div>
          <p className="text-lg font-bold text-gray-900">Unit {unit.unitNumber}</p>
          <span className={`mt-1 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge(unit.status)}`}>
            {statusLabel(unit.status)}
          </span>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-500">Monthly Rent</p>
            <p className="text-lg font-bold text-gray-900">
              {unit.rentAmount !== null ? `$${unit.rentAmount.toLocaleString()}` : "—"}
            </p>
          </div>
          <UnitCardMenu
            unit={unit}
            onEdit={onEdit}
            onDelete={onDelete}
            onInviteRenter={onInviteRenter}
            canManageUnits={canManageUnits}
            canInviteRenters={canInviteRenters}
          />
        </div>
      </div>

      <div className="mx-4 border-t border-gray-100" />

      {/* Specs */}
      <div className="grid grid-cols-3 gap-3 p-4 py-3">
        <div>
          <p className="text-xs text-gray-500">Bedrooms</p>
          <p className="mt-0.5 font-semibold text-gray-900">{unit.bedrooms} BD</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Bathrooms</p>
          <p className="mt-0.5 font-semibold text-gray-900">{unit.bathrooms} BA</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Sq Ft</p>
          <p className="mt-0.5 font-semibold text-gray-900">
            {unit.squareFeet ? unit.squareFeet.toLocaleString() : "—"}
          </p>
        </div>
      </div>

      <div className="mx-4 border-t border-gray-100" />

      {/* Tenant section */}
      <div className="p-4 pt-3">
        {unit.tenant ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <UserIcon className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="font-medium">{unit.tenant.firstName} {unit.tenant.lastName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MailIcon className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate">{unit.tenant.email}</span>
            </div>
            {unit.tenant.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <PhoneIcon className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{unit.tenant.phone}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1 text-center">
            <HomeIcon className="h-7 w-7 text-gray-200" />
            <p className="text-sm text-gray-400">No tenant assigned</p>
            {canInviteRenters && (
              <button
                onClick={() => !inviteSent && onInviteRenter(unit)}
                disabled={inviteSent}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  inviteSent
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600 cursor-default"
                    : "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                }`}
              >
                <SendIcon className="h-3.5 w-3.5" />
                {inviteSent ? "Invite sent" : "Invite renter"}
              </button>
            )}
          </div>
        )}
      </div>

      {deleting && (
        <div className="border-t border-gray-100 px-4 py-2 text-center text-xs text-gray-400">
          Deleting…
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PropertyDetailsClient({
  initialProperty,
  canManageProperty = false,
  canManageUnits = false,
  canInviteRenters = false,
}: {
  initialProperty: PropertyDetails;
  canManageProperty?: boolean;
  canManageUnits?: boolean;
  canInviteRenters?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [property, setProperty] = useState(initialProperty);

  // Property edit state
  const [editingProperty, setEditingProperty] = useState(false);
  const [propForm, setPropForm] = useState({
    name: initialProperty.name,
    type: normalizePropertyType(initialProperty.type),
    address: initialProperty.address,
    city: initialProperty.city,
    state: initialProperty.state,
    zip: initialProperty.zip,
    description: initialProperty.description,
  });
  const [savingProperty, setSavingProperty] = useState(false);

  // Unit state
  const [unitSearch, setUnitSearch] = useState("");
  const [unitStatusFilter, setUnitStatusFilter] = useState("all");
  const [deletingUnitId, setDeletingUnitId] = useState<string | null>(null);

  // Edit unit modal
  const [editingUnit, setEditingUnit] = useState<UnitDetails | null>(null);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [savingUnit, setSavingUnit] = useState(false);

  // Add unit modal
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitForm, setNewUnitForm] = useState(emptyUnitForm);
  const [savingNewUnit, setSavingNewUnit] = useState(false);

  // Delete unit confirmation
  const [deletingUnit, setDeletingUnit] = useState<UnitDetails | null>(null);

  // Invite renter state
  const [invitingUnit, setInvitingUnit] = useState<UnitDetails | null>(null);
  const [inviteForm, setInviteForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitedUnitIds, setInvitedUnitIds] = useState<Set<string>>(new Set());

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

  // ── Handlers ───────────────────────────────────────────────────────────────

  function notify(msg: string) {
    toast.success(msg, { title: "Property" });
  }

  function fail(msg: string) {
    toast.error(msg, { title: "Property" });
  }

  async function saveProperty(e: React.FormEvent) {
    e.preventDefault();
    setSavingProperty(true);
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(propForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update property.");
      setProperty((p) => ({ ...p, ...data.property, description: data.property.description ?? "" }));
      setEditingProperty(false);
      notify("Property updated.");
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not update property.");
    } finally {
      setSavingProperty(false);
    }
  }

  async function createUnit(e: React.FormEvent) {
    e.preventDefault();
    setSavingNewUnit(true);
    try {
      const res = await fetch(`/api/properties/${property.id}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitNumber: newUnitForm.unitNumber,
          bedrooms: Number(newUnitForm.bedrooms) || 0,
          bathrooms: Number(newUnitForm.bathrooms) || 0,
          squareFeet: newUnitForm.squareFeet ? Number(newUnitForm.squareFeet) : null,
          rentAmount: newUnitForm.rentAmount ? Number(newUnitForm.rentAmount) : null,
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
    setSavingUnit(true);
    try {
      const res = await fetch(`/api/properties/${property.id}/units/${editingUnit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitNumber: unitForm.unitNumber,
          bedrooms: Number(unitForm.bedrooms) || 0,
          bathrooms: Number(unitForm.bathrooms) || 0,
          squareFeet: unitForm.squareFeet ? Number(unitForm.squareFeet) : null,
          rentAmount: unitForm.rentAmount ? Number(unitForm.rentAmount) : null,
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
        tenant: editingUnit?.tenant ?? null,
      };
      setProperty((p) => ({
        ...p,
        units: p.units
          .map((u) => (u.id === updated.id ? updated : u))
          .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })),
      }));
      setEditingUnit(null);
      notify(`Unit ${updated.unitNumber} updated.`);
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not update unit.");
    } finally {
      setSavingUnit(false);
    }
  }

  async function sendRenterInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setSendingInvite(true);
    try {
      const res = await fetch("/api/renters/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          firstName: inviteForm.firstName.trim(),
          lastName: inviteForm.lastName.trim(),
          phone: inviteForm.phone.trim() || undefined,
          propertyId: property.id,
        }),
      });
      const data = await res.json() as { error?: string; invited?: string; linked?: string };
      if (!res.ok && res.status !== 207) {
        setInviteError(data.error ?? "Could not send invite.");
        return;
      }
      const unitId = invitingUnit?.id;
      setInvitingUnit(null);
      setInviteForm({ firstName: "", lastName: "", email: "", phone: "" });
      if (unitId && res.status !== 207) {
        setInvitedUnitIds((prev) => new Set(prev).add(unitId));
      }
      notify(
        res.status === 207
          ? `Renter record created but email delivery failed. Check your Clerk config.`
          : data.linked
            ? `${data.linked} already has an account — renter portal access granted, no email needed.`
            : `Invite sent to ${data.invited}.`,
      );
      router.refresh();
    } catch {
      setInviteError("Network error. Please try again.");
    } finally {
      setSendingInvite(false);
    }
  }

  async function confirmDeleteUnit() {
    if (!deletingUnit) return;
    setDeletingUnitId(deletingUnit.id);
    try {
      const res = await fetch(`/api/properties/${property.id}/units/${deletingUnit.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete unit.");
      setProperty((p) => ({ ...p, units: p.units.filter((u) => u.id !== deletingUnit.id) }));
      notify(`Unit ${deletingUnit.unitNumber} deleted.`);
      router.refresh();
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not delete unit.");
    } finally {
      setDeletingUnitId(null);
      setDeletingUnit(null);
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
                <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                  <MapPinIcon className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{property.address}, {property.city}, {property.state} {property.zip}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                  <HomeIcon className="h-4 w-4 shrink-0 text-gray-400" />
                  <span>{getPropertyTypeLabel(property.type)}</span>
                </div>
              </div>
              {canManageProperty ? (
                <button
                  onClick={() => setEditingProperty((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <EditIcon className="h-4 w-4" />
                  {editingProperty ? "Cancel" : "Edit"}
                </button>
              ) : null}
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

        {/* Inline property edit form */}
        {canManageProperty && editingProperty && (
          <form onSubmit={saveProperty} className="border-t border-gray-100 bg-gray-50 p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Property name
                <input className={inputClass} value={propForm.name} onChange={(e) => setPropForm((f) => ({ ...f, name: e.target.value }))} required />
              </label>
              <label className={labelClass}>
                Type
                <select className={inputClass} value={propForm.type} onChange={(e) => setPropForm((f) => ({ ...f, type: normalizePropertyType(e.target.value) }))}>
                  {PROPERTY_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className={`${labelClass} sm:col-span-2`}>
                Street address
                <input className={inputClass} value={propForm.address} onChange={(e) => setPropForm((f) => ({ ...f, address: e.target.value }))} required />
              </label>
              <label className={labelClass}>
                City
                <input className={inputClass} value={propForm.city} onChange={(e) => setPropForm((f) => ({ ...f, city: e.target.value }))} required />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  State
                  <input className={inputClass} value={propForm.state} maxLength={2} onChange={(e) => setPropForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))} required />
                </label>
                <label className={labelClass}>
                  Zip
                  <input className={inputClass} value={propForm.zip} onChange={(e) => setPropForm((f) => ({ ...f, zip: e.target.value }))} required />
                </label>
              </div>
              <label className={`${labelClass} sm:col-span-2`}>
                Description
                <textarea className={`${inputClass} h-auto min-h-20 py-2`} value={propForm.description} onChange={(e) => setPropForm((f) => ({ ...f, description: e.target.value }))} />
              </label>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={savingProperty} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                {savingProperty ? "Saving…" : "Save changes"}
              </button>
              <button type="button" onClick={() => setEditingProperty(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
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
            </select>
            {/* Add unit */}
            {canManageUnits ? (
              <button
                onClick={() => { setAddingUnit(true); setNewUnitForm(emptyUnitForm); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Add Unit
              </button>
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
                  onEdit={(u) => { setEditingUnit(u); setUnitForm(unitFormFromUnit(u)); }}
                  onDelete={(u) => setDeletingUnit(u)}
                  onInviteRenter={(u) => { setInvitingUnit(u); setInviteForm({ firstName: "", lastName: "", email: "", phone: "" }); setInviteError(null); }}
                  deleting={deletingUnitId === unit.id}
                  canManageUnits={canManageUnits}
                  canInviteRenters={canInviteRenters}
                  inviteSent={invitedUnitIds.has(unit.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Add unit */}
      {canManageUnits && addingUnit && (
        <Modal title="Add Unit" onClose={() => setAddingUnit(false)}>
          <form onSubmit={createUnit} className="space-y-4">
            <UnitFormFields form={newUnitForm} onChange={(f) => setNewUnitForm(f)} />
            <ModalActions
              onCancel={() => setAddingUnit(false)}
              submitLabel={savingNewUnit ? "Adding…" : "Add Unit"}
              disabled={savingNewUnit}
            />
          </form>
        </Modal>
      )}

      {/* Edit unit */}
      {canManageUnits && editingUnit && (
        <Modal title={`Edit Unit ${editingUnit.unitNumber}`} onClose={() => setEditingUnit(null)}>
          <form onSubmit={saveUnit} className="space-y-4">
            <UnitFormFields form={unitForm} onChange={(f) => setUnitForm(f)} />
            <ModalActions
              onCancel={() => setEditingUnit(null)}
              submitLabel={savingUnit ? "Saving…" : "Save Unit"}
              disabled={savingUnit}
            />
          </form>
        </Modal>
      )}

      {/* Delete unit confirmation */}
      {canManageUnits && deletingUnit && (
        <Modal title="Delete unit?" onClose={() => setDeletingUnit(null)}>
          <p className="text-sm text-gray-600">
            Unit <span className="font-semibold text-gray-900">{deletingUnit.unitNumber}</span> will
            be permanently removed. This cannot be undone.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setDeletingUnit(null)}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteUnit}
              disabled={!!deletingUnitId}
              className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {deletingUnitId ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}

      {/* Invite renter */}
      {invitingUnit && (
        <Modal
          title={`Invite renter — Unit ${invitingUnit.unitNumber}`}
          onClose={() => { setInvitingUnit(null); setInviteError(null); }}
        >
          <p className="mb-4 text-sm text-gray-500">
            We&apos;ll send the renter an email with a link to create their account. They&apos;ll
            have access to the Renter Portal once they sign up.
          </p>
          <form onSubmit={sendRenterInvite} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                First name <span className="text-red-500">*</span>
                <input
                  className={inputClass}
                  value={inviteForm.firstName}
                  onChange={(e) => setInviteForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jane"
                  required
                />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                Last name <span className="text-red-500">*</span>
                <input
                  className={inputClass}
                  value={inviteForm.lastName}
                  onChange={(e) => setInviteForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Doe"
                  required
                />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium text-gray-700">
              Email <span className="text-red-500">*</span>
              <input
                className={inputClass}
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jane@example.com"
                required
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-gray-700">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
              <input
                className={inputClass}
                type="tel"
                value={inviteForm.phone}
                onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+1 555 000 0000"
              />
            </label>
            {inviteError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {inviteError}
              </p>
            )}
            <ModalActions
              onCancel={() => { setInvitingUnit(null); setInviteError(null); }}
              submitLabel={sendingInvite ? "Sending invite…" : "Send invite"}
              disabled={sendingInvite}
            />
          </form>
        </Modal>
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

function UnitFormFields({
  form,
  onChange,
}: {
  form: UnitFormState;
  onChange: (f: UnitFormState) => void;
}) {
  const set = (field: keyof UnitFormState, value: string) =>
    onChange({ ...form, [field]: value });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Unit number
        <input className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={form.unitNumber} onChange={(e) => set("unitNumber", e.target.value)} required />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Status
        <select className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={form.status} onChange={(e) => set("status", e.target.value)}>
          <option value="vacant">Vacant</option>
          <option value="occupied">Occupied</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Bedrooms
        <input type="number" min="0" className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Bathrooms
        <input type="number" min="0" step="0.5" className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Sq ft <span className="text-gray-400 font-normal">(optional)</span>
        <input type="number" min="0" className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={form.squareFeet} onChange={(e) => set("squareFeet", e.target.value)} placeholder="—" />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        Monthly rent <span className="text-gray-400 font-normal">(optional)</span>
        <input type="number" min="0" step="50" className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={form.rentAmount} onChange={(e) => set("rentAmount", e.target.value)} placeholder="—" />
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
