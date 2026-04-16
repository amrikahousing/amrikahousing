import { currentUser } from "@clerk/nextjs/server";
import { AppShell } from "@/components/AppShell";
import { MaintenanceClient } from "@/components/MaintenanceClient";

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export default async function MaintenancePage() {
  const user = await currentUser();
  const unsafeMetadata = user?.unsafeMetadata as Record<string, unknown> | null;
  const publicMetadata = user?.publicMetadata as Record<string, unknown> | null;
  const rawRole =
    metadataString(unsafeMetadata, "role") ??
    metadataString(publicMetadata, "role") ??
    "property_manager";
  const role = rawRole === "tenant" || rawRole === "renter" ? "tenant" : "manager";

  return (
    <AppShell>
      <MaintenanceClient role={role} userId={user?.id ?? "tenant-demo"} />
    </AppShell>
  );
}
