import { isAccessError, requireOrgAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptPlaidAccessToken, getPlaidConfig } from "@/lib/plaid";

type DisconnectMode = "disconnect" | "disconnect_hide" | "disconnect_delete";

function normalizeMode(value: unknown): DisconnectMode {
  if (value === "disconnect_hide" || value === "disconnect_delete") {
    return value;
  }
  return "disconnect";
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireOrgAccess();
  if (isAccessError(access)) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  const mode = normalizeMode(body?.mode);
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

  try {
    const config = getPlaidConfig();
    if (!("error" in config) && item.access_token) {
      const accessToken = decryptPlaidAccessToken(item.access_token);
      await fetch(`${config.baseUrl}/item/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: config.clientId,
          secret: config.secret,
          access_token: accessToken,
        }),
      });
    }
  } catch {
    // Best effort only
  }

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
