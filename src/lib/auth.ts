import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "./db";

export type OrgContext = {
  userId: string;
  orgId: string;
  orgDbId: string;
};

type AccessError = { error: string; status: number };

/**
 * Verifies the request has an authenticated user + active Clerk org.
 * Upserts the organization in DB using the real org name from Clerk.
 * Returns OrgContext on success, AccessError on failure.
 */
export async function requireOrgAccess(): Promise<OrgContext | AccessError> {
  const { userId, orgId } = await auth();

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

  return { userId, orgId, orgDbId: org.id };
}

export function isAccessError(v: OrgContext | AccessError): v is AccessError {
  return "error" in v;
}
