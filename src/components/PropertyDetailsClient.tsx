"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

type UnitDetails = {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number | null;
  rentAmount: number | null;
  status: string;
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

const labelClass = "space-y-1.5 text-sm font-medium text-slate-700";

function formatCurrency(value: number | null) {
  if (value === null) return "--";
  return `$${value.toLocaleString()}`;
}

function DuplicateIcon({ className = "" }: { className?: string }) {
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
      <path d="M8 8h10v10H8z" />
      <path d="M6 16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
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
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export function PropertyDetailsClient({
  initialProperty,
}: {
  initialProperty: PropertyDetails;
}) {
  const router = useRouter();
  const [property, setProperty] = useState(initialProperty);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: initialProperty.name,
    type: initialProperty.type,
    address: initialProperty.address,
    city: initialProperty.city,
    state: initialProperty.state,
    zip: initialProperty.zip,
    description: initialProperty.description,
  });
  const [saving, setSaving] = useState(false);
  const [deletingUnitId, setDeletingUnitId] = useState<string | null>(null);
  const [duplicateUnitId, setDuplicateUnitId] = useState<string | null>(null);
  const [duplicateUnitNumber, setDuplicateUnitNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unitCount = property.units.length;
  const vacantCount = property.units.filter((unit) => unit.status === "vacant").length;
  const occupiedCount = property.units.filter((unit) => unit.status === "occupied").length;
  const totalSqft = property.units.reduce((sum, unit) => sum + (unit.squareFeet ?? 0), 0);

  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/properties/${property.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not update property.");
      }

      setProperty((current) => ({
        ...current,
        ...data.property,
        description: data.property.description ?? "",
      }));
      setEditing(false);
      setMessage("Property updated.");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not update property.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicateUnit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!duplicateUnitId) return;

    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/properties/${property.id}/units/${duplicateUnitId}/duplicate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitNumber: duplicateUnitNumber }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not duplicate apartment.");
      }

      const newUnit: UnitDetails = {
        id: data.unit.id,
        unitNumber: data.unit.unit_number,
        bedrooms: data.unit.bedrooms,
        bathrooms: Number(data.unit.bathrooms),
        squareFeet: data.unit.square_feet,
        rentAmount: data.unit.rent_amount === null ? null : Number(data.unit.rent_amount),
        status: data.unit.status,
      };

      setProperty((current) => ({
        ...current,
        units: [...current.units, newUnit].sort((a, b) =>
          a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }),
        ),
      }));
      setDuplicateUnitId(null);
      setDuplicateUnitNumber("");
      setMessage(`Apartment ${newUnit.unitNumber} created.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not duplicate apartment.");
    }
  }

  async function deleteUnit(unit: UnitDetails) {
    const confirmed = window.confirm(`Delete apartment ${unit.unitNumber}?`);
    if (!confirmed) return;

    setDeletingUnitId(unit.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/properties/${property.id}/units/${unit.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not delete apartment.");
      }

      setProperty((current) => ({
        ...current,
        units: current.units.filter((currentUnit) => currentUnit.id !== unit.id),
      }));
      setMessage(`Apartment ${unit.unitNumber} deleted.`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not delete apartment.");
    } finally {
      setDeletingUnitId(null);
    }
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {property.name}
            </h1>
            <p className="mt-1 text-slate-600">{property.address}</p>
            <p className="mt-0.5 text-slate-500">
              {property.city}, {property.state} {property.zip}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded border border-slate-200 px-3 py-1 text-sm font-semibold capitalize text-slate-700">
              {property.type}
            </span>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => setEditing((current) => !current)}
            >
              {editing ? "Cancel edit" : "Edit"}
            </button>
          </div>
        </div>

        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {editing ? (
          <form onSubmit={saveProperty} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Property name
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  required
                />
              </label>
              <label className={labelClass}>
                Type
                <select
                  className={inputClass}
                  value={form.type}
                  onChange={(event) => updateForm("type", event.target.value)}
                >
                  <option value="rental">Rental</option>
                  <option value="association">Association</option>
                </select>
              </label>
              <label className={`${labelClass} sm:col-span-2`}>
                Street address
                <input
                  className={inputClass}
                  value={form.address}
                  onChange={(event) => updateForm("address", event.target.value)}
                  required
                />
              </label>
              <label className={labelClass}>
                City
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={(event) => updateForm("city", event.target.value)}
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  State
                  <input
                    className={inputClass}
                    value={form.state}
                    onChange={(event) => updateForm("state", event.target.value.toUpperCase())}
                    maxLength={2}
                    required
                  />
                </label>
                <label className={labelClass}>
                  Zip
                  <input
                    className={inputClass}
                    value={form.zip}
                    onChange={(event) => updateForm("zip", event.target.value)}
                    required
                  />
                </label>
              </div>
              <label className={`${labelClass} sm:col-span-2`}>
                Description
                <textarea
                  className={`${inputClass} min-h-24 py-2.5`}
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save property"}
            </button>
          </form>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Units</p>
            <p className="mt-1 font-semibold text-slate-900">{unitCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Vacant</p>
            <p className="mt-1 font-semibold text-slate-900">{vacantCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Occupied</p>
            <p className="mt-1 font-semibold text-slate-900">{occupiedCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Square feet</p>
            <p className="mt-1 font-semibold text-slate-900">
              {totalSqft > 0 ? totalSqft.toLocaleString() : "--"}
            </p>
          </div>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Description</h2>
          <p className="mt-2 text-slate-600">
            {property.description.trim() || "No description added yet."}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Apartments</h2>
          {property.units.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Apt</th>
                    <th className="px-4 py-3 text-left font-medium">Beds</th>
                    <th className="px-4 py-3 text-left font-medium">Baths</th>
                    <th className="px-4 py-3 text-left font-medium">Sq ft</th>
                    <th className="px-4 py-3 text-left font-medium">Rent</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {property.units.map((unit) => (
                    <tr key={unit.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {unit.unitNumber}
                      </td>
                      <td className="px-4 py-3">{unit.bedrooms}</td>
                      <td className="px-4 py-3">{unit.bathrooms}</td>
                      <td className="px-4 py-3">
                        {unit.squareFeet?.toLocaleString() ?? "--"}
                      </td>
                      <td className="px-4 py-3">{formatCurrency(unit.rentAmount)}</td>
                      <td className="px-4 py-3 capitalize">{unit.status}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          aria-label={`Duplicate apartment ${unit.unitNumber}`}
                          title="Duplicate apartment"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          onClick={() => {
                            setDuplicateUnitId(unit.id);
                            setDuplicateUnitNumber("");
                            setError(null);
                            setMessage(null);
                          }}
                        >
                          <DuplicateIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete apartment ${unit.unitNumber}`}
                          title="Delete apartment"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void deleteUnit(unit)}
                          disabled={deletingUnitId === unit.id}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-slate-500">No apartments found for this property.</p>
          )}
        </section>
      </div>

      {duplicateUnitId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close duplicate apartment dialog"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setDuplicateUnitId(null)}
          />
          <form
            onSubmit={duplicateUnit}
            className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Duplicate apartment
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Enter the new apartment number. Details like beds, baths, rent, and status will be copied.
            </p>
            <label className="mt-4 block space-y-1.5 text-sm font-medium text-slate-700">
              New apartment number
              <input
                className={inputClass}
                value={duplicateUnitNumber}
                onChange={(event) => setDuplicateUnitNumber(event.target.value)}
                placeholder="Example: 2B"
                autoFocus
                required
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setDuplicateUnitId(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Create apartment
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </article>
  );
}
