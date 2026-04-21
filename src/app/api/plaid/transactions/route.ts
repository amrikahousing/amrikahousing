import { isAccessError, requireOrgAccess } from "@/lib/auth";
import { syncPlaidItemsToDb } from "@/lib/accounting";

export async function POST(request: Request) {
  void request;
  const access = await requireOrgAccess();
  if (isAccessError(access)) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const result = await syncPlaidItemsToDb(access.orgId);

  return Response.json(result);
}
