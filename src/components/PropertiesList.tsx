"use client";

import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPropertyTypeLabel } from "@/lib/property-types";

export type PropertyGroup = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  description: string | null;
  isActive: boolean;
  apartments: ApartmentListItem[];
};

export type ApartmentListItem = {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number | null;
  rentAmount: number | null;
  status: string;
};

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function GridIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function MapPinIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function HomeIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function DollarSignIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function UsersIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function MoreVerticalIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
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
      <path d="m14.5 5.5 4 4" />
      <path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
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

function DeleteConfirmDialog({
  propertyName,
  unitCount,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  propertyName: string;
  unitCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <TrashIcon className="h-6 w-6 text-red-600" />
        </div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Delete property?</h2>
        <p className="mb-1 text-sm text-gray-600">
          <span className="font-medium text-gray-900">{propertyName}</span> and{" "}
          {unitCount === 0
            ? "all its data"
            : `${unitCount} unit${unitCount !== 1 ? "s" : ""}`}{" "}
          will be permanently removed.
        </p>
        <p className="mb-6 text-sm text-gray-500">This action cannot be undone.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 rounded-lg border border-gray-200 bg-white py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getRentRange(apartments: ApartmentListItem[]): string {
  const rents = apartments
    .map((a) => a.rentAmount)
    .filter((r): r is number => r !== null);
  if (rents.length === 0) return "Not set";
  const min = Math.min(...rents);
  const max = Math.max(...rents);
  if (min === max) return `$${min.toLocaleString()}/mo`;
  return `$${min.toLocaleString()}–$${max.toLocaleString()}/mo`;
}

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? (occupied / total) * 100 : 0;
  const barColor =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full rounded-full bg-gray-200 h-2">
      <div
        className={`h-2 rounded-full transition-all ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PropertyCardMenu({
  propertyId,
  propertyName,
  unitCount,
  property,
}: {
  propertyId: string;
  propertyName: string;
  unitCount: number;
  property: PropertyGroup;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.refresh();
    } catch {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }, [propertyId, router]);

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm hover:bg-gray-50 transition-colors"
          aria-label="Property options"
        >
          <MoreVerticalIcon className="h-4 w-4 text-gray-600" />
        </button>
        {open && (
          <div className="absolute right-0 mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-20 overflow-hidden">
            <Link
              href={`/ai-import?propertyId=${propertyId}&name=${encodeURIComponent(property.name)}&type=${encodeURIComponent(property.type)}&address=${encodeURIComponent(property.address)}&city=${encodeURIComponent(property.city)}&state=${encodeURIComponent(property.state)}&zip=${encodeURIComponent(property.zip)}`}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            >
              <SparklesIcon className="h-4 w-4" />
              Add with AI
            </Link>
            <Link
              href={`/properties/${propertyId}`}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
            >
              <EditIcon className="h-4 w-4" />
              Edit
            </Link>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); setConfirmDelete(true); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100"
            >
              <TrashIcon className="h-4 w-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <DeleteConfirmDialog
          propertyName={propertyName}
          unitCount={unitCount}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          isDeleting={isDeleting}
        />
      )}
    </>
  );
}

function PropertyCard({
  property,
  viewMode,
}: {
  property: PropertyGroup;
  viewMode: "grid" | "list";
}) {
  const router = useRouter();
  const occupied = property.apartments.filter(
    (a) => a.status === "occupied",
  ).length;
  const total = property.apartments.length;
  const rentRange = getRentRange(property.apartments);

  const statusBadge = (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        property.isActive
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      {property.isActive ? "Active" : "Inactive"}
    </span>
  );

  const meta = (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex items-center gap-2">
        <HomeIcon className="h-4 w-4 shrink-0 text-gray-400" />
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Type</p>
          <p className="truncate text-sm text-gray-900">
            {getPropertyTypeLabel(property.type)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <DollarSignIcon className="h-4 w-4 shrink-0 text-gray-400" />
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Rent</p>
          <p className="truncate text-sm text-gray-900">{rentRange}</p>
        </div>
      </div>
    </div>
  );

  const occupancy = (
    <div className="flex items-center gap-2">
      <UsersIcon className="h-4 w-4 shrink-0 text-gray-400" />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Occupancy</span>
          <span>
            {occupied}/{total} units
          </span>
        </div>
        <OccupancyBar occupied={occupied} total={total} />
      </div>
    </div>
  );

  if (viewMode === "list") {
    return (
      <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
        {/* Color strip */}
        <div className="w-2 shrink-0 bg-gradient-to-b from-emerald-400 to-sky-500" />
        {/* Image placeholder */}
        <div className="relative hidden w-40 shrink-0 sm:flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
          <BuildingIcon className="h-10 w-10 text-slate-500" />
        </div>
        <Link
          href={`/properties/${property.id}`}
          className="flex flex-1 flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              {statusBadge}
            </div>
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {property.name}
            </h3>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
              <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {property.address}, {property.city}, {property.state}{" "}
                {property.zip}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:w-64">
            {meta}
            {occupancy}
          </div>
        </Link>
        <div className="flex shrink-0 items-center pr-4" onClick={(e) => e.stopPropagation()}>
          <PropertyCardMenu propertyId={property.id} propertyName={property.name} unitCount={total} property={property} />
        </div>
      </div>
    );
  }

  const propertyHref = `/properties/${property.id}`;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(propertyHref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(propertyHref);
        }
      }}
      className="group block overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Image / hero */}
      <div className="relative h-48 bg-gradient-to-br from-slate-700 to-slate-900">
        <BuildingIcon className="absolute inset-0 m-auto h-14 w-14 text-slate-500" />
        <div className="absolute left-3 top-3">{statusBadge}</div>
        <div className="absolute right-3 top-3">
          <PropertyCardMenu propertyId={property.id} propertyName={property.name} unitCount={total} property={property} />
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="mb-1 text-lg font-semibold text-gray-900 truncate">
          {property.name}
        </h3>
        <div className="mb-3 flex items-start gap-1.5 text-sm text-gray-600">
          <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="line-clamp-2">
            {property.address}, {property.city}, {property.state} {property.zip}
          </span>
        </div>

        <div className="space-y-3">
          {meta}
          {occupancy}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ searched }: { searched: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white py-16 text-center shadow-sm">
      <BuildingIcon className="h-12 w-12 text-gray-300" />
      <p className="text-base font-medium text-gray-900">No properties found</p>
      <p className="text-sm text-gray-500">
        {searched
          ? "Try adjusting your search criteria"
          : "Get started by adding your first property"}
      </p>
    </div>
  );
}

export function PropertiesList({
  properties,
}: {
  properties: PropertyGroup[];
}) {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const totalUnits = properties.reduce(
    (sum, p) => sum + p.apartments.length,
    0,
  );
  const totalOccupied = properties.reduce(
    (sum, p) =>
      sum + p.apartments.filter((a) => a.status === "occupied").length,
    0,
  );
  const occupancyRate =
    totalUnits > 0
      ? ((totalOccupied / totalUnits) * 100).toFixed(1)
      : "0.0";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.state.toLowerCase().includes(q) ||
        p.zip.toLowerCase().includes(q),
    );
  }, [properties, search]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-blue-50 p-4">
          <p className="mb-1 text-sm text-blue-600">Total Properties</p>
          <p className="text-2xl font-semibold text-blue-900">
            {properties.length}
          </p>
        </div>
        <div className="rounded-lg bg-green-50 p-4">
          <p className="mb-1 text-sm text-green-600">Total Units</p>
          <p className="text-2xl font-semibold text-green-900">{totalUnits}</p>
        </div>
        <div className="rounded-lg bg-purple-50 p-4">
          <p className="mb-1 text-sm text-purple-600">Occupancy Rate</p>
          <p className="text-2xl font-semibold text-purple-900">
            {occupancyRate}%
          </p>
        </div>
      </div>

      {/* Search + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search properties by name or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white">
          <button
            onClick={() => setViewMode("grid")}
            className={`px-3 py-2 transition-colors ${
              viewMode === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50"
            }`}
            aria-label="Grid view"
          >
            <GridIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`border-l border-gray-300 px-3 py-2 transition-colors ${
              viewMode === "list" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50"
            }`}
            aria-label="List view"
          >
            <ListIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState searched={search.trim().length > 0} />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((property) => (
            <PropertyCard key={property.id} property={property} viewMode="grid" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((property) => (
            <PropertyCard key={property.id} property={property} viewMode="list" />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-sm text-gray-500">
          Showing {filtered.length} of {properties.length} propert
          {properties.length !== 1 ? "ies" : "y"}
        </p>
      )}
    </div>
  );
}
