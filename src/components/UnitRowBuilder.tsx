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
  "w-full rounded-[8px] border border-white/15 bg-white/6 px-3 py-2 text-[13px] text-white placeholder-white/30 focus:border-white/35 focus:outline-none";

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
      {/* Header */}
      <div className="hidden grid-cols-[1fr_60px_60px_80px_90px_90px_28px] gap-2 px-1 text-[11px] font-semibold text-white/40 uppercase tracking-wide sm:grid">
        <span>Unit #</span>
        <span>Beds</span>
        <span>Baths</span>
        <span>Sq ft</span>
        <span>Rent/mo</span>
        <span>Status</span>
        <span />
      </div>

      {units.map((unit, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-[8px] border border-white/10 bg-white/4 p-3 sm:grid-cols-[1fr_60px_60px_80px_90px_90px_28px] sm:items-center sm:border-0 sm:bg-transparent sm:p-0">
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
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-white/30 hover:bg-red-500/15 hover:text-red-400 transition-colors"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        disabled={units.length >= 50}
        className="flex items-center gap-2 self-start rounded-[8px] border border-dashed border-white/20 px-3 py-2 text-[13px] text-white/50 hover:border-white/35 hover:text-white/70 disabled:opacity-40 transition-colors"
      >
        <span>+</span> Add unit
      </button>
      {units.length >= 50 && (
        <p className="text-[12px] text-white/40">Max 50 units via form — use CSV import for larger portfolios.</p>
      )}
    </div>
  );
}
