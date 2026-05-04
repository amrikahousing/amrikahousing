"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PropertyOption = {
  id: string;
  name: string;
};

type PresetRole = {
  value: string;
  label: string;
};

type AccessUser = {
  id: string;
  clerkUserId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  propertyIds: string[];
  active: boolean;
  canRevoke: boolean;
};

type PendingInvite = {
  id: string;
  email: string;
  role: string;
  propertyIds: string[];
};

type UnifiedEntry =
  | { kind: "user"; user: AccessUser }
  | { kind: "invite"; invite: PendingInvite };

type AccessPayload = {
  properties: PropertyOption[];
  presetRoles: PresetRole[];
  managers: AccessUser[];
  pendingInvites: PendingInvite[];
};

type AccessTab = "users" | "roles" | "permissions" | "insights";

const ACCESS_TABS: Array<{ value: AccessTab; label: string }> = [
  { value: "users", label: "Users" },
  { value: "roles", label: "Roles" },
  { value: "permissions", label: "Permissions" },
  { value: "insights", label: "AI Insights" },
];

const PERMISSION_ROWS = [
  {
    label: "Manage team access",
    roles: ["admin"],
  },
  {
    label: "Create and edit properties",
    roles: ["admin", "property_manager"],
  },
  {
    label: "Manage units and leases",
    roles: ["admin", "property_manager"],
  },
  {
    label: "Invite tenants",
    roles: ["admin", "property_manager"],
  },
  {
    label: "Accounting and reports",
    roles: ["admin", "accountant"],
  },
  {
    label: "Maintenance requests",
    roles: ["admin", "property_manager", "maintenance_staff"],
  },
  {
    label: "View assigned properties",
    roles: ["admin", "property_manager", "maintenance_staff", "owner", "tenant"],
  },
];

const ACCESS_ACTIONS = [
  {
    role: "admin",
    label: "Admin",
    detail: "Full company access",
  },
  {
    role: "property_manager",
    label: "Property Manager",
    detail: "Manage selected properties",
  },
  {
    role: "accountant",
    label: "Accountant",
    detail: "Payments and reports",
  },
  {
    role: "owner",
    label: "Owner",
    detail: "View property reports",
  },
  {
    role: "maintenance_staff",
    label: "Maintenance Staff",
    detail: "Handle assigned maintenance",
  },
] as const;

function roleUsesPropertyScope(role: string) {
  return role !== "admin" && role !== "accountant";
}

function roleDescription(properties: PropertyOption[], role: string) {
  if (role === "admin") return "They can manage the whole company workspace.";
  if (role === "accountant") return "They can work with payments, bank accounts, and reports.";
  if (role === "owner") return "Choose which properties this owner can view.";
  if (role === "tenant") return "Choose the property connected to this tenant access.";
  if (role === "maintenance_staff") return "Choose where this person can handle maintenance.";
  if (properties.length === 0) return "They can be invited now and assigned properties later.";
  if (properties.length === 1) return "They will get access to the only property.";
  return "Choose the properties this manager can work on.";
}

function rolePill(role: string) {
  if (role === "admin") return "bg-slate-900 text-white border-slate-900";
  if (role === "accountant") return "bg-amber-50 text-amber-700 border-amber-200";
  if (role === "owner") return "bg-violet-50 text-violet-700 border-violet-200";
  if (role === "tenant") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (role === "maintenance_staff") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function roleAccent(role: string) {
  if (role === "admin") return "bg-slate-900";
  if (role === "accountant") return "bg-amber-500";
  if (role === "owner") return "bg-violet-500";
  if (role === "tenant") return "bg-cyan-500";
  if (role === "maintenance_staff") return "bg-sky-500";
  return "bg-emerald-500";
}

function roleInitial(role: string) {
  if (role === "maintenance_staff") return "M";
  return role.charAt(0).toUpperCase();
}

function userDisplayName(user: AccessUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User";
}

function TabIcon({ tab }: { tab: AccessTab }) {
  const shared = {
    className: "h-6 w-6",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (tab === "users") {
    return (
      <svg {...shared}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (tab === "roles") {
    return (
      <svg {...shared}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      </svg>
    );
  }

  if (tab === "permissions") {
    return (
      <svg {...shared}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
      <path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" />
    </svg>
  );
}

function XIcon({ className = "" }: { className?: string }) {
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
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function userRiskScore(user: AccessUser) {
  if (!user.active) return 45;
  if (user.role === "admin") return 8;
  if (user.role === "accountant" && user.propertyIds.length > 0) return 22;
  if (roleUsesPropertyScope(user.role) && user.propertyIds.length === 0) return 34;
  return 12 + Math.min(user.propertyIds.length * 2, 12);
}

function riskPill(score: number) {
  if (score >= 40) return "border-red-100 bg-red-50 text-red-700";
  if (score >= 25) return "border-amber-100 bg-amber-50 text-amber-700";
  return "border-emerald-100 bg-emerald-50 text-emerald-700";
}

function PropertyChecklist({
  properties,
  selected,
  onChange,
  required,
  disabled,
}: {
  properties: PropertyOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        No property scope required.
      </p>
    );
  }

  if (properties.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        No properties exist yet. Access can be scoped later.
      </p>
    );
  }

  if (properties.length === 1) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Assigned to <span className="font-medium text-slate-900">{properties[0].name}</span>.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Property scope{required ? " *" : ""}
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

function AccessActionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (role: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {ACCESS_ACTIONS.map((action) => {
        const selected = value === action.role;
        return (
          <button
            key={action.role}
            type="button"
            onClick={() => onChange(action.role)}
            className={`rounded-lg border p-3 text-left transition ${selected ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${selected ? "bg-white text-slate-950" : `${roleAccent(action.role)} text-white`}`}>
                {roleInitial(action.role)}
              </span>
              {action.label}
            </span>
            <span className={`mt-2 block text-xs ${selected ? "text-slate-200" : "text-slate-500"}`}>
              {action.detail}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AccessUserCard({
  user,
  properties,
  roles,
  onSaved,
}: {
  user: AccessUser;
  properties: PropertyOption[];
  roles: PresetRole[];
  onSaved: () => Promise<void>;
}) {
  const [role, setRole] = useState(user.role);
  const [propertyIds, setPropertyIds] = useState<string[]>(user.propertyIds);
  const [active, setActive] = useState(user.active);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRole(user.role);
    setPropertyIds(user.propertyIds);
    setActive(user.active);
  }, [user]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/property-managers/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionRole: role, propertyIds, active }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not save access.");
        return;
      }
      await onSaved();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (!user.canRevoke) return;
    const confirmed = window.confirm(`Revoke access for ${user.email ?? "this user"}?`);
    if (!confirmed) return;

    setRevoking(true);
    setError(null);
    try {
      const response = await fetch(`/api/property-managers/${user.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not revoke access.");
        return;
      }
      await onSaved();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${roleAccent(role)}`}>
            {userDisplayName(user).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {userDisplayName(user)}
            </p>
            <p className="mt-1 truncate text-sm text-slate-500">{user.email ?? "No email on file"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${rolePill(role)}`}>
            {roles.find((item) => item.value === role)?.label ?? role}
          </span>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
            {active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px,1fr]">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-700">Access type</span>
          <select
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value;
              setRole(nextRole);
              if (!roleUsesPropertyScope(nextRole)) setPropertyIds([]);
              if (nextRole === "admin") setActive(true);
            }}
            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          >
            {roles.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <PropertyChecklist
          properties={properties}
          selected={propertyIds}
          onChange={setPropertyIds}
          required={roleUsesPropertyScope(role) && properties.length > 1}
          disabled={!roleUsesPropertyScope(role)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            disabled={role === "admin"}
            onChange={(event) => setActive(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
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
        <button
          type="button"
          onClick={revoke}
          disabled={!user.canRevoke || revoking}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {revoking ? "Revoking..." : "Revoke"}
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

export function PropertyManagersClient({
  canInvite,
  organizationName,
}: {
  canInvite: boolean;
  organizationName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [roles, setRoles] = useState<PresetRole[]>([]);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [form, setForm] = useState({
    email: "",
    permissionRole: "property_manager",
    propertyIds: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState({ email: "", propertyIds: "" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "pending">("all");
  const [activeTab, setActiveTab] = useState<AccessTab>("users");
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);

  const filteredEntries = useMemo((): UnifiedEntry[] => {
    const normalizedQuery = query.trim().toLowerCase();

    const userEntries: UnifiedEntry[] = users
      .filter((user) => {
        if (statusFilter === "pending") return false;
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" ? user.active : !user.active);
        const matchesQuery =
          !normalizedQuery ||
          userDisplayName(user).toLowerCase().includes(normalizedQuery) ||
          (user.email ?? "").toLowerCase().includes(normalizedQuery) ||
          user.role.toLowerCase().includes(normalizedQuery);
        return matchesStatus && matchesQuery;
      })
      .map((user) => ({ kind: "user" as const, user }));

    const inviteEntries: UnifiedEntry[] =
      statusFilter === "all" || statusFilter === "pending"
        ? pendingInvites
            .filter(
              (invite) =>
                !normalizedQuery ||
                invite.email.toLowerCase().includes(normalizedQuery) ||
                invite.role.toLowerCase().includes(normalizedQuery),
            )
            .map((invite) => ({ kind: "invite" as const, invite }))
        : [];

    return [...userEntries, ...inviteEntries];
  }, [query, statusFilter, users, pendingInvites]);

  const activeCount = users.filter((user) => user.active).length;
  const adminCount = users.filter((user) => user.role === "admin").length;
  const scopedCount = users.filter((user) => user.propertyIds.length > 0).length;
  const highestRiskUser = users
    .map((user) => ({ user, score: userRiskScore(user) }))
    .sort((a, b) => b.score - a.score)[0];

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch("/api/property-managers");
      const data = (await response.json()) as AccessPayload & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not load access.");
        return;
      }
      setProperties(data.properties);
      setRoles(data.presetRoles);
      setUsers(data.managers);
      setPendingInvites(data.pendingInvites);
      setForm((current) => ({
        ...current,
        permissionRole: data.presetRoles[0]?.value ?? "property_manager",
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

  useEffect(() => {
    if (!showAddUserModal) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowAddUserModal(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showAddUserModal]);

  async function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const nextFieldErrors = {
      email: form.email.trim() ? "" : "Email is required.",
      propertyIds:
        roleUsesPropertyScope(form.permissionRole) &&
        properties.length > 1 &&
        form.propertyIds.length === 0
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
        setError(data.error ?? "Could not save access.");
        return;
      }
      setNotice(
        data.memberUpdated
          ? `${data.memberUpdated} already belonged to the organization. Access was updated.`
          : `Invite sent to ${data.invited}.`,
      );
      setForm({
        email: "",
        permissionRole: roles[0]?.value ?? "property_manager",
        propertyIds: [],
      });
      setShowAddUserModal(false);
      await loadData();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvite(invite: PendingInvite) {
    const confirmed = window.confirm(`Revoke invite for ${invite.email}?`);
    if (!confirmed) return;

    setError(null);
    try {
      const response = await fetch(`/api/property-managers/invites/${invite.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not revoke invite.");
        return;
      }
      setNotice(`Invite revoked for ${invite.email}.`);
      await loadData();
    } catch {
      setError("Network error. Please try again.");
    }
  }

  if (!canInvite) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Only organization admins can manage access.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-sm">
        Loading access...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex gap-3 overflow-x-auto border-b border-slate-200 pb-4">
        {ACCESS_TABS.map((tab) => {
          const selected = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`flex h-14 shrink-0 items-center gap-3 rounded-lg px-6 text-lg font-bold transition ${selected ? "bg-slate-950 text-white shadow-md ring-2 ring-slate-300" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
            >
              <TabIcon tab={tab.value} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Active organization
        </p>
        <p className="mt-1 text-base font-bold text-slate-950">{organizationName}</p>
        <p className="mt-1 text-sm text-slate-500">
          New access grants and role changes apply only to this organization.
        </p>
      </div>

      {activeTab === "users" ? null : (
      <section className="grid gap-3 md:grid-cols-4">
        {[
          { label: "Total users", value: users.length, detail: `${activeCount} active` },
          { label: "Admins", value: adminCount, detail: "Full access" },
          { label: "Scoped users", value: scopedCount, detail: "Property-limited" },
          { label: "Pending invites", value: pendingInvites.length, detail: "Awaiting acceptance" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{item.value}</p>
            <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
          </div>
        ))}
      </section>
      )}

      {activeTab === "users" ? (
        <>
          {highestRiskUser ? (
            <section className="rounded-lg border border-sky-200 bg-sky-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                    AI
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">AI Insights</h2>
                    <p className="mt-1 text-sm font-medium text-blue-700">
                      {userDisplayName(highestRiskUser.user)} has the highest access review score
                      {" "}
                      ({highestRiskUser.score}). Consider reviewing role and property scope.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(userDisplayName(highestRiskUser.user));
                      setStatusFilter("all");
                    }}
                    className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    Review Access
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("insights")}
                    className="h-10 rounded-lg border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
                  >
                    View Details
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {showAddUserModal ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-950/40" onClick={() => setShowAddUserModal(false)} />
              <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Add user</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {roleDescription(properties, form.permissionRole)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Close add user"
                  >
                    <XIcon className="h-5 w-5" />
                  </button>
                </div>

                <p className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                  Access will be granted in {organizationName}.
                </p>

                <form onSubmit={inviteUser} noValidate className="space-y-4">
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
                      placeholder="name@company.com"
                      className={`h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${fieldErrors.email ? "border-red-300 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20" : ""}`}
                      required
                      aria-invalid={!!fieldErrors.email}
                    />
                    {fieldErrors.email ? <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.email}</p> : null}
                  </label>

                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-700">What should they be able to do?</p>
                    <AccessActionPicker
                      value={form.permissionRole}
                      onChange={(role) => {
                        setForm((current) => ({
                          ...current,
                          permissionRole: role,
                          propertyIds: roleUsesPropertyScope(role) ? current.propertyIds : [],
                        }));
                      }}
                    />
                  </div>

                  {roleUsesPropertyScope(form.permissionRole) ? (
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-700">Give access to property</p>
                      <PropertyChecklist
                        properties={properties}
                        selected={form.propertyIds}
                        onChange={(propertyIds) => {
                          setForm((current) => ({ ...current, propertyIds }));
                          if (fieldErrors.propertyIds) setFieldErrors((current) => ({ ...current, propertyIds: "" }));
                        }}
                        required={properties.length > 1}
                        disabled={false}
                      />
                      {fieldErrors.propertyIds ? <p className="mt-2 text-xs font-medium text-red-600">{fieldErrors.propertyIds}</p> : null}
                    </div>
                  ) : null}

                  {error ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {error}
                    </p>
                  ) : null}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "Saving..." : "Add User"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddUserModal(false)}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {notice ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </p>
          ) : null}

          <section className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search users by name, email, or role..."
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:w-[340px] lg:w-[420px]"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                  className="h-12 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setActiveTab("insights")}
                  className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-slate-50"
                >
                  AI Suggestions
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUserModal(true);
                    window.setTimeout(() => emailRef.current?.focus(), 50);
                  }}
                  className="h-11 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
                >
                  Add User
                </button>
              </div>
            </div>

            <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-sm font-bold text-slate-950">
                    <th className="w-16 px-6 py-4"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" aria-label="Select all users" /></th>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Properties</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">AI Risk</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => {
                    if (entry.kind === "invite") {
                      const { invite } = entry;
                      return (
                        <tr key={`invite-${invite.id}`} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-6 py-4"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" disabled aria-label="Pending invite" /></td>
                          <td className="px-6 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-300 text-sm font-bold text-slate-600">
                                {invite.email.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-950">{invite.email}</p>
                                <p className="mt-1 truncate text-sm text-slate-400">Invited</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-medium ${rolePill(invite.role)}`}>
                              {roles.find((r) => r.value === invite.role)?.label ?? invite.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-semibold text-slate-500">
                            {invite.role === "admin" || invite.role === "accountant" ? "All" : invite.propertyIds.length}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700">
                              Pending
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-400">—</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => void revokeInvite(invite)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const { user } = entry;
                    const score = userRiskScore(user);
                    return (
                      <tr key={user.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-6 py-4"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" aria-label={`Select ${userDisplayName(user)}`} /></td>
                        <td className="px-6 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${roleAccent(user.role)}`}>
                              {userDisplayName(user).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">{userDisplayName(user)}</p>
                              <p className="mt-1 truncate text-sm text-slate-500">{user.email ?? "No email on file"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-medium ${rolePill(user.role)}`}>
                            {roles.find((role) => role.value === user.role)?.label ?? user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-500">
                          {user.role === "admin" || user.role === "accountant" ? "All" : user.propertyIds.length}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-medium ${user.active ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                            {user.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-bold ${riskPill(score)}`}>
                            {score >= 40 ? "!" : "OK"} {score}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setQuery(user.email ?? userDisplayName(user))}
                            className="mr-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            disabled={!user.canRevoke}
                            onClick={() => {
                              const confirmed = window.confirm(`Revoke access for ${user.email ?? "this user"}?`);
                              if (!confirmed) return;
                              void fetch(`/api/property-managers/${user.id}`, { method: "DELETE" }).then(() => loadData());
                            }}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredEntries.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">No matching users found.</div>
              ) : null}
            </div>

            <div className="space-y-3 lg:hidden">
              {filteredEntries.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
                  No matching users found.
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  if (entry.kind === "invite") {
                    const { invite } = entry;
                    return (
                      <article key={`invite-${invite.id}`} className="rounded-lg border border-amber-100 bg-amber-50 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-300 text-sm font-bold text-slate-600">
                              {invite.email.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{invite.email}</p>
                              <p className="mt-1 text-xs text-slate-500">Awaiting acceptance</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                              Pending
                            </span>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${rolePill(invite.role)}`}>
                              {roles.find((r) => r.value === invite.role)?.label ?? invite.role}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void revokeInvite(invite)}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                          >
                            Revoke
                          </button>
                        </div>
                      </article>
                    );
                  }
                  return (
                    <AccessUserCard
                      key={entry.user.id}
                      user={entry.user}
                      properties={properties}
                      roles={roles}
                      onSaved={loadData}
                    />
                  );
                })
              )}
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "roles" ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Roles</h2>
              <p className="mt-1 text-sm text-slate-500">Six fixed roles keep access predictable.</p>
            </div>
            <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {properties.length} properties
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => {
              const roleUsers = users.filter((user) => user.role === role.value);
              return (
                <div key={role.value} className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold text-white ${roleAccent(role.value)}`}>
                      {roleInitial(role.value)}
                    </div>
                    <span className="text-3xl font-bold text-slate-950">{roleUsers.length}</span>
                  </div>
                  <p className="mt-4 text-base font-bold text-slate-950">{role.label}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {roleDescription(properties, role.value)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("users");
                      setQuery(role.label);
                      setStatusFilter("all");
                    }}
                    className="mt-4 h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    View users
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab === "permissions" ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Permissions</h2>
            <p className="mt-1 text-sm text-slate-500">Code-defined permissions by role, with property scope applied where relevant.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-sm font-bold text-slate-950">
                  <th className="px-5 py-4">Permission</th>
                  {roles.map((role) => (
                    <th key={role.value} className="px-5 py-4">{role.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_ROWS.map((permission) => (
                  <tr key={permission.label} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">{permission.label}</td>
                    {roles.map((role) => {
                      const allowed = permission.roles.includes(role.value);
                      return (
                        <td key={role.value} className="px-5 py-4">
                          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${allowed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-300"}`}>
                            {allowed ? "Y" : "-"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "insights" ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {users
            .map((user) => ({ user, score: userRiskScore(user) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map(({ user, score }) => (
              <article key={user.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${roleAccent(user.role)}`}>
                      {userDisplayName(user).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">{userDisplayName(user)}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{user.email ?? "No email on file"}</p>
                    </div>
                  </div>
                  <span className={`inline-flex rounded-lg border px-3 py-1.5 text-sm font-bold ${riskPill(score)}`}>
                    {score}
                  </span>
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  {score >= 40
                    ? "Inactive or unusually broad access. Review before keeping this permission set."
                    : score >= 25
                      ? "Access looks elevated for the current role. Confirm property scope."
                      : "No immediate access concern detected."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("users");
                    setQuery(user.email ?? userDisplayName(user));
                    setStatusFilter("all");
                  }}
                  className="mt-4 h-9 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800"
                >
                  Review Access
                </button>
              </article>
            ))}
        </section>
      ) : null}
    </div>
  );
}
