import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PropertyManagersClient } from "@/components/PropertyManagersClient";

export default async function TeamPage() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) redirect("/login");
  if (!orgId) redirect("/onboard");

  const canInvite = orgRole === "org:admin";

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Team
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Property managers
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Add property managers to your organization so they can access the
            portfolio workspace.
          </p>
        </header>

        <PropertyManagersClient canInvite={canInvite} />
      </div>
    </AppShell>
  );
}
