import { auth, currentUser } from "@clerk/nextjs/server";
import { syncLocalUser } from "@/lib/auth";
import { getPortalAccessState } from "@/lib/portal-access";
import { AppSidebar } from "./AppSidebar";

export type AppShellUser = {
  email: string | null;
  firstName: string | null;
  imageUrl: string | null;
  portal: "property_manager";
  role: string;
  organizationName: string | null;
  isOrgAdmin: boolean;
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
  const normalizedRole =
    role === "renter" || role === "tenant" ? "property_manager" : role;

  return {
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    firstName,
    imageUrl: user?.imageUrl ?? null,
    portal: "property_manager",
    role: isOrgAdmin ? "admin" : normalizedRole,
    organizationName,
    isOrgAdmin,
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
