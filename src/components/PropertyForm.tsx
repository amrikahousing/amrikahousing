"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY_TYPE_OPTIONS, normalizePropertyType } from "@/lib/property-types";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";
const invalidInputClass =
  "border-red-300 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20";

const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

type FormState = {
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const requiredFields: Array<{ field: keyof FormState; label: string }> = [
  { field: "name", label: "Property name" },
  { field: "address", label: "Street address" },
  { field: "city", label: "City" },
  { field: "state", label: "State" },
  { field: "zip", label: "Zip" },
];

function validate(form: FormState) {
  return requiredFields.reduce<FieldErrors>((errors, { field, label }) => {
    if (!form[field].trim()) errors[field] = `${label} is required.`;
    return errors;
  }, {});
}

export function PropertyForm({
  onCancel,
  onSuccess,
  surface = "page",
}: {
  onCancel?: () => void;
  onSuccess?: () => void;
  surface?: "page" | "modal";
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const fieldRefs = useRef<Partial<Record<keyof FormState, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>>({});

  const [form, setForm] = useState<FormState>({
    name: "", type: normalizePropertyType(), address: "", city: "", state: "", zip: "", description: "",
  });

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  function fieldClass(field: keyof FormState) {
    return `${inputClass} ${fieldErrors[field] ? invalidInputClass : ""}`;
  }

  function fieldError(field: keyof FormState) {
    return fieldErrors[field] ? (
      <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors[field]}</p>
    ) : null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nextFieldErrors = validate(form);

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      const firstInvalidField = requiredFields.find(({ field }) => nextFieldErrors[field])?.field;
      if (firstInvalidField) fieldRefs.current[firstInvalidField]?.focus();
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, units: [] }),
      });
      const data: { propertyId?: string; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create property");
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/properties");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <section className={surface === "modal" ? "" : "rounded-lg border border-slate-200 bg-white p-6 shadow-sm"}>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Property details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Property name *</label>
            <input ref={(node) => { fieldRefs.current.name = node; }} className={fieldClass("name")} placeholder="e.g. Oak Terrace" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!fieldErrors.name} />
            {fieldError("name")}
          </div>
          <div>
            <label className={labelClass}>Type *</label>
            <select ref={(node) => { fieldRefs.current.type = node; }} className={fieldClass("type")} value={form.type} onChange={(e) => set("type", e.target.value)}>
              {PROPERTY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Street address *</label>
            <input ref={(node) => { fieldRefs.current.address = node; }} className={fieldClass("address")} placeholder="123 Oak Ave" value={form.address} onChange={(e) => set("address", e.target.value)} aria-invalid={!!fieldErrors.address} />
            {fieldError("address")}
          </div>
          <div>
            <label className={labelClass}>City *</label>
            <input ref={(node) => { fieldRefs.current.city = node; }} className={fieldClass("city")} placeholder="Atlanta" value={form.city} onChange={(e) => set("city", e.target.value)} aria-invalid={!!fieldErrors.city} />
            {fieldError("city")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>State *</label>
              <input ref={(node) => { fieldRefs.current.state = node; }} className={fieldClass("state")} placeholder="GA" maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase())} aria-invalid={!!fieldErrors.state} />
              {fieldError("state")}
            </div>
            <div>
              <label className={labelClass}>Zip *</label>
              <input ref={(node) => { fieldRefs.current.zip = node; }} className={fieldClass("zip")} placeholder="30303" value={form.zip} onChange={(e) => set("zip", e.target.value)} aria-invalid={!!fieldErrors.zip} />
              {fieldError("zip")}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea
              ref={(node) => { fieldRefs.current.description = node; }}
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="Optional notes about this property…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel ?? (() => router.back())}
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
