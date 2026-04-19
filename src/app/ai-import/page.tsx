import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AiImportWizard } from "@/components/AiImportWizard";

export default async function AiImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const sp = await searchParams;
  const existingProperty = sp.propertyId
    ? {
        id: sp.propertyId,
        name: sp.name ?? "",
        type: sp.type ?? "rental",
        address: sp.address ?? "",
        city: sp.city ?? "",
        state: sp.state ?? "",
        zip: sp.zip ?? "",
      }
    : undefined;

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          {existingProperty ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Add units with AI</h1>
              <p className="mt-1 text-slate-500">
                Describe the units to add to <span className="font-medium text-slate-700">{existingProperty.name}</span>.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Add properties with AI</h1>
              <p className="mt-1 text-slate-500">
                Describe your properties in plain text and let AI extract the details.
              </p>
            </>
          )}
        </header>
        <AiImportWizard existingProperty={existingProperty} />
      </div>
    </AppShell>
  );
}
