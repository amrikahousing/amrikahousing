import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import { syncPlaidItemsToDb } from "@/lib/accounting";

export async function POST(request: Request) {
  void request;
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_bank_accounts");
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const result = await syncPlaidItemsToDb(access.orgId);

  return Response.json(result);
}
