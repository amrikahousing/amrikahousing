import {
  normalizePermissionRole,
  normalizePropertyIds,
  type ManagerPermissionRole,
} from "./permissions";

export function normalizeManagerAccessInput(input: {
  permissionRole: unknown;
  propertyIds: unknown;
}) {
  return {
    permissionRole: normalizePermissionRole(input.permissionRole),
    propertyIds: normalizePropertyIds(input.propertyIds),
  };
}

export function resolveManagerPropertyIds(args: {
  requestedPropertyIds: string[];
  availablePropertyIds: string[];
}) {
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
      error: "Choose at least one property for this manager.",
    };
  }

  return { propertyIds: validPropertyIds, error: null };
}

export function roleLabel(role: ManagerPermissionRole) {
  switch (role) {
    case "leasing_manager":
      return "Leasing Manager";
    case "accounting_manager":
      return "Accounting Manager";
    default:
      return "Operations Manager";
  }
}
