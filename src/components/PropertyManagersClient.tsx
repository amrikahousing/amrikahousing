"use client";

import { useEffect, useRef, useState } from "react";

type PropertyOption = {
  id: string;
  name: string;
};

type PresetRole = {
  value: string;
  label: string;
};

type ManagerRecord = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  permissionRole: string;
  propertyIds: string[];
  active: boolean;
};

type PendingInvite = {
  id: string;
  email: string;
  permissionRole: string;
  propertyIds: string[];
  active: boolean;
};

type TeamPayload = {
  properties: PropertyOption[];
  presetRoles: PresetRole[];
  managers: ManagerRecord[];
  pendingInvites: PendingInvite[];
};

function roleDescription(properties: PropertyOption[]) {
  if (properties.length === 0) {
    return "Managers can enter the portal and create the first property.";
  }
  if (properties.length === 1) {
    return "The only property will be assigned automatically unless you choose otherwise later.";
  }
  return "Choose one or more properties for this manager.";
}

function rolePill(role: string) {
  if (role === "leasing_manager") return "bg-sky-50 text-sky-700 border-sky-200";
  if (role === "accounting_manager") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function PropertyChecklist({
  properties,
  selected,
  onChange,
  required,
}: {
  properties: PropertyOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  required?: boolean;
}) {
  if (properties.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        No properties exist yet. This manager can still create the first property.
      </p>
    );
  }

  if (properties.length === 1) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        The only property, <span className="font-medium text-slate-900">{properties[0].name}</span>, will be assigned automatically.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Assigned properties{required ? " *" : ""}
      </p>
      {properties.map((property) => {
        const checked = selected.includes(property.id);
        return (
          <label
            key={property.id}
            className="flex items-center gap-3 rounded-md bg-white px-3 py-2 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange(
                  checked
                    ? selected.filter((id) => id !== property.id)
                    : [...selected, property.id],
                )
              }
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>{property.name}</span>
          </label>
        );
      })}
    </div>
  );
}

function ManagerCard({
  manager,
  properties,
  roles,
  onSaved,
}: {
  manager: ManagerRecord;
  properties: PropertyOption[];
  roles: PresetRole[];
  onSaved: () => Promise<void>;
}) {
  const [permissionRole, setPermissionRole] = useState(manager.permissionRole);
  const [propertyIds, setPropertyIds] = useState<string[]>(manager.propertyIds);
  const [active, setActive] = useState(manager.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPermissionRole(manager.permissionRole);
    setPropertyIds(manager.propertyIds);
    setActive(manager.active);
  }, [manager]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/property-managers/${manager.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionRole, propertyIds, active }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not save manager access.");
        return;
      }
      await onSaved();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {[manager.firstName, manager.lastName].filter(Boolean).join(" ") || manager.email || "Manager"}
          </p>
          <p className="mt-1 text-sm text-slate-500">{manager.email ?? "No email on file"}</p>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${rolePill(permissionRole)}`}>
          {roles.find((role) => role.value === permissionRole)?.label ?? permissionRole}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px,1fr]">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">Preset role</span>
          <select
            value={permissionRole}
            onChange={(event) => setPermissionRole(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>

        <PropertyChecklist
          properties={properties}
          selected={propertyIds}
          onChange={setPropertyIds}
          required={properties.length > 1}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Active access
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save access"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function PropertyManagersClient({ canInvite }: { canInvite: boolean }) {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [roles, setRoles] = useState<PresetRole[]>([]);
  const [managers, setManagers] = useState<ManagerRecord[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [form, setForm] = useState({
    email: "",
    permissionRole: "operations_manager",
    propertyIds: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState({ email: "", propertyIds: "" });
  const emailRef = useRef<HTMLInputElement | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch("/api/property-managers");
      const data = (await response.json()) as TeamPayload & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not load team access.");
        return;
      }
      setProperties(data.properties);
      setRoles(data.presetRoles);
      setManagers(data.managers);
      setPendingInvites(data.pendingInvites);
      setForm((current) => ({
        ...current,
        permissionRole: data.presetRoles[0]?.value ?? "operations_manager",
      }));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canInvite) return;
    void loadData();
  }, [canInvite]);

  async function inviteManager(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const nextFieldErrors = {
      email: form.email.trim() ? "" : "Email is required.",
      propertyIds:
        properties.length > 1 && form.propertyIds.length === 0
          ? "Choose at least one property."
          : "",
    };
    setFieldErrors(nextFieldErrors);
    if (nextFieldErrors.email || nextFieldErrors.propertyIds) {
      if (nextFieldErrors.email) emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/property-managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        error?: string;
        invited?: string;
        memberUpdated?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Could not save manager access.");
        return;
      }
      setNotice(
        data.memberUpdated
          ? `${data.memberUpdated} already belonged to the organization. Access was updated.`
          : `Invite sent to ${data.invited}.`,
      );
      setForm({
        email: "",
        permissionRole: roles[0]?.value ?? "operations_manager",
        propertyIds: [],
      });
      await loadData();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canInvite) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Only organization admins can manage property manager access.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm">
        Loading team access...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={inviteManager}
        noValidate
        className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Invite property manager</h2>
          <p className="mt-1 text-sm text-slate-500">{roleDescription(properties)}</p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr,220px]">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">Email</span>
            <input
              type="email"
              value={form.email}
              ref={emailRef}
              onChange={(event) => {
                setForm((current) => ({ ...current, email: event.target.value }));
                if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: "" }));
              }}
              placeholder="manager@company.com"
              className={`h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${fieldErrors.email ? "border-red-300 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20" : ""}`}
              required
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email ? <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.email}</p> : null}
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">Preset role</span>
            <select
              value={form.permissionRole}
              onChange={(event) =>
                setForm((current) => ({ ...current, permissionRole: event.target.value }))
              }
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <PropertyChecklist
            properties={properties}
            selected={form.propertyIds}
            onChange={(propertyIds) => {
              setForm((current) => ({ ...current, propertyIds }));
              if (fieldErrors.propertyIds) setFieldErrors((current) => ({ ...current, propertyIds: "" }));
            }}
            required={properties.length > 1}
          />
          {fieldErrors.propertyIds ? <p className="mt-2 text-xs font-medium text-red-600">{fieldErrors.propertyIds}</p> : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}

        <div className="mt-5">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Invite manager"}
          </button>
        </div>
      </form>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Current managers</h2>
          <p className="mt-1 text-sm text-slate-500">
            Update preset roles, property assignments, and active status.
          </p>
        </div>

        {managers.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            No property managers added yet.
          </div>
        ) : (
          managers.map((manager) => (
            <ManagerCard
              key={manager.id}
              manager={manager}
              properties={properties}
              roles={roles}
              onSaved={loadData}
            />
          ))
        )}
      </section>

      {pendingInvites.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Pending invites</h2>
          <div className="mt-4 space-y-3">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{invite.email}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Awaiting acceptance
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${rolePill(invite.permissionRole)}`}>
                    {roles.find((role) => role.value === invite.permissionRole)?.label ?? invite.permissionRole}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
