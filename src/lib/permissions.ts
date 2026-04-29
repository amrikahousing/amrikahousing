import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "./db";

export const MANAGER_PERMISSION_ROLES = [
  "operations_manager",
  "leasing_manager",
  "accounting_manager",
] as const;

export type ManagerPermissionRole = (typeof MANAGER_PERMISSION_ROLES)[number];

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
  permissionRole: ManagerPermissionRole;
  propertyIds: string[];
  active: boolean;
};

const DEFAULT_MANAGER_ROLE: ManagerPermissionRole = "operations_manager";

const ROLE_PERMISSIONS: Record<ManagerPermissionRole, OrgPermissionState> = {
  operations_manager: {
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
  leasing_manager: {
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
  accounting_manager: {
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
  if (value === "leasing_manager" || value === "accounting_manager") {
    return value;
  }

  return DEFAULT_MANAGER_ROLE;
}

export function buildPermissionState(
  role: ManagerPermissionRole,
  isOrgAdmin: boolean,
): OrgPermissionState {
  return isOrgAdmin ? ADMIN_PERMISSIONS : ROLE_PERMISSIONS[role];
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
  return {
    permissionRole: normalizePermissionRole(metadata?.permissionRole),
    propertyIds: normalizePropertyIds(metadata?.propertyIds),
    active: metadata?.active !== false,
  };
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
    await prisma.users.update({
      where: { id: userDbId },
      data: {
        is_active: true,
        updated_at: new Date(),
      },
    });
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

  await prisma.users.update({
    where: { id: userDbId },
    data: {
      role: metadata.permissionRole,
      is_active: metadata.active,
      updated_at: new Date(),
    },
  });
  await replacePropertyAssignments(
    userDbId,
    validProperties.map((property) => property.id),
  );
}

export async function replacePropertyAssignments(
  userDbId: string,
  propertyIds: string[],
) {
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
