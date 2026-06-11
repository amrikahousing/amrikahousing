import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "./db";

export const MANAGER_PERMISSION_ROLES = [
  "property_manager",
  "accountant",
  "maintenance_staff",
] as const;

export type ManagerPermissionRole = (typeof MANAGER_PERMISSION_ROLES)[number];

export const ORGANIZATION_ROLES = [
  "admin",
  "property_manager",
  "accountant",
  "owner",
  "tenant",
  "maintenance_staff",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export type OrgPermissionName =
  | "manage_team"
  | "manage_org_settings"
  | "manage_bank_accounts"
  | "manage_accounting"
  | "create_properties"
  | "view_properties"
  | "view_all_properties"
  | "manage_properties"
  | "manage_units"
  | "invite_renters"
  | "manage_maintenance";

export type OrgPermissionState = Record<OrgPermissionName, boolean>;

export type OrganizationAccessMetadata = {
  role: OrganizationRole;
  permissionRole: ManagerPermissionRole;
  propertyIds: string[];
  active: boolean;
};

const DEFAULT_MANAGER_ROLE: ManagerPermissionRole = "property_manager";

const ROLE_PERMISSIONS: Record<ManagerPermissionRole, OrgPermissionState> = {
  property_manager: {
    manage_team: false,
    manage_org_settings: false,
    manage_bank_accounts: false,
    manage_accounting: false,
    create_properties: true,
    view_properties: true,
    view_all_properties: false,
    manage_properties: true,
    manage_units: true,
    invite_renters: true,
    manage_maintenance: true,
  },
  accountant: {
    manage_team: false,
    manage_org_settings: false,
    manage_bank_accounts: false,
    manage_accounting: true,
    create_properties: true,
    view_properties: true,
    view_all_properties: true,
    manage_properties: false,
    manage_units: false,
    invite_renters: false,
    manage_maintenance: false,
  },
  maintenance_staff: {
    manage_team: false,
    manage_org_settings: false,
    manage_bank_accounts: false,
    manage_accounting: false,
    create_properties: false,
    view_properties: true,
    view_all_properties: false,
    manage_properties: false,
    manage_units: false,
    invite_renters: false,
    manage_maintenance: true,
  },
};

const NO_DASHBOARD_PERMISSIONS: OrgPermissionState = {
  manage_team: false,
  manage_org_settings: false,
  manage_bank_accounts: false,
  manage_accounting: false,
  create_properties: false,
  view_properties: false,
  view_all_properties: false,
  manage_properties: false,
  manage_units: false,
  invite_renters: false,
  manage_maintenance: false,
};

const ADMIN_PERMISSIONS: OrgPermissionState = {
  manage_team: true,
  manage_org_settings: true,
  manage_bank_accounts: true,
  manage_accounting: true,
  create_properties: true,
  view_properties: true,
  view_all_properties: true,
  manage_properties: true,
  manage_units: true,
  invite_renters: true,
  manage_maintenance: true,
};

export function normalizePermissionRole(value: unknown): ManagerPermissionRole {
  if (value === "accountant" || value === "maintenance_staff") {
    return value;
  }

  if (value === "accounting_manager") {
    return "accountant";
  }

  if (
    value === "property_manager" ||
    value === "operations_manager" ||
    value === "leasing_manager"
  ) {
    return "property_manager";
  }

  return DEFAULT_MANAGER_ROLE;
}

export function normalizeOrganizationRole(value: unknown): OrganizationRole {
  if (
    value === "admin" ||
    value === "property_manager" ||
    value === "accountant" ||
    value === "owner" ||
    value === "tenant" ||
    value === "maintenance_staff"
  ) {
    return value;
  }

  if (value === "accounting_manager") {
    return "accountant";
  }

  if (value === "renter") {
    return "tenant";
  }

  if (value === "operations_manager" || value === "leasing_manager") {
    return "property_manager";
  }

  return "property_manager";
}

export function buildPermissionState(
  role: ManagerPermissionRole,
  isOrgAdmin: boolean,
): OrgPermissionState {
  return isOrgAdmin ? ADMIN_PERMISSIONS : ROLE_PERMISSIONS[role];
}

export function buildRolePermissionState(
  roles: OrganizationRole[],
  isOrgAdmin: boolean,
): OrgPermissionState {
  if (isOrgAdmin || roles.includes("admin")) return ADMIN_PERMISSIONS;

  return roles.reduce<OrgPermissionState>(
    (merged, role) => {
      const rolePermissions =
        role === "property_manager" || role === "accountant" || role === "maintenance_staff"
          ? ROLE_PERMISSIONS[role]
          : role === "owner"
            ? { ...NO_DASHBOARD_PERMISSIONS, view_properties: true }
            : NO_DASHBOARD_PERMISSIONS;

      for (const permission of Object.keys(merged) as OrgPermissionName[]) {
        merged[permission] = merged[permission] || rolePermissions[permission];
      }

      return merged;
    },
    { ...NO_DASHBOARD_PERMISSIONS },
  );
}

export function normalizePropertyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function readOrganizationAccessMetadata(
  metadata: Record<string, unknown> | null | undefined,
): OrganizationAccessMetadata {
  const metadataRole = metadata?.permissionRole ?? metadata?.role;
  const role = normalizeOrganizationRole(metadataRole);

  return {
    role,
    permissionRole: normalizePermissionRole(metadataRole),
    propertyIds: normalizePropertyIds(metadata?.propertyIds),
    active: metadata?.active !== false,
  };
}

export function membershipRowsForAccess({
  userDbId,
  orgDbId,
  role,
  propertyIds,
  active,
}: {
  userDbId: string;
  orgDbId: string;
  role: OrganizationRole;
  propertyIds: string[];
  active: boolean;
}) {
  const scopedPropertyIds =
    propertyIds.length ||
    role === "property_manager" ||
    role === "maintenance_staff" ||
    role === "owner" ||
    role === "tenant"
      ? propertyIds
      : [null];

  return scopedPropertyIds.length
    ? scopedPropertyIds.map((propertyId) => ({
        user_id: userDbId,
        organization_id: orgDbId,
        role,
        property_id: propertyId,
        is_active: active,
      }))
    : [
        {
          user_id: userDbId,
          organization_id: orgDbId,
          role,
          property_id: null,
          is_active: active,
        },
      ];
}

function membershipKey(row: {
  role: string;
  property_id: string | null;
  is_active: boolean;
}) {
  return `${row.role}|${row.property_id ?? ""}|${row.is_active ? 1 : 0}`;
}

function sameMembershipSet(
  current: Array<{ role: string; property_id: string | null; is_active: boolean }>,
  desired: Array<{ role: string; property_id: string | null; is_active: boolean }>,
) {
  if (current.length !== desired.length) return false;
  const currentKeys = new Set(current.map(membershipKey));
  return desired.every((row) => currentKeys.has(membershipKey(row)));
}

export async function replaceMembershipAccess({
  userDbId,
  orgDbId,
  role,
  propertyIds,
  active,
}: {
  userDbId: string;
  orgDbId: string;
  role: OrganizationRole;
  propertyIds: string[];
  active: boolean;
}) {
  const desired = membershipRowsForAccess({
    userDbId,
    orgDbId,
    role,
    propertyIds,
    active,
  });

  const current = await prisma.memberships.findMany({
    where: { user_id: userDbId, organization_id: orgDbId },
    select: { role: true, property_id: true, is_active: true },
  });

  // Only rewrite when the membership set actually differs.
  if (sameMembershipSet(current, desired)) return;

  await prisma.$transaction([
    prisma.memberships.deleteMany({
      where: { user_id: userDbId, organization_id: orgDbId },
    }),
    prisma.memberships.createMany({
      data: desired,
      skipDuplicates: true,
    }),
  ]);
}

export async function syncClerkMembershipAccess({
  userId,
  userDbId,
  orgId,
  orgDbId,
  isOrgAdmin,
}: {
  userId: string;
  userDbId: string;
  orgId: string;
  orgDbId: string;
  isOrgAdmin: boolean;
}) {
  if (isOrgAdmin) {
    const [currentUser, currentMemberships] = await Promise.all([
      prisma.users.findUnique({
        where: { id: userDbId },
        select: { role: true, is_active: true },
      }),
      prisma.memberships.findMany({
        where: { user_id: userDbId, organization_id: orgDbId },
        select: { role: true, property_id: true, is_active: true },
      }),
    ]);

    const desiredMemberships = [
      { role: "admin", property_id: null, is_active: true },
    ];
    const userOk =
      currentUser?.role === "admin" && currentUser.is_active === true;
    const membershipsOk = sameMembershipSet(currentMemberships, desiredMemberships);

    // Already in the desired state — no write needed.
    if (userOk && membershipsOk) return;

    await prisma.$transaction([
      ...(userOk
        ? []
        : [
            prisma.users.update({
              where: { id: userDbId },
              data: { role: "admin", is_active: true, updated_at: new Date() },
            }),
          ]),
      ...(membershipsOk
        ? []
        : [
            prisma.memberships.deleteMany({
              where: { user_id: userDbId, organization_id: orgDbId },
            }),
            prisma.memberships.createMany({
              data: [
                {
                  user_id: userDbId,
                  organization_id: orgDbId,
                  role: "admin",
                  property_id: null,
                  is_active: true,
                },
              ],
              skipDuplicates: true,
            }),
          ]),
    ]);
    return;
  }

  const clerk = await clerkClient();
  const memberships = await clerk.users.getOrganizationMembershipList({
    userId,
    limit: 100,
  });
  const membership = memberships.data.find(
    (candidate) => candidate.organization.id === orgId,
  );

  if (!membership) return;

  const metadata = readOrganizationAccessMetadata(
    membership.publicMetadata as Record<string, unknown> | null | undefined,
  );
  const validProperties = metadata.propertyIds.length
    ? await prisma.properties.findMany({
        where: {
          organization_id: orgDbId,
          deleted_at: null,
          id: { in: metadata.propertyIds },
        },
        select: { id: true },
      })
    : [];

  const propertyIds = validProperties.map((property) => property.id);
  const currentUser = await prisma.users.findUnique({
    where: { id: userDbId },
    select: { role: true, is_active: true },
  });
  if (
    currentUser?.role !== metadata.permissionRole ||
    currentUser?.is_active !== metadata.active
  ) {
    await prisma.users.update({
      where: { id: userDbId },
      data: {
        role: metadata.permissionRole,
        is_active: metadata.active,
        updated_at: new Date(),
      },
    });
  }
  await replacePropertyAssignments(userDbId, propertyIds);
  await replaceMembershipAccess({
    userDbId,
    orgDbId,
    role: metadata.permissionRole,
    propertyIds,
    active: metadata.active,
  });
}

export async function replacePropertyAssignments(
  userDbId: string,
  propertyIds: string[],
) {
  const desired = new Set(propertyIds);
  const current = await prisma.property_assignments.findMany({
    where: { user_id: userDbId },
    select: { property_id: true },
  });
  const currentSet = new Set(current.map((row) => row.property_id));

  // Only rewrite when the assigned-property set actually differs.
  if (
    currentSet.size === desired.size &&
    [...desired].every((id) => currentSet.has(id))
  ) {
    return;
  }

  await prisma.$transaction([
    prisma.property_assignments.deleteMany({
      where: { user_id: userDbId },
    }),
    ...(propertyIds.length
      ? [
          prisma.property_assignments.createMany({
            data: propertyIds.map((propertyId) => ({
              user_id: userDbId,
              property_id: propertyId,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

export async function assignPropertiesToUser(
  userDbId: string,
  propertyIds: string[],
) {
  if (!propertyIds.length) return;

  await prisma.property_assignments.createMany({
    data: propertyIds.map((propertyId) => ({
      user_id: userDbId,
      property_id: propertyId,
    })),
    skipDuplicates: true,
  });
}
