import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrgPermissionContext } from "@/lib/org-authorization";
import { normalizePermissionRole } from "@/lib/permissions";

export async function GET() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    return Response.json({ signedIn: false }, { status: 401 });
  }

  const user = await currentUser();
  const privateMetadata = (user?.privateMetadata ?? {}) as Record<string, unknown>;
  const orgAccess = orgId ? await getOrgPermissionContext() : null;
  const resolvedRole =
    orgRole === "org:admin"
      ? "admin"
      : orgAccess && !("error" in orgAccess)
        ? orgAccess.permissionRole
        : normalizePermissionRole(null);

  return Response.json({
    signedIn: true,
    userId,
    orgId: orgId ?? null,
    orgRole: orgRole ?? null,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    role: resolvedRole,
    internalAdmin: privateMetadata.internalAdmin === true,
    internalAdminType: typeof privateMetadata.internalAdmin,
  });
}
