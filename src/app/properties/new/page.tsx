import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PropertyForm } from "@/components/PropertyForm";
import { AppNav } from "@/components/AppNav";

export default async function NewPropertyPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  return (
    <main className="relative z-0 min-h-screen px-5 py-6 text-white sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl">
        <AppNav />
        <header className="mt-6 mb-6">
          <h1 className="text-[clamp(28px,3.5vw,42px)] leading-[1.05] font-semibold">
            Add property
          </h1>
          <p className="mt-1.5 text-[14px] text-white/60">
            Fill in the details below. You can always edit later.
          </p>
        </header>
        <PropertyForm />
      </div>
    </main>
  );
}
