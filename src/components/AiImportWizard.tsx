"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AiParsedProperty, AiParsedUnit, AiImportContext } from "@/lib/ai-import-types";
import type { SkippedUnit } from "@/app/api/properties/[id]/units/bulk/route";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

const inputErrorClass =
  "w-full rounded-lg border border-red-400 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20";

type Step = "input" | "preview" | "success";

type ExistingProperty = {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

function missingRequiredFields(p: AiParsedProperty): (keyof AiParsedProperty)[] {
  const missing: (keyof AiParsedProperty)[] = [];
  if (!p.name?.trim()) missing.push("name");
  if (!p.address?.trim()) missing.push("address");
  if (!p.city?.trim()) missing.push("city");
  if (!p.state?.trim()) missing.push("state");
  if (!p.zip?.trim()) missing.push("zip");
  return missing;
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-400">
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ─── Units-only preview card (used when adding to an existing property) ────────

function UnitsPreviewCard({
  units,
  onChange,
}: {
  units: AiParsedUnit[];
  onChange: (units: AiParsedUnit[]) => void;
}) {
  function setUnit(i: number, field: keyof AiParsedUnit, value: string) {
    const next = [...units];
    next[i] = {
      ...next[i],
      [field]: field === "unit_number" || field === "status" ? value : value === "" ? undefined : Number(value),
    };
    onChange(next);
  }

  function removeUnit(i: number) {
    onChange(units.filter((_, idx) => idx !== i));
  }

  if (units.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
        No units extracted. Go back and refine your description.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {units.length} unit{units.length !== 1 ? "s" : ""} to add
        </span>
      </div>
      <div className="overflow-x-auto px-4 pb-4 pt-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-1 pr-3 font-semibold">Unit #</th>
              <th className="pb-1 pr-3 font-semibold">Beds</th>
              <th className="pb-1 pr-3 font-semibold">Baths</th>
              <th className="pb-1 pr-3 font-semibold">Sq ft</th>
              <th className="pb-1 pr-3 font-semibold">Rent</th>
              <th className="pb-1 pr-3 font-semibold">Status</th>
              <th className="pb-1 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit, i) => (
              <tr key={i}>
                <td className="pr-3 py-0.5"><input className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs" value={unit.unit_number} onChange={(e) => setUnit(i, "unit_number", e.target.value)} /></td>
                <td className="pr-3 py-0.5"><input className="w-12 rounded border border-slate-200 px-1.5 py-1 text-xs" type="number" value={unit.bedrooms ?? ""} onChange={(e) => setUnit(i, "bedrooms", e.target.value)} /></td>
                <td className="pr-3 py-0.5"><input className="w-12 rounded border border-slate-200 px-1.5 py-1 text-xs" type="number" step="0.5" value={unit.bathrooms ?? ""} onChange={(e) => setUnit(i, "bathrooms", e.target.value)} /></td>
                <td className="pr-3 py-0.5"><input className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs" type="number" value={unit.square_feet ?? ""} onChange={(e) => setUnit(i, "square_feet", e.target.value)} /></td>
                <td className="pr-3 py-0.5"><input className="w-20 rounded border border-slate-200 px-1.5 py-1 text-xs" type="number" value={unit.rent_amount ?? ""} onChange={(e) => setUnit(i, "rent_amount", e.target.value)} /></td>
                <td className="pr-3 py-0.5">
                  <select className="rounded border border-slate-200 px-1.5 py-1 text-xs" value={unit.status ?? "vacant"} onChange={(e) => setUnit(i, "status", e.target.value)}>
                    <option value="vacant">Vacant</option>
                    <option value="occupied">Occupied</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </td>
                <td className="py-0.5">
                  <button type="button" onClick={() => removeUnit(i)} className="text-red-400 hover:text-red-600 px-1">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Full property card (used in new-property mode) ───────────────────────────

function PropertyCard({
  property,
  index,
  onChange,
  onRemove,
  showValidation,
}: {
  property: AiParsedProperty;
  index: number;
  onChange: (p: AiParsedProperty) => void;
  onRemove: () => void;
  showValidation: boolean;
}) {
  function set(field: keyof AiParsedProperty, value: string) {
    onChange({ ...property, [field]: value });
  }

  function setUnit(unitIndex: number, field: keyof AiParsedUnit, value: string) {
    const units = [...(property.units ?? [])];
    units[unitIndex] = {
      ...units[unitIndex],
      [field]: field === "unit_number" || field === "status" ? value : value === "" ? undefined : Number(value),
    };
    onChange({ ...property, units });
  }

  const missing = showValidation ? missingRequiredFields(property) : [];

  function cls(field: keyof AiParsedProperty) {
    return missing.includes(field) ? inputErrorClass : inputClass;
  }

  return (
    <div className={`rounded-lg border bg-white shadow-sm ${missing.length > 0 ? "border-red-300" : "border-slate-200"}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Property {index + 1}</span>
          {missing.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Fill in required fields
            </span>
          )}
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700">Remove</button>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Name *</label>
          <input className={cls("name")} value={property.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sunset Apartments" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Type</label>
          <select className={inputClass} value={property.type} onChange={(e) => set("type", e.target.value)}>
            <option value="rental">Rental</option>
            <option value="association">Association (HOA/Condo)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-600">Address *</label>
          <input className={cls("address")} value={property.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">City *</label>
          <input className={cls("city")} value={property.city} onChange={(e) => set("city", e.target.value)} placeholder="Boston" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">State *</label>
            <input className={cls("state")} maxLength={2} value={property.state} onChange={(e) => set("state", e.target.value.toUpperCase())} placeholder="MA" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Zip *</label>
            <input className={cls("zip")} value={property.zip} onChange={(e) => set("zip", e.target.value)} placeholder="02101" />
          </div>
        </div>
        {property.description !== undefined && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Description</label>
            <input className={inputClass} value={property.description} onChange={(e) => set("description", e.target.value)} />
          </div>
        )}
      </div>
      {property.units && property.units.length > 0 && (
        <div className="border-t border-slate-100 px-4 pb-4">
          <p className="mb-2 pt-3 text-xs font-semibold text-slate-500">{property.units.length} unit{property.units.length !== 1 ? "s" : ""} detected</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-1 pr-3 font-semibold">Unit #</th>
                  <th className="pb-1 pr-3 font-semibold">Beds</th>
                  <th className="pb-1 pr-3 font-semibold">Baths</th>
                  <th className="pb-1 pr-3 font-semibold">Sq ft</th>
                  <th className="pb-1 pr-3 font-semibold">Rent</th>
                  <th className="pb-1 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {property.units.map((unit, ui) => (
                  <tr key={ui}>
                    <td className="pr-3 py-0.5"><input className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs" value={unit.unit_number} onChange={(e) => setUnit(ui, "unit_number", e.target.value)} /></td>
                    <td className="pr-3 py-0.5"><input className="w-12 rounded border border-slate-200 px-1.5 py-1 text-xs" type="number" value={unit.bedrooms ?? ""} onChange={(e) => setUnit(ui, "bedrooms", e.target.value)} /></td>
                    <td className="pr-3 py-0.5"><input className="w-12 rounded border border-slate-200 px-1.5 py-1 text-xs" type="number" step="0.5" value={unit.bathrooms ?? ""} onChange={(e) => setUnit(ui, "bathrooms", e.target.value)} /></td>
                    <td className="pr-3 py-0.5"><input className="w-16 rounded border border-slate-200 px-1.5 py-1 text-xs" type="number" value={unit.square_feet ?? ""} onChange={(e) => setUnit(ui, "square_feet", e.target.value)} /></td>
                    <td className="pr-3 py-0.5"><input className="w-20 rounded border border-slate-200 px-1.5 py-1 text-xs" type="number" value={unit.rent_amount ?? ""} onChange={(e) => setUnit(ui, "rent_amount", e.target.value)} /></td>
                    <td className="py-0.5">
                      <select className="rounded border border-slate-200 px-1.5 py-1 text-xs" value={unit.status ?? "vacant"} onChange={(e) => setUnit(ui, "status", e.target.value)}>
                        <option value="vacant">Vacant</option>
                        <option value="occupied">Occupied</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {(!property.units || property.units.length === 0) && (
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">A single vacant unit will be created automatically.</p>
      )}
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function AiImportWizard({ existingProperty }: { existingProperty?: ExistingProperty }) {
  const router = useRouter();
  const addUnitsMode = !!existingProperty;

  const [step, setStep] = useState<Step>("input");
  const [prompt, setPrompt] = useState("");
  const [context, setContext] = useState<AiImportContext>({ type: "rental" });
  const [contextOpen, setContextOpen] = useState(false);

  // New-property mode state
  const [properties, setProperties] = useState<AiParsedProperty[]>([]);

  // Add-units mode state
  const [parsedUnits, setParsedUnits] = useState<AiParsedUnit[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [skippedUnits, setSkippedUnits] = useState<SkippedUnit[]>([]);

  const [isParsing, setIsParsing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  function setCtx(field: keyof AiImportContext, value: string) {
    setContext((c) => ({ ...c, [field]: value }));
  }

  const hasContext = Object.entries(context).some(([k, v]) => k !== "type" && v?.trim());

  async function handleParse() {
    setIsParsing(true);
    setParseError(null);
    try {
      const aiContext: AiImportContext | undefined = addUnitsMode
        ? {
            name: existingProperty!.name,
            type: existingProperty!.type,
            address: existingProperty!.address,
            city: existingProperty!.city,
            state: existingProperty!.state,
            zip: existingProperty!.zip,
          }
        : hasContext
        ? context
        : undefined;

      const res = await fetch("/api/ai-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, context: aiContext }),
      });
      const data: { properties?: AiParsedProperty[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to parse properties");

      if (addUnitsMode) {
        // Extract units from the first (and only) parsed property
        const units = data.properties?.[0]?.units ?? [];
        setParsedUnits(units);
      } else {
        setProperties(data.properties!);
      }

      setShowValidation(false);
      setStep("preview");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleConfirmUnits() {
    if (parsedUnits.length === 0) {
      setConfirmError("No units to add. Go back and refine your description.");
      return;
    }
    setIsConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/properties/${existingProperty!.id}/units/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ units: parsedUnits }),
      });
      const data: { added?: number; skipped?: SkippedUnit[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create units");
      setAddedCount(data.added!);
      setSkippedUnits(data.skipped ?? []);
      setStep("success");
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleConfirmProperties() {
    const anyMissing = properties.some((p) => missingRequiredFields(p).length > 0);
    if (anyMissing) {
      setShowValidation(true);
      setConfirmError("Please fill in all required fields highlighted in red before saving.");
      return;
    }
    setIsConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch("/api/properties/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties }),
      });
      const data: { importedCount?: number; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create properties");
      setImportedCount(data.importedCount!);
      setStep("success");
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsConfirming(false);
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────

  if (step === "success") {
    if (addUnitsMode) {
      return (
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-emerald-600">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                {addedCount} unit{addedCount !== 1 ? "s" : ""} added to {existingProperty!.name}
              </p>
              {skippedUnits.length === 0 && (
                <p className="text-sm text-slate-500">All units were imported successfully.</p>
              )}
            </div>
          </div>

          {skippedUnits.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-semibold text-amber-800">
                {skippedUnits.length} unit{skippedUnits.length !== 1 ? "s" : ""} were not added
              </p>
              <ul className="space-y-1">
                {skippedUnits.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                    <span className="mt-0.5 font-medium shrink-0">Unit {s.unit_number}:</span>
                    <span>{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep("input");
                setPrompt("");
                setParsedUnits([]);
                setAddedCount(0);
                setSkippedUnits([]);
              }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Add more units
            </button>
            <button
              onClick={() => router.push(`/properties/${existingProperty!.id}`)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              View property
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-slate-200 bg-white py-16 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-emerald-600">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900">{importedCount} propert{importedCount !== 1 ? "ies" : "y"} added</p>
          <p className="mt-1 text-sm text-slate-500">Your properties have been created successfully.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setStep("input"); setPrompt(""); setProperties([]); setContext({ type: "rental" }); setContextOpen(false); }}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Add more
          </button>
          <button onClick={() => router.push("/properties")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            View properties
          </button>
        </div>
      </div>
    );
  }

  // ── Preview screen ──────────────────────────────────────────────────────────

  if (step === "preview") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {addUnitsMode
              ? <>Review the <span className="font-semibold">{parsedUnits.length}</span> unit{parsedUnits.length !== 1 ? "s" : ""} to add.</>
              : <>Review and edit the <span className="font-semibold">{properties.length}</span> propert{properties.length !== 1 ? "ies" : "y"} extracted.</>
            }
          </p>
          <button onClick={() => setStep("input")} className="text-sm text-slate-500 hover:text-slate-700">← Back</button>
        </div>

        {addUnitsMode ? (
          <>
            {/* Locked property banner */}
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <MapPinIcon />
              <div className="text-sm text-slate-700">
                <span className="font-semibold">{existingProperty!.name}</span>
                <span className="ml-2 text-slate-500">{existingProperty!.address}, {existingProperty!.city}, {existingProperty!.state} {existingProperty!.zip}</span>
              </div>
            </div>
            <UnitsPreviewCard units={parsedUnits} onChange={setParsedUnits} />
          </>
        ) : (
          properties.map((p, i) => (
            <PropertyCard
              key={i}
              property={p}
              index={i}
              showValidation={showValidation}
              onChange={(updated) => setProperties((prev) => prev.map((x, idx) => idx === i ? updated : x))}
              onRemove={() => setProperties((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))
        )}

        {confirmError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{confirmError}</div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setStep("input")} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
            Back
          </button>
          <button
            type="button"
            onClick={addUnitsMode ? handleConfirmUnits : handleConfirmProperties}
            disabled={isConfirming || (addUnitsMode ? parsedUnits.length === 0 : properties.length === 0)}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isConfirming
              ? "Saving…"
              : addUnitsMode
              ? `Add ${parsedUnits.length} unit${parsedUnits.length !== 1 ? "s" : ""}`
              : `Add ${properties.length} propert${properties.length !== 1 ? "ies" : "y"}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Input screen ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Locked property banner (add-units mode) */}
      {addUnitsMode && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <MapPinIcon />
          <div className="text-sm text-slate-700">
            Adding units to <span className="font-semibold">{existingProperty!.name}</span>
            <span className="ml-2 text-slate-500">{existingProperty!.address}, {existingProperty!.city}, {existingProperty!.state} {existingProperty!.zip}</span>
          </div>
        </div>
      )}

      {/* Property context panel (new-property mode only) */}
      {!addUnitsMode && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setContextOpen((v) => !v)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
          >
            <div>
              <span className="text-sm font-semibold text-slate-700">Property details</span>
              <span className="ml-2 text-xs text-slate-400">(optional — fill in if pasting a unit list)</span>
            </div>
            <ChevronIcon open={contextOpen} />
          </button>

          {contextOpen && (
            <div className="grid gap-3 border-t border-slate-100 px-6 pb-5 pt-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Property name</label>
                <input className={inputClass} placeholder="e.g. Sunset Apartments" value={context.name ?? ""} onChange={(e) => setCtx("name", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Type</label>
                <select className={inputClass} value={context.type ?? "rental"} onChange={(e) => setCtx("type", e.target.value)}>
                  <option value="rental">Rental</option>
                  <option value="association">Association (HOA/Condo)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Street address</label>
                <input className={inputClass} placeholder="123 Main St" value={context.address ?? ""} onChange={(e) => setCtx("address", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">City</label>
                <input className={inputClass} placeholder="Boston" value={context.city ?? ""} onChange={(e) => setCtx("city", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">State</label>
                  <input className={inputClass} placeholder="MA" maxLength={2} value={context.state ?? ""} onChange={(e) => setCtx("state", e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Zip</label>
                  <input className={inputClass} placeholder="02101" value={context.zip ?? ""} onChange={(e) => setCtx("zip", e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prompt textarea */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
          {addUnitsMode ? "Unit data" : "Property or unit data"}
        </label>
        <p className="mb-3 text-xs text-slate-500">
          {addUnitsMode
            ? "Paste a unit list or describe the units to add. Include whatever you have — unit numbers, bedrooms, square footage, rent."
            : "Paste a unit list, a spreadsheet table, or describe properties in plain text. Include whatever you have — addresses, bedrooms, square footage, rent."}
        </p>
        <textarea
          className={`${inputClass} resize-none font-mono`}
          rows={10}
          placeholder={
            addUnitsMode
              ? `Paste a unit list:\n501\t1360\t$2,800\t2BR\n502\t890\t$1,800\t1BR\n503\t520\t$1,550\tstudio\n\nOr describe units:\n• Unit 3A — 2BR/1BA, 850 sqft, $1,900/mo\n• Unit 3B — 1BR/1BA, 620 sqft, $1,500/mo`
              : `Paste a unit list:\n501\t1360\t$2,800\t2BR\n502\t890\t$1,800\t1BR\n503\t520\t$1,550\ts\n\nOr describe properties:\n• 123 Main St, Boston MA 02101 — 3BR/2BA, $2,500/mo\n• 456 Oak Ave, Cambridge MA 02139 — 12-unit building`
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        {parseError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{parseError}</div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleParse}
          disabled={isParsing || !prompt.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <SparklesIcon />
          {isParsing ? "Parsing…" : "Parse with AI"}
        </button>
      </div>
    </div>
  );
}
