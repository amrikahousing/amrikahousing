"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UnitRowBuilder, emptyUnit } from "./UnitRowBuilder";
import type { UnitDraft } from "./UnitRowBuilder";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

export function PropertyForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiUnit, setMultiUnit] = useState(false);
  const [units, setUnits] = useState<UnitDraft[]>([emptyUnit()]);

  const [form, setForm] = useState({
    name: "", type: "rental", address: "", city: "", state: "", zip: "", description: "",
  });

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const unitPayload = multiUnit
      ? units.map((u) => ({
          unit_number: u.unit_number || String(units.indexOf(u) + 1),
          bedrooms: parseInt(u.bedrooms) || 0,
          bathrooms: parseFloat(u.bathrooms) || 0,
          square_feet: u.square_feet ? parseInt(u.square_feet) : undefined,
          rent_amount: u.rent_amount ? parseFloat(u.rent_amount) : undefined,
          status: u.status,
        }))
      : [];

    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, units: unitPayload }),
      });
      const data: { propertyId?: string; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create property");
      router.push("/properties");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Property details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Property name *</label>
            <input className={inputClass} placeholder="e.g. Oak Terrace" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Type *</label>
            <select className={inputClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
              <option value="rental">Rental</option>
              <option value="association">Association (HOA/Condo)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Street address *</label>
            <input className={inputClass} placeholder="123 Oak Ave" value={form.address} onChange={(e) => set("address", e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>City *</label>
            <input className={inputClass} placeholder="Atlanta" value={form.city} onChange={(e) => set("city", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>State *</label>
              <input className={inputClass} placeholder="GA" maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase())} required />
            </div>
            <div>
              <label className={labelClass}>Zip *</label>
              <input className={inputClass} placeholder="30303" value={form.zip} onChange={(e) => set("zip", e.target.value)} required />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="Optional notes about this property…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Units</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <div
              role="checkbox"
              aria-checked={multiUnit}
              onClick={() => setMultiUnit((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${multiUnit ? "bg-emerald-500" : "bg-slate-300"}`}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${multiUnit ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            Multiple units
          </label>
        </div>
        {multiUnit ? (
          <UnitRowBuilder units={units} onChange={setUnits} />
        ) : (
          <p className="text-sm text-slate-500">
            A single unit will be created automatically. Toggle &quot;Multiple units&quot; to configure individual unit details.
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isLoading ? "Saving…" : "Add property"}
        </button>
      </div>
    </form>
  );
}
