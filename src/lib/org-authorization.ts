import { isAccessError, requireOrgAccess, type OrgContext } from "./auth";
import { prisma } from "./db";
import {
  buildRolePermissionState,
  buildPermissionState,
  normalizeOrganizationRole,
  normalizePermissionRole,
  type OrganizationRole,
  type ManagerPermissionRole,
  type OrgPermissionName,
  type OrgPermissionState,
} from "./permissions";

type AccessError = { error: string; status: number };

export type OrgPermissionContext = OrgContext & {
  dbRole: string | null;
  permissionRole: ManagerPermissionRole;
  roles: OrganizationRole[];
  permissions: OrgPermissionState;
  assignedPropertyIds: string[];
  propertyCount: number;
  isActive: boolean;
};

export async function getOrgPermissionContext(): Promise<OrgPermissionContext | AccessError> {
  const access = await requireOrgAccess();
  if (isAccessError(access)) return access;

  const [user, propertyCount] = await Promise.all([
    access.userDbId
      ? prisma.users.findUnique({
          where: { id: access.userDbId },
          select: {
            role: true,
            is_active: true,
            property_assignments: { select: { property_id: true } },
            memberships: {
              where: { organization_id: access.orgDbId },
              select: {
                role: true,
                property_id: true,
                is_active: true,
              },
            },
          },
        })
      : null,
    prisma.properties.count({
      where: {
        organization_id: access.orgDbId,
        deleted_at: null,
      },
    }),
  ]);

  const activeMemberships = (user?.memberships ?? []).filter(
    (membership) => membership.is_active,
  );
  const organizationRoles = activeMemberships.map((membership) =>
    normalizeOrganizationRole(membership.role),
  );
  const permissionRole = normalizePermissionRole(organizationRoles[0] ?? user?.role);
  const isActive = access.isOrgAdmin
    ? true
    : activeMemberships.length
      ? true
      : user?.is_active !== false;
  if (!isActive) {
    return {
      error: "Your organization access is inactive. Ask an admin to reactivate it.",
      status: 403,
    };
  }

  return {
    ...access,
    dbRole: user?.role ?? null,
    permissionRole,
    roles: access.isOrgAdmin
      ? ["admin"]
      : Array.from(new Set(organizationRoles.length ? organizationRoles : [permissionRole])),
    permissions: activeMemberships.length
      ? buildRolePermissionState(organizationRoles, access.isOrgAdmin)
      : buildPermissionState(permissionRole, access.isOrgAdmin),
    assignedPropertyIds: access.isOrgAdmin
      ? []
      : activeMemberships.length
        ? activeMemberships
            .map((membership) => membership.property_id)
            .filter((propertyId): propertyId is string => Boolean(propertyId))
        : (user?.property_assignments ?? []).map((assignment) => assignment.property_id),
    propertyCount,
    isActive,
  };
}

export function hasOrgPermission(
  ctx: OrgPermissionContext,
  permission: OrgPermissionName,
): boolean {
  return ctx.permissions[permission];
}

export function hasPropertyAccess(
  ctx: OrgPermissionContext,
  propertyId: string,
): boolean {
  return (
    ctx.isOrgAdmin ||
    ctx.permissions.view_all_properties ||
    ctx.assignedPropertyIds.includes(propertyId)
  );
}

export function requirePermission(
  ctx: OrgPermissionContext,
  permission: OrgPermissionName,
): AccessError | null {
  if (hasOrgPermission(ctx, permission)) {
    return null;
  }

  return {
    error: "You do not have permission to perform this action.",
    status: 403,
  };
}

export function requirePropertyPermission(
  ctx: OrgPermissionContext,
  permission: OrgPermissionName,
  propertyId: string,
): AccessError | null {
  const permissionError = requirePermission(ctx, permission);
  if (permissionError) return permissionError;

  if (hasPropertyAccess(ctx, propertyId)) {
    return null;
  }

  return {
    error: "You do not have access to this property.",
    status: 403,
  };
}

export function propertyScopeWhere(ctx: OrgPermissionContext) {
  if (ctx.isOrgAdmin || ctx.permissions.view_all_properties) {
    return { organization_id: ctx.orgDbId, deleted_at: null as null };
  }

  return {
    organization_id: ctx.orgDbId,
    deleted_at: null as null,
    id: {
      in: ctx.assignedPropertyIds.length ? ctx.assignedPropertyIds : ["__no_property_access__"],
    },
  };
}
