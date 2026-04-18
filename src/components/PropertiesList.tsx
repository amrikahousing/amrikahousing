"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type PropertyListItem = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  description: string | null;
  unitCount: number;
  vacantCount: number;
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

  const filteredProperties = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return properties;

    return properties.filter((property) =>
      [
        property.name,
        property.address,
        property.city,
        property.state,
        property.zip,
        property.description ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [properties, search]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="relative block">
          <span className="sr-only">Search properties</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
            placeholder="Search by property name, address, city, state, or zip"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
                  {property.name}
                </p>
                <p className="mt-1 truncate text-sm text-slate-600">
                  {property.address}
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {property.city}, {property.state} {property.zip}
                </p>
              </div>
              <span className="shrink-0 rounded border border-slate-200 px-2 py-0.5 text-xs capitalize text-slate-500">
                {property.type}
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

            <div className="mt-4 flex gap-3 text-sm text-slate-500">
              <span>
                {property.unitCount} unit{property.unitCount !== 1 ? "s" : ""}
              </span>
              {property.vacantCount > 0 ? (
                <span className="text-emerald-600">
                  {property.vacantCount} vacant
                </span>
              ) : null}
            </div>

            <Link
              href={`/properties/${property.id}`}
              className="mt-4 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              View details
            </Link>
          </article>
        ))}

        {filteredProperties.length === 0 ? (
          <div className="col-span-full rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            No properties matched that search.
          </div>
        ) : null}
      </div>
    </div>
  );
}
