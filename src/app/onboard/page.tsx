import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OrganizationList } from "@clerk/nextjs";
import { isInternalAdmin } from "@/lib/internal-admin";

export default async function OnboardPage() {
  const { userId, orgId } = await auth();
  const internalAdmin = await isInternalAdmin();
  const afterOrganizationUrl = internalAdmin ? "/internal/provision" : "/dashboard";

  if (!userId) redirect("/login");
  if (orgId) redirect(afterOrganizationUrl);

  return (
    <main className="relative z-0 flex min-h-screen items-center justify-center px-5 py-10 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <div
              aria-hidden="true"
              className="h-[18px] w-[18px] rounded-[5px] bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,255,255,0.35))] shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
            />
            <span className="font-semibold text-white/90">Amrika Housing</span>
          </div>
          <h1 className="text-[28px] font-semibold leading-tight">Join or create an organization</h1>
          <p className="mt-2 text-[14px] text-white/55">
            You need to be part of an organization to access your portfolio.
          </p>
        </div>

        <div className="rounded-[12px] border border-white/12 bg-[var(--card)] p-6 backdrop-blur-[16px]">
          <OrganizationList
            hidePersonal
            afterSelectOrganizationUrl={afterOrganizationUrl}
            afterCreateOrganizationUrl={afterOrganizationUrl}
          />
        </div>
      </div>
    </main>
  );
}
