import { auth, currentUser } from "@clerk/nextjs/server";
import { syncLocalUser } from "@/lib/auth";
import { getOrgPermissionContext } from "@/lib/org-authorization";
import { getPortalAccessState } from "@/lib/portal-access";
import type { OrgPermissionState } from "@/lib/permissions";
import { AppSidebar } from "./AppSidebar";

export type AppShellUser = {
  email: string | null;
  firstName: string | null;
  imageUrl: string | null;
  portal: "property_manager";
  role: string;
  organizationName: string | null;
  isOrgAdmin: boolean;
  permissions: OrgPermissionState;
  canAccessPropertyManager: boolean;
  canAccessRenter: boolean;
  hasBothPortals: boolean;
};

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export async function getAppShellUser(): Promise<AppShellUser> {
  const { orgRole, userId, orgId } = await auth();
  const user = userId
    ? await currentUser().catch(() => null)
    : null;
  if (userId && orgId) {
    await syncLocalUser({ userId, orgId, user });
  }
  const unsafeMetadata = user?.unsafeMetadata as Record<string, unknown> | null;
  const publicMetadata = user?.publicMetadata as Record<string, unknown> | null;

  const role =
    metadataString(unsafeMetadata, "role") ??
    metadataString(publicMetadata, "role") ??
    "property_manager";
  const isOrgAdmin = orgRole === "org:admin";
  const organizationName =
    metadataString(unsafeMetadata, "organizationName") ??
    metadataString(publicMetadata, "organizationName");
  const firstName =
    user?.firstName ??
    metadataString(unsafeMetadata, "firstName") ??
    metadataString(publicMetadata, "firstName");
  const portalAccess = await getPortalAccessState({
    userId,
    orgId,
    email: user?.primaryEmailAddress?.emailAddress ?? null,
  });
  const permissionContext =
    userId && orgId ? await getOrgPermissionContext() : null;
  const hasResolvedPermissions =
    permissionContext !== null && !("error" in permissionContext);
  const normalizedRole = !hasResolvedPermissions
    ? role === "renter" || role === "tenant" ? "property_manager" : role
    : permissionContext.isOrgAdmin
      ? "admin"
      : permissionContext.permissionRole;

  return {
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    firstName,
    imageUrl: user?.imageUrl ?? null,
    portal: "property_manager",
    role: isOrgAdmin ? "admin" : normalizedRole,
    organizationName,
    isOrgAdmin,
    permissions:
      hasResolvedPermissions
        ? permissionContext.permissions
        : {
            manage_team: false,
            manage_org_settings: false,
            manage_bank_accounts: false,
            manage_accounting: false,
            create_properties: false,
            view_properties: Boolean(orgId),
            view_all_properties: false,
            manage_properties: false,
            manage_units: false,
            invite_renters: false,
            manage_maintenance: false,
          },
    ...portalAccess,
  };
}

export async function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: AppShellUser;
}) {
  const shellUser = user ?? (await getAppShellUser());

  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-50 text-slate-950">
      <AppSidebar user={shellUser} />
      <main className="min-h-dvh min-w-0 p-4 pt-20 md:p-8 lg:ml-72 lg:pt-8">
        <div className="mx-auto max-w-6xl pb-20">{children}</div>
      </main>
    </div>
  );
}
