import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { prisma } from "@/lib/db";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : "";
}

function metadataBoolean(metadata: Record<string, unknown>, key: string) {
  return metadata[key] === true;
}

export default async function RenterProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const [identity, user] = await Promise.all([
    resolveSharedUserIdentity(userId),
    currentUser().catch(() => null),
  ]);
  const metadata = (user?.unsafeMetadata ?? {}) as Record<string, unknown>;
  const tenant = identity.email
    ? await prisma.tenants.findFirst({
        where: {
          email: identity.email,
          deleted_at: null,
          ...(identity.sharedUser?.organization_id
            ? { organization_id: identity.sharedUser.organization_id }
            : {}),
        },
        select: {
          first_name: true,
          last_name: true,
          organization_id: true,
          organizations: {
            select: { name: true },
          },
        },
      })
    : null;

  if (!tenant) {
    redirect("/renter");
  }

  const twoFactorMethod = metadataString(metadata, "twoFactorMethod");
  const normalizedMethod =
    twoFactorMethod === "email" || twoFactorMethod === "phone"
      ? twoFactorMethod
      : "";

  return (
    <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Profile
          </h1>
          <p className="mt-1 text-slate-500">
            Manage your contact details and two-factor authentication.
          </p>
        </header>

        <ProfileForm
          initialProfile={{
            email: user?.primaryEmailAddress?.emailAddress ?? identity.email ?? "",
            firstName:
              user?.firstName ||
              identity.sharedUser?.first_name ||
              tenant.first_name ||
              metadataString(metadata, "firstName"),
            lastName:
              user?.lastName ||
              identity.sharedUser?.last_name ||
              tenant.last_name ||
              metadataString(metadata, "lastName"),
            organizationName: tenant.organizations?.name ?? "",
            phoneNumber: metadataString(metadata, "phoneNumber"),
            city: metadataString(metadata, "city"),
            state: metadataString(metadata, "state"),
            zipCode: metadataString(metadata, "zipCode"),
            twoFactorEnabled: metadataBoolean(metadata, "mfaEnabled"),
            twoFactorMethod: normalizedMethod,
          }}
        />
    </div>
  );
}
