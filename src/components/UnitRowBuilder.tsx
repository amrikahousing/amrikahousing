"use client";

export type UnitDraft = {
  unit_number: string;
  bedrooms: string;
  bathrooms: string;
  square_feet: string;
  rent_amount: string;
  status: "vacant" | "occupied" | "maintenance";
};

export function emptyUnit(): UnitDraft {
  return { unit_number: "", bedrooms: "0", bathrooms: "0", square_feet: "", rent_amount: "", status: "vacant" };
}

type Props = {
  units: UnitDraft[];
  onChange: (units: UnitDraft[]) => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

export function UnitRowBuilder({ units, onChange }: Props) {
  function update(index: number, patch: Partial<UnitDraft>) {
    onChange(units.map((u, i) => (i === index ? { ...u, ...patch } : u)));
  }

  function remove(index: number) {
    onChange(units.filter((_, i) => i !== index));
  }

  function add() {
    if (units.length >= 50) return;
    onChange([...units, emptyUnit()]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[1fr_60px_60px_80px_90px_90px_28px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
        <span>Unit #</span>
        <span>Beds</span>
        <span>Baths</span>
        <span>Sq ft</span>
        <span>Rent/mo</span>
        <span>Status</span>
        <span />
      </div>

      {units.map((unit, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_60px_60px_80px_90px_90px_28px] sm:items-center sm:border-0 sm:bg-transparent sm:p-0">
          <input
            className={inputClass}
            placeholder={`Unit ${i + 1}`}
            value={unit.unit_number}
            onChange={(e) => update(i, { unit_number: e.target.value })}
          />
          <input
            className={inputClass}
            type="number"
            min="0"
            placeholder="0"
            value={unit.bedrooms}
            onChange={(e) => update(i, { bedrooms: e.target.value })}
          />
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.5"
            placeholder="0"
            value={unit.bathrooms}
            onChange={(e) => update(i, { bathrooms: e.target.value })}
          />
          <input
            className={inputClass}
            type="number"
            min="0"
            placeholder="—"
            value={unit.square_feet}
            onChange={(e) => update(i, { square_feet: e.target.value })}
          />
          <input
            className={inputClass}
            type="number"
            min="0"
            step="50"
            placeholder="—"
            value={unit.rent_amount}
            onChange={(e) => update(i, { rent_amount: e.target.value })}
          />
          <select
            className={inputClass}
            value={unit.status}
            onChange={(e) => update(i, { status: e.target.value as UnitDraft["status"] })}
          >
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <button
            type="button"
            onClick={() => remove(i)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        disabled={units.length >= 50}
        className="flex items-center gap-2 self-start rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800 disabled:opacity-40"
      >
        <span>+</span> Add unit
      </button>
      {units.length >= 50 && (
        <p className="text-xs text-slate-500">Max 50 units via form for now.</p>
      )}
    </div>
  );
}
