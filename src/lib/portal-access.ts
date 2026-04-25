import { prisma } from "./db";
import { resolveSharedUserIdentity } from "./renter-auth";

export type PortalAccessState = {
  canAccessPropertyManager: boolean;
  canAccessRenter: boolean;
  hasBothPortals: boolean;
};

export async function getPortalAccessState({
  userId,
  orgId,
  email,
}: {
  userId: string | null | undefined;
  orgId?: string | null;
  email?: string | null;
}): Promise<PortalAccessState> {
  if (!userId) {
    return {
      canAccessPropertyManager: false,
      canAccessRenter: false,
      hasBothPortals: false,
    };
  }

  const sharedIdentity = await resolveSharedUserIdentity(userId);
  const resolvedEmail = sharedIdentity.sharedUser?.email ?? email?.toLowerCase() ?? null;
  if (!resolvedEmail) {
    return {
      canAccessPropertyManager: Boolean(orgId),
      canAccessRenter: false,
      hasBothPortals: false,
    };
  }

  const tenant = await prisma.tenants.findFirst({
    where: {
      deleted_at: null,
      ...(sharedIdentity.sharedUser?.organization_id
        ? { organization_id: sharedIdentity.sharedUser.organization_id }
        : {}),
      ...(resolvedEmail ? { email: resolvedEmail } : {}),
    },
    select: { id: true },
  });

  const canAccessPropertyManager = Boolean(orgId);
  const canAccessRenter = Boolean(tenant);

  return {
    canAccessPropertyManager,
    canAccessRenter,
    hasBothPortals: canAccessPropertyManager && canAccessRenter,
  };
}
