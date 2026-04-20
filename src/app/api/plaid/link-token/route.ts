import { isAccessError, requireOrgAccess } from "@/lib/auth";
import { createPlaidLinkToken } from "@/lib/plaid";

export async function POST() {
  const access = await requireOrgAccess();
  if (isAccessError(access)) {
    return Response.json({ error: access.error }, { status: access.status });
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
