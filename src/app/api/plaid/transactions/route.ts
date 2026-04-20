import { isAccessError, requireOrgAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptPlaidAccessToken, syncPlaidTransactions } from "@/lib/plaid";

export async function GET(request: Request) {
  const access = await requireOrgAccess();
  if (isAccessError(access)) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const url = new URL(request.url);
  const itemId = url.searchParams.get("itemId");
  const plaidItem = await prisma.plaid_items.findFirst({
    where: {
      organization_id: access.orgDbId,
      ...(itemId ? { id: itemId } : {}),
    },
    orderBy: { created_at: "desc" },
  });

  if (!plaidItem) {
    return Response.json(
      { error: "No Plaid account is connected yet." },
      { status: 404 },
    );
  }

  let accessToken: string;
  try {
    accessToken = decryptPlaidAccessToken(plaidItem.access_token);
  } catch {
    return Response.json(
      { error: "Could not decrypt the Plaid access token." },
      { status: 500 },
    );
  }

  const result = await syncPlaidTransactions({
    accessToken,
    cursor: plaidItem.transactions_cursor,
  });
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  await prisma.plaid_items.update({
    where: { id: plaidItem.id },
    data: {
      transactions_cursor: result.nextCursor,
      updated_at: new Date(),
    },
  });

  return Response.json({
    item: {
      id: plaidItem.id,
      institutionName: plaidItem.institution_name,
      status: plaidItem.status,
    },
    transactions: {
      added: result.added,
      modified: result.modified,
      removed: result.removed,
    },
    accounts: result.accounts,
    nextCursor: result.nextCursor,
    transactionsUpdateStatus: result.transactionsUpdateStatus,
  });
}
