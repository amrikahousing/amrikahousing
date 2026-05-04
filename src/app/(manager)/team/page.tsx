import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PropertyManagersClient } from "@/components/PropertyManagersClient";
import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";

export default async function TeamPage() {
  const { userId, orgId } = await auth();

  if (!userId) redirect("/login");
  if (!orgId) redirect("/onboard");
  const access = await getOrgPermissionContext();
  if ("error" in access) redirect("/dashboard");
  const permissionError = requirePermission(access, "manage_team");
  if (permissionError) redirect("/dashboard");

  const canInvite = true;
  const organization = await prisma.organizations.findUnique({
    where: { id: access.orgDbId },
    select: { name: true },
  });

  return (
    <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Admin
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Access Management
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Invite users, update roles, scope access by property, and revoke
            permissions from one place.
          </p>
        </header>

        <PropertyManagersClient
          canInvite={canInvite}
          organizationName={organization?.name ?? "this organization"}
        />
    </div>
  );
}
