import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PropertyForm } from "@/components/PropertyForm";
import { AppShell } from "@/components/AppShell";

export default async function NewPropertyPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Add property
          </h1>
          <p className="mt-1 text-slate-500">
            Fill in the details below. You can always edit them later.
          </p>
        </header>
        <PropertyForm />
      </div>
    </AppShell>
  );
}
