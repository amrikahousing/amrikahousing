import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import { prisma } from "@/lib/db";
import {
  createPlaidAuthUpdateLinkToken,
  createPlaidLinkToken,
  decryptPlaidAccessToken,
  getPlaidAuthAccounts,
} from "@/lib/plaid";

type LinkTokenBody = {
  mode?: unknown;
  plaidItemId?: unknown;
};

export async function POST(request: Request) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_bank_accounts");
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const body = (await request.json().catch(() => null)) as LinkTokenBody | null;
  if (body?.mode === "update_auth") {
    const requestedItemId = typeof body.plaidItemId === "string" ? body.plaidItemId : undefined;
    const items = await prisma.plaid_items.findMany({
      where: {
        id: requestedItemId,
        organization_id: access.orgDbId,
        access_token: { not: "" },
        disconnected_at: null,
        hidden_at: null,
      },
      orderBy: { updated_at: "desc" },
      select: {
        id: true,
        access_token: true,
        institution_name: true,
      },
    });

    if (items.length === 0) {
      return Response.json(
        { error: "No connected Plaid account is available for update mode." },
        { status: 404 },
      );
    }

    let item: (typeof items)[number] | null = items[0] ?? null;
    for (const candidate of items) {
      const auth = await getPlaidAuthAccounts({
        accessToken: decryptPlaidAccessToken(candidate.access_token),
      });

      if ("error" in auth || auth.accounts.length === 0) {
        item = candidate;
        break;
      }

      item = null;
    }

    if (!item) {
      return Response.json({ updateRequired: false, mode: "update_auth" });
    }

    const result = await createPlaidAuthUpdateLinkToken({
      userId: access.userId,
      clientName: "Amrika Housing",
      accessToken: decryptPlaidAccessToken(item.access_token),
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({
      linkToken: result.linkToken,
      expiration: result.expiration,
      mode: "update_auth",
      item: {
        id: item.id,
        institutionName: item.institution_name,
      },
    });
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
