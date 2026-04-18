import { notFound } from "next/navigation";
import { requireInternalAdmin } from "@/lib/internal-admin";
import { ProvisionClient } from "./ProvisionClient";

export default async function InternalProvisionPage() {
  const access = await requireInternalAdmin();

  if ("error" in access) {
    notFound();
  }

  return <ProvisionClient />;
}
