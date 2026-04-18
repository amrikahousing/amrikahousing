"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type PropertyListItem = {
  id: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  description: string | null;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number | null;
  rentAmount: number | null;
  status: string;
};

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function PropertiesList({ properties }: { properties: PropertyListItem[] }) {
  const [search, setSearch] = useState("");
  const [propertyName, setPropertyName] = useState("all");
  const [status, setStatus] = useState("all");
  const [expandedApartmentId, setExpandedApartmentId] = useState<string | null>(null);

  const propertyOptions = useMemo(
    () =>
      Array.from(new Set(properties.map((property) => property.propertyName))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [properties],
  );

  const filteredProperties = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return properties.filter((property) => {
      const matchesProperty =
        propertyName === "all" || property.propertyName === propertyName;
      const matchesStatus = status === "all" || property.status === status;
      const matchesSearch =
        !normalizedSearch ||
        [
          property.propertyName,
          property.unitNumber,
          property.address,
          property.city,
          property.state,
          property.zip,
          property.description ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesProperty && matchesStatus && matchesSearch;
    });
  }, [properties, propertyName, search, status]);

  const apartmentNoun = properties.length === 1 ? "apartment" : "apartments";

  function formatCurrency(value: number | null) {
    if (value === null) return "Rent not set";
    return `$${value.toLocaleString()}/mo`;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_220px_176px]">
        <label className="relative block flex-1">
          <span className="sr-only">Search apartments</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
            placeholder="Search apartment, address, city, state, or zip"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="sr-only">Filter apartments by property name</span>
          <select
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
            value={propertyName}
            onChange={(event) => setPropertyName(event.target.value)}
          >
            <option value="all">All properties</option>
            {propertyOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Filter apartments by status</span>
          <select
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm capitalize text-slate-700 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredProperties.map((property) => (
          <article
            key={property.id}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-slate-900">
                  Apartment {property.unitNumber}
                </p>
                <p className="mt-1 truncate text-sm text-slate-600">
                  {property.propertyName}
                </p>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {property.address}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {property.city}, {property.state} {property.zip}
                </p>
              </div>
              <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs capitalize text-emerald-700">
                {property.status}
              </span>
            </div>

            {property.description ? (
              <p className="mt-4 line-clamp-2 min-h-[40px] text-sm text-slate-500">
                {property.description}
              </p>
            ) : (
              <p className="mt-4 min-h-[40px] text-sm text-slate-400">
                No description added yet.
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-500">
              <span>{property.bedrooms} bed{property.bedrooms === 1 ? "" : "s"}</span>
              <span>{property.bathrooms} bath{property.bathrooms === 1 ? "" : "s"}</span>
              <span>{property.squareFeet ? `${property.squareFeet.toLocaleString()} sq ft` : "Sq ft not set"}</span>
              <span className="font-medium text-slate-700">
                {formatCurrency(property.rentAmount)}
              </span>
            </div>

            {expandedApartmentId === property.id ? (
              <div className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Property</dt>
                    <dd className="mt-0.5 text-slate-900">{property.propertyName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Apartment</dt>
                    <dd className="mt-0.5 text-slate-900">{property.unitNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Status</dt>
                    <dd className="mt-0.5 capitalize text-slate-900">{property.status}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Type</dt>
                    <dd className="mt-0.5 capitalize text-slate-900">{property.type}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                aria-expanded={expandedApartmentId === property.id}
                onClick={() =>
                  setExpandedApartmentId((current) =>
                    current === property.id ? null : property.id,
                  )
                }
              >
                {expandedApartmentId === property.id ? "Hide details" : "View apartment"}
              </button>
              <Link
                href={`/properties/${property.propertyId}`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Manage property
              </Link>
            </div>
          </article>
        ))}

        {filteredProperties.length === 0 ? (
          <div className="col-span-full rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            No apartments matched that filter.
          </div>
        ) : null}
      </div>

      <p className="text-sm text-slate-500">
        Showing {filteredProperties.length} of {properties.length} {apartmentNoun}.
      </p>
    </div>
  );
}
