"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type PropertyGroup = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  type: string;
  description: string | null;
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

function EditIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="m14.5 5.5 4 4" />
      <path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    </svg>
  );
}

function formatCurrency(value: number | null) {
  if (value === null) return "Rent not set";
  return `$${value.toLocaleString()}/mo`;
}

function statusClass(status: string) {
  switch (status) {
    case "occupied":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "maintenance":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

export function PropertiesList({ properties }: { properties: PropertyGroup[] }) {
  const [search, setSearch] = useState("");
  const [propertyName, setPropertyName] = useState("all");
  const [status, setStatus] = useState("all");

  const propertyOptions = useMemo(
    () => properties.map((property) => property.name).sort((a, b) => a.localeCompare(b)),
    [properties],
  );

  const filteredGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return properties
      .map((property) => {
        const propertyText = [
          property.name,
          property.address,
          property.city,
          property.state,
          property.zip,
          property.description ?? "",
        ]
          .join(" ")
          .toLowerCase();
        const apartments = property.apartments.filter((apartment) => {
          const matchesStatus = status === "all" || apartment.status === status;
          const apartmentText = [
            apartment.unitNumber,
            apartment.status,
            apartment.bedrooms,
            apartment.bathrooms,
            apartment.squareFeet ?? "",
            apartment.rentAmount ?? "",
          ]
            .join(" ")
            .toLowerCase();
          const matchesSearch =
            !normalizedSearch ||
            propertyText.includes(normalizedSearch) ||
            apartmentText.includes(normalizedSearch);

          return matchesStatus && matchesSearch;
        });

        return { ...property, apartments };
      })
      .filter((property) => matchesVisibleProperty(property, propertyName));
  }, [properties, propertyName, search, status]);

  const visibleApartmentCount = filteredGroups.reduce(
    (count, property) => count + property.apartments.length,
    0,
  );
  const totalApartmentCount = properties.reduce(
    (count, property) => count + property.apartments.length,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_220px_176px]">
        <label className="relative block flex-1">
          <span className="sr-only">Search apartments</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15"
            placeholder="Search property, apartment, address, city, state, or zip"
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

      <div className="space-y-5">
        {filteredGroups.map((property) => {
          const vacantCount = property.apartments.filter(
            (apartment) => apartment.status === "vacant",
          ).length;

          return (
            <section
              key={property.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-200 bg-slate-50/80 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-semibold text-slate-900">
                        {property.name}
                      </h2>
                      <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs capitalize text-slate-500">
                        {property.type}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{property.address}</p>
                    <p className="text-sm text-slate-500">
                      {property.city}, {property.state} {property.zip}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                      {property.apartments.length} apartment{property.apartments.length !== 1 ? "s" : ""}
                    </span>
                    <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {vacantCount} vacant
                    </span>
                    <Link
                      href={`/properties/${property.id}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                      aria-label={`Edit ${property.name}`}
                    >
                      <EditIcon className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                {property.apartments.map((apartment) => (
                  <Link
                    key={apartment.id}
                    href={`/properties/${property.id}`}
                    className="group rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-500">Apartment</p>
                        <p className="mt-0.5 text-xl font-semibold text-slate-900">
                          {apartment.unitNumber}
                        </p>
                      </div>
                      <span
                        className={`rounded border px-2 py-0.5 text-xs capitalize ${statusClass(apartment.status)}`}
                      >
                        {apartment.status}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-500">
                      <span>{apartment.bedrooms} bed{apartment.bedrooms === 1 ? "" : "s"}</span>
                      <span>{apartment.bathrooms} bath{apartment.bathrooms === 1 ? "" : "s"}</span>
                      <span>{apartment.squareFeet ? `${apartment.squareFeet.toLocaleString()} sq ft` : "Sq ft not set"}</span>
                      <span className="font-medium text-slate-700">
                        {formatCurrency(apartment.rentAmount)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {filteredGroups.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            No apartment groups matched that filter.
          </div>
        ) : null}
      </div>

      <p className="text-sm text-slate-500">
        Showing {visibleApartmentCount} of {totalApartmentCount} apartments across{" "}
        {filteredGroups.length} of {properties.length} properties.
      </p>
    </div>
  );
}

function matchesVisibleProperty(
  property: PropertyGroup,
  propertyName: string,
) {
  return (propertyName === "all" || property.name === propertyName) && property.apartments.length > 0;
}
