import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { RenterShell } from "@/components/RenterShell";
import { getPortalAccessState } from "@/lib/portal-access";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";

export default async function RenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/login");

  const identity = await resolveSharedUserIdentity(userId);
  const email =
    identity.sharedUser?.email ??
    identity.clerkUser?.primaryEmailAddress?.emailAddress ??
    null;

  const shellUser = {
    email,
    firstName:
      identity.sharedUser?.first_name ?? identity.clerkUser?.firstName ?? null,
    imageUrl: identity.clerkUser?.imageUrl ?? null,
    portal: "renter" as const,
    ...(await getPortalAccessState({ userId, orgId, email })),
  };

  return <RenterShell user={shellUser}>{children}</RenterShell>;
}
