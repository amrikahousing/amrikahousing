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

function userPhone(user: ClerkUser) {
  return (
    metadataString(user?.unsafeMetadata as Record<string, unknown> | null, "phoneNumber") ??
    metadataString(user?.publicMetadata as Record<string, unknown> | null, "phoneNumber") ??
    user?.primaryPhoneNumber?.phoneNumber ??
    null
  );
}

const USER_SYNC_SELECT = {
  id: true,
  clerk_user_id: true,
  organization_id: true,
  email: true,
  first_name: true,
  last_name: true,
  phone: true,
} as const;

/**
 * Mirror the Clerk identity into our local `users` row.
 *
 * Names/phone change only through the app (which writes them to Clerk), so we
 * never need to overwrite on every request. We look the user up (required for
 * `userDbId` regardless), compute the desired values, and only issue an UPDATE
 * when something actually differs — so a normal authenticated request performs
 * no write.
 */
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
  const phone = userPhone(user);

  const existing =
    (await prisma.users.findUnique({
      where: { clerk_user_id: userId },
      select: USER_SYNC_SELECT,
    })) ??
    (await prisma.users.findUnique({
      where: { email },
      select: USER_SYNC_SELECT,
    }));

  if (!existing) {
    return prisma.users.create({
      data: {
        clerk_user_id: userId,
        organization_id: orgDbId,
        email,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        phone: phone ?? null,
      },
      select: { id: true },
    });
  }

  // Preserve existing values when Clerk doesn't supply a fresher one.
  const next = {
    clerk_user_id: userId,
    organization_id: orgDbId,
    email,
    first_name: firstName ?? existing.first_name,
    last_name: lastName ?? existing.last_name,
    phone: phone ?? existing.phone,
  };

  const changed =
    existing.clerk_user_id !== next.clerk_user_id ||
    existing.organization_id !== next.organization_id ||
    existing.email !== next.email ||
    existing.first_name !== next.first_name ||
    existing.last_name !== next.last_name ||
    existing.phone !== next.phone;

  if (!changed) {
    return { id: existing.id };
  }

  return prisma.users.update({
    where: { id: existing.id },
    data: { ...next, updated_at: new Date() },
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
