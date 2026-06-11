import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrgPermissionContext } from "@/lib/org-authorization";
import { normalizePermissionRole } from "@/lib/permissions";

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    return Response.json({ signedIn: false }, { status: 401 });
  }

  const user = await currentUser();
  const privateMetadata = (user?.privateMetadata ?? {}) as Record<string, unknown>;
  const metadataRole =
    metadataString(user?.unsafeMetadata as Record<string, unknown> | null, "role") ??
    metadataString(user?.publicMetadata as Record<string, unknown> | null, "role");
  const orgAccess = orgId ? await getOrgPermissionContext() : null;
  const resolvedRole =
    orgRole === "org:admin"
      ? "admin"
      : metadataRole === "renter"
        ? "renter"
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
