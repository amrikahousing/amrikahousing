import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ImportWizard } from "@/components/ImportWizard";
import { AppNav } from "@/components/AppNav";

export default async function ImportPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  return (
    <main className="relative z-0 min-h-screen px-5 py-6 text-white sm:px-8 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <AppNav />
        <header className="mt-6 mb-2">
          <h1 className="text-[clamp(28px,3.5vw,42px)] leading-[1.05] font-semibold">
            Import portfolio
          </h1>
          <p className="mt-1.5 text-[14px] text-white/60">
            Upload a CSV to bulk-add properties and units to your account.
          </p>
        </header>
        <ImportWizard />
      </div>
    </main>
  );
}
