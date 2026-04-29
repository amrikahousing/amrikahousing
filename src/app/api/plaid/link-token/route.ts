import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import { createPlaidLinkToken } from "@/lib/plaid";

export async function POST() {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_bank_accounts");
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const result = await createPlaidLinkToken({
    userId: access.userId,
    clientName: "Amrika Housing",
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    linkToken: result.linkToken,
    expiration: result.expiration,
  });
}
