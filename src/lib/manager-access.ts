import {
  normalizeOrganizationRole,
  normalizePermissionRole,
  normalizePropertyIds,
  type ManagerPermissionRole,
  type OrganizationRole,
} from "./permissions";

export function normalizeManagerAccessInput(input: {
  permissionRole: unknown;
  propertyIds: unknown;
}) {
  const role = normalizeOrganizationRole(input.permissionRole);

  return {
    role,
    permissionRole: normalizePermissionRole(role),
    propertyIds: normalizePropertyIds(input.propertyIds),
  };
}

export function resolveManagerPropertyIds(args: {
  requestedPropertyIds: string[];
  availablePropertyIds: string[];
  permissionRole?: ManagerPermissionRole;
  role?: OrganizationRole;
}) {
  if (args.role === "admin" || args.role === "accountant" || args.permissionRole === "accountant") {
    return { propertyIds: [] as string[], error: null };
  }

  const validPropertyIds = args.requestedPropertyIds.filter((propertyId) =>
    args.availablePropertyIds.includes(propertyId),
  );

  if (args.availablePropertyIds.length === 0) {
    return { propertyIds: [] as string[], error: null };
  }

  if (args.availablePropertyIds.length === 1) {
    return {
      propertyIds: validPropertyIds.length ? validPropertyIds : [args.availablePropertyIds[0]],
      error: null,
    };
  }

  if (validPropertyIds.length === 0) {
    return {
      propertyIds: [] as string[],
      error: "Choose at least one property for this role.",
    };
  }

  return { propertyIds: validPropertyIds, error: null };
}

export function roleLabel(role: OrganizationRole) {
  switch (role) {
    case "admin":
      return "Admin";
    case "accountant":
      return "Accountant";
    case "owner":
      return "Owner";
    case "tenant":
      return "Tenant";
    case "maintenance_staff":
      return "Maintenance Staff";
    default:
      return "Property Manager";
  }
}
