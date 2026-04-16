import { currentUser } from "@clerk/nextjs/server";
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
  const user = await currentUser();
  const metadata = (user?.unsafeMetadata ?? {}) as Record<string, unknown>;
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
            userId: user?.id ?? "",
            email: user?.primaryEmailAddress?.emailAddress ?? "",
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
