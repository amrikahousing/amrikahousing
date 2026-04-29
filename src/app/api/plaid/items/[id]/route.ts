import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import { decryptPlaidAccessToken, getPlaidConfig } from "@/lib/plaid";

type DisconnectMode = "disconnect" | "disconnect_hide" | "disconnect_delete";

function normalizeMode(value: unknown): DisconnectMode {
  if (value === "disconnect_hide" || value === "disconnect_delete") {
    return value;
  }
  return "disconnect";
}

async function removePlaidItemFromProvider(encryptedAccessToken: string) {
  try {
    const config = getPlaidConfig();
    if ("error" in config || !encryptedAccessToken) {
      return;
    }

    const accessToken = decryptPlaidAccessToken(encryptedAccessToken);
    await fetch(`${config.baseUrl}/item/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        secret: config.secret,
        access_token: accessToken,
      }),
    });
  } catch {
    // Best effort only
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_bank_accounts");
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    plaidAccountId?: unknown;
  } | null;
  const mode = normalizeMode(body?.mode);
  const plaidAccountId =
    typeof body?.plaidAccountId === "string" && body.plaidAccountId.trim()
      ? body.plaidAccountId.trim()
      : null;
  const now = new Date();

  const item = await prisma.plaid_items.findFirst({
    where: { id, organization_id: access.orgDbId },
    select: {
      id: true,
      item_id: true,
      access_token: true,
      last_synced_at: true,
    },
  });

  if (!item) {
    return Response.json({ error: "Account not found." }, { status: 404 });
  }

  if (plaidAccountId) {
    const itemAccountRows = await prisma.plaid_transactions.findMany({
      where: {
        plaid_item_id: id,
        organization_id: access.orgDbId,
      },
      select: {
        account_id: true,
      },
      distinct: ["account_id"],
    });
    const uniqueAccountIds = itemAccountRows
      .map((row) => row.account_id.trim())
      .filter(Boolean);
    const isOnlyRemainingAccount =
      uniqueAccountIds.length <= 1 || uniqueAccountIds.every((accountId) => accountId === plaidAccountId);

    if (mode === "disconnect" && isOnlyRemainingAccount) {
      await removePlaidItemFromProvider(item.access_token);

      const updatedItem = await prisma.plaid_items.update({
        where: { id: item.id },
        data: {
          status: "disconnected",
          sync_enabled: false,
          transactions_cursor: null,
          access_token: "",
          disconnected_at: now,
          hidden_at: null,
          last_synced_at: item.last_synced_at ?? now,
          updated_at: now,
        },
        select: {
          id: true,
          status: true,
          sync_enabled: true,
          last_synced_at: true,
        },
      });

      await prisma.organization_payment_destinations.deleteMany({
        where: {
          organization_id: access.orgDbId,
          plaid_item_id: id,
        },
      });

      await prisma.plaid_item_audit_logs.create({
        data: {
          organization_id: access.orgDbId,
          plaid_item_id: id,
          action: "disconnect",
          actor_id: access.userId,
          metadata: {
            mode,
            itemId: item.item_id,
            plaidAccountId,
            scope: "item",
            keepHistory: true,
            hiddenFromUi: false,
            promotedFromSingleAccount: true,
          },
        },
      });

      return Response.json({
        success: true,
        mode,
        scope: "item",
        account: {
          id: updatedItem.id,
          status: updatedItem.status,
          sync_enabled: updatedItem.sync_enabled,
          last_synced_at: updatedItem.last_synced_at?.toISOString() ?? null,
        },
      });
    }

    if (mode === "disconnect") {
      await prisma.organization_payment_destinations.deleteMany({
        where: {
          organization_id: access.orgDbId,
          plaid_item_id: id,
          plaid_account_id: plaidAccountId,
        },
      });

      await prisma.plaid_item_audit_logs.create({
        data: {
          organization_id: access.orgDbId,
          plaid_item_id: id,
          action: "disconnect",
          actor_id: access.userId,
          metadata: {
            mode,
            itemId: item.item_id,
            plaidAccountId,
            scope: "account",
            keepHistory: true,
            hiddenFromUi: true,
          },
        },
      });

      return Response.json({
        success: true,
        mode,
        scope: "account",
        account: {
          plaidAccountId,
          keepHistory: true,
        },
      });
    }

    const deletedTransactions = await prisma.plaid_transactions.deleteMany({
      where: {
        plaid_item_id: id,
        organization_id: access.orgDbId,
        account_id: plaidAccountId,
      },
    });

    await prisma.organization_payment_destinations.deleteMany({
      where: {
        organization_id: access.orgDbId,
        plaid_item_id: id,
        plaid_account_id: plaidAccountId,
      },
    });

    const remainingTransactions = await prisma.plaid_transactions.count({
      where: {
        plaid_item_id: id,
        organization_id: access.orgDbId,
      },
    });

    if (remainingTransactions === 0) {
      await removePlaidItemFromProvider(item.access_token);
      await prisma.plaid_items.deleteMany({
        where: { id, organization_id: access.orgDbId },
      });
    }

    await prisma.plaid_item_audit_logs.create({
      data: {
        organization_id: access.orgDbId,
        plaid_item_id: id,
        action: "disconnect_delete",
        actor_id: access.userId,
        metadata: {
          mode,
          itemId: item.item_id,
          plaidAccountId,
          scope: "account",
          deletedTransactions: deletedTransactions.count,
          deletedEmptyItem: remainingTransactions === 0,
        },
      },
    });

    return Response.json({
      success: true,
      mode,
      scope: "account",
      account: {
        plaidAccountId,
        deletedTransactions: deletedTransactions.count,
        deletedEmptyItem: remainingTransactions === 0,
      },
    });
  }

  await removePlaidItemFromProvider(item.access_token);

  if (mode === "disconnect_delete") {
    const deletedTransactions = await prisma.plaid_transactions.deleteMany({
      where: { plaid_item_id: id, organization_id: access.orgDbId },
    });
    await prisma.plaid_items.deleteMany({
      where: { id, organization_id: access.orgDbId },
    });
    await prisma.plaid_item_audit_logs.create({
      data: {
        organization_id: access.orgDbId,
        plaid_item_id: id,
        action: "disconnect_delete",
        actor_id: access.userId,
        metadata: {
          mode,
          itemId: item.item_id,
          deletedTransactions: deletedTransactions.count,
        },
      },
    });

    return Response.json({
      success: true,
      mode,
      account: null,
    });
  }

  const hiddenAt = mode === "disconnect_hide" ? now : null;

  const updatedItem = await prisma.plaid_items.update({
    where: { id: item.id },
    data: {
      status: "disconnected",
      sync_enabled: false,
      transactions_cursor: null,
      access_token: "",
      disconnected_at: now,
      hidden_at: hiddenAt,
      last_synced_at: item.last_synced_at ?? now,
      updated_at: now,
    },
    select: {
      id: true,
      status: true,
      sync_enabled: true,
      last_synced_at: true,
    },
  });

  await prisma.plaid_item_audit_logs.create({
    data: {
      organization_id: access.orgDbId,
      plaid_item_id: id,
      action: mode,
      actor_id: access.userId,
      metadata: {
        mode,
        itemId: item.item_id,
        keepHistory: true,
        hiddenFromUi: mode === "disconnect_hide",
      },
    },
  });

  return Response.json({
    success: true,
    mode,
    account: {
      id: updatedItem.id,
      status: updatedItem.status,
      sync_enabled: updatedItem.sync_enabled,
      last_synced_at: updatedItem.last_synced_at?.toISOString() ?? null,
    },
  });
}
