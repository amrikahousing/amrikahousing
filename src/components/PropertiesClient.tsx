"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type PropertyStatus = "available" | "occupied" | "maintenance";

type Property = {
  id: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: string;
  bedrooms: number;
  bathrooms: string;
  sqft: number;
  description: string;
  status: PropertyStatus;
  imageUrl: string;
};

const initialProperties: Property[] = [
  {
    id: 1,
    address: "Oak Terrace 2B",
    city: "Atlanta",
    state: "GA",
    zipCode: "30303",
    price: "2450.00",
    bedrooms: 2,
    bathrooms: "2.0",
    sqft: 1180,
    description: "Bright apartment near transit and daily errands.",
    status: "available",
    imageUrl: "https://placehold.co/600x400/dbeafe/334155?text=Oak+Terrace",
  },
  {
    id: 2,
    address: "Maple Court 4A",
    city: "Decatur",
    state: "GA",
    zipCode: "30030",
    price: "3100.00",
    bedrooms: 3,
    bathrooms: "2.5",
    sqft: 1540,
    description: "Townhome with attached parking and a private patio.",
    status: "occupied",
    imageUrl: "https://placehold.co/600x400/dcfce7/334155?text=Maple+Court",
  },
  {
    id: 3,
    address: "Cedar House",
    city: "Marietta",
    state: "GA",
    zipCode: "30060",
    price: "2800.00",
    bedrooms: 3,
    bathrooms: "2.0",
    sqft: 1425,
    description: "Single-family home with a fenced yard.",
    status: "maintenance",
    imageUrl: "https://placehold.co/600x400/fef3c7/334155?text=Cedar+House",
  },
  {
    id: 4,
    address: "Pine Lofts 8C",
    city: "Sandy Springs",
    state: "GA",
    zipCode: "30328",
    price: "2200.00",
    bedrooms: 1,
    bathrooms: "1.0",
    sqft: 860,
    description: "Loft-style unit with skyline views.",
    status: "available",
    imageUrl: "https://placehold.co/600x400/e0e7ff/334155?text=Pine+Lofts",
  },
];

const statusStyles: Record<PropertyStatus, string> = {
  available: "border-emerald-200 bg-emerald-100 text-emerald-700",
  occupied: "border-sky-200 bg-sky-100 text-sky-700",
  maintenance: "border-amber-200 bg-amber-100 text-amber-700",
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";
const invalidInputClass =
  "border-red-300 bg-red-50/40 focus:border-red-500 focus:ring-red-500/15";

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

  if (name === "search") {
    return (
      <svg {...shared}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }

  if (name === "filter") {
    return (
      <svg {...shared}>
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
    );
  }

  if (name === "plus") {
    return (
      <svg {...shared}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (name === "map") {
    return (
      <svg {...shared}>
        <path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z" />
        <circle cx="12" cy="10" r="2" />
      </svg>
    );
  }

  if (name === "bed") {
    return (
      <svg {...shared}>
        <path d="M4 11V5M20 14H4M20 19v-8a2 2 0 0 0-2-2h-7v5M4 19v-8" />
        <path d="M7 9h4" />
      </svg>
    );
  }

  if (name === "bath") {
    return (
      <svg {...shared}>
        <path d="M6 10V6a3 3 0 0 1 6 0v1" />
        <path d="M4 11h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path d="M4 18V6h16v12H4Z" />
      <path d="M8 6v12M16 6v12" />
    </svg>
  );
}

function PropertyCard({ property }: { property: Property }) {
  return (
    <article className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-xl">
      <div className="relative h-48 overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={property.imageUrl}
          alt={property.address}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute right-3 top-3">
          <span
            className={[
              "rounded border px-3 py-1 text-xs font-semibold capitalize shadow-sm",
              statusStyles[property.status],
            ].join(" ")}
          >
            {property.status}
          </span>
        </div>
        <div className="absolute bottom-3 left-3">
          <div className="rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-slate-900 shadow-lg backdrop-blur-sm">
            ${Number(property.price).toLocaleString()}/mo
          </div>
        </div>
      </div>

      <div className="p-5 pb-2">
        <h2 className="truncate text-lg font-bold text-slate-900">
          {property.address}
        </h2>
        <div className="mt-1 flex items-center text-sm text-slate-500">
          <Icon name="map" className="mr-1 h-3.5 w-3.5" />
          {property.city}, {property.state} {property.zipCode}
        </div>
      </div>

      <div className="p-5 pt-4 pb-4">
        <p className="mb-4 line-clamp-2 min-h-[40px] text-sm text-slate-500">
          {property.description}
        </p>
        <div className="flex items-center justify-between text-sm text-slate-600">
          <div className="flex items-center gap-1.5">
            <Icon name="bed" className="h-4 w-4 text-emerald-600" />
            <span>{property.bedrooms} Beds</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon name="bath" className="h-4 w-4 text-emerald-600" />
            <span>{Number(property.bathrooms)} Baths</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon name="ruler" className="h-4 w-4 text-emerald-600" />
            <span>{property.sqft} sqft</span>
          </div>
        </div>
      </div>

      <div className="p-5 pt-0">
        <Link
          href={`/properties/${property.id}`}
          className="block w-full rounded-lg bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white shadow-md transition-colors hover:bg-slate-800"
        >
          View Details
        </Link>
      </div>
    </article>
  );
}

function emptyProperty(nextId: number): Property {
  return {
    id: nextId,
    address: "",
    city: "",
    state: "",
    zipCode: "",
    price: "0.00",
    bedrooms: 1,
    bathrooms: "1.0",
    sqft: 500,
    description: "",
    status: "available",
    imageUrl: `https://placehold.co/600x400/e2e8f0/334155?text=Property+${nextId}`,
  };
}

export function PropertiesClient() {
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<PropertyStatus | "all">("all");
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Property>(() =>
    emptyProperty(initialProperties.length + 1),
  );
  const [fieldErrors, setFieldErrors] = useState({ address: "", city: "", state: "", zipCode: "" });
  const addressRef = useRef<HTMLInputElement | null>(null);
  const cityRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef<HTMLInputElement | null>(null);
  const zipRef = useRef<HTMLInputElement | null>(null);

  const filteredProperties = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return properties.filter((property) => {
      const matchesStatus =
        filterStatus === "all" || property.status === filterStatus;
      const matchesSearch =
        !normalizedSearch ||
        [
          property.address,
          property.city,
          property.state,
          property.zipCode,
          property.description,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [filterStatus, properties, search]);

  function updateDraft<K extends keyof Property>(key: K, value: Property[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key in fieldErrors && fieldErrors[key as keyof typeof fieldErrors]) {
      setFieldErrors((current) => ({ ...current, [key]: "" }));
    }
  }

  function fieldClass(field: keyof typeof fieldErrors) {
    return `${inputClass} ${fieldErrors[field] ? invalidInputClass : ""}`;
  }

  function errorText(field: keyof typeof fieldErrors) {
    return fieldErrors[field] ? <p className="text-xs font-medium text-red-600">{fieldErrors[field]}</p> : null;
  }

  function saveProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = {
      address: draft.address.trim() ? "" : "Address is required.",
      city: draft.city.trim() ? "" : "City is required.",
      state: draft.state.trim() ? "" : "State is required.",
      zipCode: draft.zipCode.trim() ? "" : "Zip code is required.",
    };
    setFieldErrors(nextErrors);
    if (nextErrors.address || nextErrors.city || nextErrors.state || nextErrors.zipCode) {
      if (nextErrors.address) addressRef.current?.focus();
      else if (nextErrors.city) cityRef.current?.focus();
      else if (nextErrors.state) stateRef.current?.focus();
      else zipRef.current?.focus();
      return;
    }
    setProperties((current) => [draft, ...current]);
    setIsOpen(false);
    setFieldErrors({ address: "", city: "", state: "", zipCode: "" });
    setDraft(emptyProperty(Math.max(...properties.map((item) => item.id)) + 2));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Properties
          </h1>
          <p className="mt-1 text-slate-500">
            Manage your rental units and houses.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition-colors hover:bg-emerald-700 md:self-auto"
          onClick={() => setIsOpen(true)}
        >
          <Icon name="plus" className="h-4 w-4" />
          Add Property
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            className={`${inputClass} bg-slate-50 pl-10 focus:bg-white`}
            placeholder="Search properties..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <label className="relative sm:w-44">
          <span className="sr-only">Filter by status</span>
          <Icon
            name="filter"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <select
            className={`${inputClass} appearance-none pl-10 text-slate-600`}
            value={filterStatus}
            onChange={(event) =>
              setFilterStatus(event.target.value as PropertyStatus | "all")
            }
          >
            <option value="all">All</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredProperties.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
        {filteredProperties.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-500">
            No properties found. Try creating one.
          </div>
        ) : null}
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close add property dialog"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setIsOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-property-title"
            className="relative flex h-[90dvh] max-h-[900px] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
          >
            <div className="border-b border-slate-200 px-6 pb-2 pt-6">
              <h2
                id="add-property-title"
                className="text-lg font-semibold text-slate-900"
              >
                Add New Property
              </h2>
            </div>

            <form
              id="add-property-form"
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={saveProperty}
              noValidate
            >
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">
                    Address
                  </span>
                  <input
                    ref={addressRef}
                    className={fieldClass("address")}
                    placeholder="123 Main St"
                    value={draft.address}
                    required
                    aria-invalid={!!fieldErrors.address}
                    onChange={(event) =>
                      updateDraft("address", event.target.value)
                    }
                  />
                  {errorText("address")}
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      City
                    </span>
                    <input
                      ref={cityRef}
                      className={fieldClass("city")}
                      placeholder="Atlanta"
                      value={draft.city}
                      required
                      aria-invalid={!!fieldErrors.city}
                      onChange={(event) =>
                        updateDraft("city", event.target.value)
                      }
                    />
                    {errorText("city")}
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      State
                    </span>
                    <input
                      ref={stateRef}
                      className={fieldClass("state")}
                      placeholder="GA"
                      maxLength={2}
                      value={draft.state}
                      required
                      aria-invalid={!!fieldErrors.state}
                      onChange={(event) =>
                        updateDraft("state", event.target.value.toUpperCase())
                      }
                    />
                    {errorText("state")}
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      Zip Code
                    </span>
                    <input
                      ref={zipRef}
                      className={fieldClass("zipCode")}
                      placeholder="30303"
                      value={draft.zipCode}
                      required
                      aria-invalid={!!fieldErrors.zipCode}
                      onChange={(event) =>
                        updateDraft("zipCode", event.target.value)
                      }
                    />
                    {errorText("zipCode")}
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      Price ($)
                    </span>
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.price}
                      onChange={(event) =>
                        updateDraft("price", event.target.value)
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      Square Feet
                    </span>
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      value={draft.sqft}
                      onChange={(event) =>
                        updateDraft("sqft", Number(event.target.value))
                      }
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      Bedrooms
                    </span>
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      value={draft.bedrooms}
                      onChange={(event) =>
                        updateDraft("bedrooms", Number(event.target.value))
                      }
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-700">
                      Bathrooms
                    </span>
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      step="0.5"
                      value={draft.bathrooms}
                      onChange={(event) =>
                        updateDraft("bathrooms", event.target.value)
                      }
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">
                    Description
                  </span>
                  <input
                    className={inputClass}
                    placeholder="Beautiful downtown apartment..."
                    value={draft.description}
                    onChange={(event) =>
                      updateDraft("description", event.target.value)
                    }
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">
                    Status
                  </span>
                  <select
                    className={inputClass}
                    value={draft.status}
                    onChange={(event) =>
                      updateDraft("status", event.target.value as PropertyStatus)
                    }
                  >
                    <option value="available">Available</option>
                    <option value="occupied">Occupied</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </label>
              </div>

              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  Save Property
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
