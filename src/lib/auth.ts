import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./db";
import { syncClerkMembershipAccess } from "./permissions";

export type OrgContext = {
  userId: string;
  orgId: string;
  orgDbId: string;
  userDbId: string | null;
  orgRole: string | null;
  isOrgAdmin: boolean;
};

type AccessError = { error: string; status: number };
type ClerkUser = Awaited<ReturnType<typeof currentUser>>;

function userEmail(userId: string, user: ClerkUser) {
  return user?.primaryEmailAddress?.emailAddress ?? `${userId}@clerk.local`;
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function userFirstName(user: ClerkUser) {
  return (
    user?.firstName ??
    metadataString(user?.unsafeMetadata as Record<string, unknown> | null, "firstName") ??
    metadataString(user?.publicMetadata as Record<string, unknown> | null, "firstName")
  );
}

function userLastName(user: ClerkUser) {
  return (
    user?.lastName ??
    metadataString(user?.unsafeMetadata as Record<string, unknown> | null, "lastName") ??
    metadataString(user?.publicMetadata as Record<string, unknown> | null, "lastName")
  );
}

async function upsertUserRecord({
  userId,
  orgDbId,
  user,
}: {
  userId: string;
  orgDbId: string;
  user: ClerkUser;
}) {
  const email = userEmail(userId, user);
  const firstName = userFirstName(user);
  const lastName = userLastName(user);
  const data = {
    clerk_user_id: userId,
    organization_id: orgDbId,
    email,
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
    updated_at: new Date(),
  };

  const existingByClerk = await prisma.users.findUnique({
    where: { clerk_user_id: userId },
    select: { id: true },
  });

  if (existingByClerk) {
    return prisma.users.update({
      where: { id: existingByClerk.id },
      data,
      select: { id: true },
    });
  }

  const existingByEmail = await prisma.users.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingByEmail) {
    return prisma.users.update({
      where: { id: existingByEmail.id },
      data,
      select: { id: true },
    });
  }

  return prisma.users.create({
    data: {
      ...data,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
    },
    select: { id: true },
  });
}

export async function syncLocalUser({
  userId,
  orgId,
  orgDbId,
  user,
  orgRole,
}: {
  userId: string;
  orgId: string;
  orgDbId?: string;
  user?: ClerkUser;
  orgRole?: string | null;
}) {
  let dbOrgId = orgDbId;
  if (!dbOrgId) {
    const org = await prisma.organizations.findUnique({
      where: { clerk_org_id: orgId },
      select: { id: true },
    });
    dbOrgId = org?.id;
  }
  if (!dbOrgId) return null;

  try {
    const clerkUser = user ?? (await currentUser().catch(() => null));
    const record = await upsertUserRecord({
      userId,
      orgDbId: dbOrgId,
      user: clerkUser,
    });
    await syncClerkMembershipAccess({
      userId,
      userDbId: record.id,
      orgId,
      orgDbId: dbOrgId,
      isOrgAdmin: orgRole === "org:admin",
    }).catch((error) => {
      console.warn("[syncClerkMembershipAccess]", error);
    });
    return record.id;
  } catch (error) {
    console.warn("[syncLocalUser]", error);
    return null;
  }
}

/**
 * Verifies the request has an authenticated user + active Clerk org.
 * Upserts the organization in DB using the real org name from Clerk.
 * Returns OrgContext on success, AccessError on failure.
 */
export async function requireOrgAccess(): Promise<OrgContext | AccessError> {
  const [{ userId, orgId, orgRole }, user] = await Promise.all([
    auth(),
    currentUser().catch(() => null),
  ]);

  if (!userId) return { error: "Unauthorized", status: 401 };
  if (!orgId) return { error: "No active organization. Please join or create an organization.", status: 403 };

  // Fetch real org name from Clerk
  let orgName = orgId;
  try {
    const clerk = await clerkClient();
    const clerkOrg = await clerk.organizations.getOrganization({ organizationId: orgId });
    orgName = clerkOrg.name;
  } catch {
    // Non-fatal: fall back to orgId as name
  }

  const org = await prisma.organizations.upsert({
    where: { clerk_org_id: orgId },
    update: { name: orgName },
    create: { clerk_org_id: orgId, name: orgName },
    select: { id: true },
  });
  const userDbId = await syncLocalUser({
    userId,
    orgId,
    orgDbId: org.id,
    user,
    orgRole,
  });

  return {
    userId,
    orgId,
    orgDbId: org.id,
    userDbId,
    orgRole: orgRole ?? null,
    isOrgAdmin: orgRole === "org:admin",
  };
}

export function isAccessError(v: OrgContext | AccessError): v is AccessError {
  return "error" in v;
}
