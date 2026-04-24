import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./db";

export type TenantContext = {
  userId: string;
  tenantId: string;
  organizationId: string;
  sharedUserId: string | null;
};

type TenantAccessError = { error: string; status: number };

type SharedUser = {
  id: string;
  organization_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
};

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function resolveSharedUserIdentity(userId: string) {
  const clerkUser = await currentUser().catch(() => null);
  const email = clerkUser?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  const firstName =
    clerkUser?.firstName ??
    metadataString(clerkUser?.unsafeMetadata as Record<string, unknown> | null, "firstName") ??
    metadataString(clerkUser?.publicMetadata as Record<string, unknown> | null, "firstName");
  const lastName =
    clerkUser?.lastName ??
    metadataString(clerkUser?.unsafeMetadata as Record<string, unknown> | null, "lastName") ??
    metadataString(clerkUser?.publicMetadata as Record<string, unknown> | null, "lastName");

  if (!email) {
    return { clerkUser, email: null, sharedUser: null as SharedUser | null };
  }

  const matchingTenant = await prisma.tenants.findFirst({
    where: { email, deleted_at: null },
    orderBy: { created_at: "asc" },
    select: { organization_id: true },
  });

  const existing =
    (await prisma.users.findUnique({
      where: { clerk_user_id: userId },
      select: {
        id: true,
        organization_id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
      },
    })) ??
    (await prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        organization_id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
      },
    }));

  const desiredRole =
    existing?.role && existing.role !== "renter"
      ? existing.role
      : matchingTenant
        ? "renter"
        : existing?.role ?? "renter";

  const data = {
    clerk_user_id: userId,
    email,
    organization_id: existing?.organization_id ?? matchingTenant?.organization_id ?? null,
    first_name: firstName ?? existing?.first_name ?? null,
    last_name: lastName ?? existing?.last_name ?? null,
    role: desiredRole,
    updated_at: new Date(),
  };

  const sharedUser = existing
    ? await prisma.users.update({
        where: { id: existing.id },
        data,
        select: {
          id: true,
          organization_id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
        },
      })
    : await prisma.users.create({
        data,
        select: {
          id: true,
          organization_id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
        },
      });

  return { clerkUser, email, sharedUser };
}

export async function findTenantForAuthenticatedUser(userId: string) {
  const { email, sharedUser } = await resolveSharedUserIdentity(userId);
  if (!email) {
    return { tenant: null, sharedUser };
  }

  const tenant =
    (sharedUser?.organization_id
      ? await prisma.tenants.findFirst({
          where: {
            email,
            organization_id: sharedUser.organization_id,
            deleted_at: null,
          },
          orderBy: { created_at: "asc" },
          select: { id: true, organization_id: true, deleted_at: true },
        })
      : null) ??
    (await prisma.tenants.findFirst({
      where: { email, deleted_at: null },
      orderBy: { created_at: "asc" },
      select: { id: true, organization_id: true, deleted_at: true },
    }));

  return { tenant, sharedUser };
}

export async function requireTenantAccess(): Promise<TenantContext | TenantAccessError> {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized", status: 401 };

  const { tenant, sharedUser } = await findTenantForAuthenticatedUser(userId);

  if (!tenant || tenant.deleted_at) {
    return { error: "No tenant record found for this account.", status: 403 };
  }

  return {
    userId,
    tenantId: tenant.id,
    organizationId: tenant.organization_id,
    sharedUserId: sharedUser?.id ?? null,
  };
}

export function isTenantAccessError(
  v: TenantContext | TenantAccessError,
): v is TenantAccessError {
  return "error" in v;
}
