"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UnitRowBuilder, emptyUnit } from "./UnitRowBuilder";
import type { UnitDraft } from "./UnitRowBuilder";

const inputClass =
  "w-full rounded-[8px] border border-white/15 bg-white/6 px-3 py-2.5 text-[13px] text-white placeholder-white/30 focus:border-white/35 focus:outline-none";

const labelClass = "block text-[12px] font-semibold text-white/55 mb-1.5";

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
      {/* Property details */}
      <section className="rounded-[12px] border border-white/12 bg-[var(--card)] p-5 backdrop-blur-[16px]">
        <h2 className="mb-4 text-[16px] font-semibold text-white">Property details</h2>
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

      {/* Units */}
      <section className="rounded-[12px] border border-white/12 bg-[var(--card)] p-5 backdrop-blur-[16px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-white">Units</h2>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-white/60">
            <div
              role="checkbox"
              aria-checked={multiUnit}
              onClick={() => setMultiUnit((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${multiUnit ? "bg-[var(--green)]" : "bg-white/20"}`}
            >
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${multiUnit ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            Multiple units
          </label>
        </div>
        {multiUnit ? (
          <UnitRowBuilder units={units} onChange={setUnits} />
        ) : (
          <p className="text-[13px] text-white/45">
            A single unit will be created automatically. Toggle &quot;Multiple units&quot; to configure individual unit details.
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-[8px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-[8px] border border-white/15 bg-white/8 px-4 py-2.5 text-[13px] text-white/70 hover:bg-white/12"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-[8px] bg-[linear-gradient(180deg,rgba(16,185,129,1),rgba(10,145,100,1))] px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? "Saving…" : "Add property"}
        </button>
      </div>
    </form>
  );
}
