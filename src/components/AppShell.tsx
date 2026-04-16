import { currentUser } from "@clerk/nextjs/server";
import { AppSidebar } from "./AppSidebar";

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const unsafeMetadata = user?.unsafeMetadata as Record<string, unknown> | null;
  const publicMetadata = user?.publicMetadata as Record<string, unknown> | null;

  const role =
    metadataString(unsafeMetadata, "role") ??
    metadataString(publicMetadata, "role") ??
    "property_manager";
  const organizationName =
    metadataString(unsafeMetadata, "organizationName") ??
    metadataString(publicMetadata, "organizationName");
  const firstName =
    user?.firstName ??
    metadataString(unsafeMetadata, "firstName") ??
    metadataString(publicMetadata, "firstName");

  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-50 text-slate-950">
      <AppSidebar
        user={{
          email: user?.primaryEmailAddress?.emailAddress ?? null,
          firstName,
          imageUrl: user?.imageUrl ?? null,
          role,
          organizationName,
        }}
      />
      <main className="min-h-dvh min-w-0 p-4 pt-20 md:p-8 lg:ml-72 lg:pt-8">
        <div className="mx-auto max-w-6xl pb-20">{children}</div>
      </main>
    </div>
  );
}
