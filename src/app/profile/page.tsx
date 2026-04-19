import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { AppShell } from "@/components/AppShell";
import { ProfileForm } from "@/components/ProfileForm";

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : "";
}

function metadataBoolean(metadata: Record<string, unknown>, key: string) {
  return metadata[key] === true;
}

export default async function ProfilePage() {
  const [{ orgId }, user] = await Promise.all([auth(), currentUser()]);
  const metadata = (user?.unsafeMetadata ?? {}) as Record<string, unknown>;
  let organizationName = metadataString(metadata, "organizationName");

  if (orgId) {
    try {
      const clerk = await clerkClient();
      const organization = await clerk.organizations.getOrganization({
        organizationId: orgId,
      });
      organizationName = organization.name;
    } catch {
      // Keep the metadata fallback when Clerk organization lookup is unavailable.
    }
  }

  const twoFactorMethod = metadataString(metadata, "twoFactorMethod");
  const normalizedMethod =
    twoFactorMethod === "email" || twoFactorMethod === "phone"
      ? twoFactorMethod
      : "";

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Profile
          </h1>
          <p className="mt-1 text-slate-500">
            Manage your contact details, default location, and two-factor
            authentication.
          </p>
        </header>

        <ProfileForm
          initialProfile={{
            email: user?.primaryEmailAddress?.emailAddress ?? "",
            firstName:
              user?.firstName || metadataString(metadata, "firstName"),
            lastName:
              user?.lastName || metadataString(metadata, "lastName"),
            organizationName,
            phoneNumber: metadataString(metadata, "phoneNumber"),
            city: metadataString(metadata, "city"),
            state: metadataString(metadata, "state"),
            zipCode: metadataString(metadata, "zipCode"),
            twoFactorEnabled: metadataBoolean(metadata, "mfaEnabled"),
            twoFactorMethod: normalizedMethod,
          }}
        />
      </div>
    </AppShell>
  );
}
