import { isAccessError, requireOrgAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireOrgAccess();
  if (isAccessError(access)) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { notes?: unknown } | null;
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : "";

  const item = await prisma.plaid_items.findFirst({
    where: { id, organization_id: access.orgDbId },
    select: { id: true, item_id: true },
  });

  if (!item) {
    return Response.json({ error: "Account not found." }, { status: 404 });
  }

  const deletionRequest = await prisma.plaid_data_deletion_requests.create({
    data: {
      organization_id: access.orgDbId,
      plaid_item_id: item.id,
      requested_by: access.userId,
      status: "pending",
      notes: notes || null,
    },
    select: {
      id: true,
      status: true,
      created_at: true,
    },
  });

  await prisma.plaid_item_audit_logs.create({
    data: {
      organization_id: access.orgDbId,
      plaid_item_id: item.id,
      action: "data_deletion_requested",
      actor_id: access.userId,
      metadata: {
        itemId: item.item_id,
        requestId: deletionRequest.id,
      },
    },
  });

  return Response.json({
    success: true,
    request: {
      id: deletionRequest.id,
      status: deletionRequest.status,
      createdAt: deletionRequest.created_at.toISOString(),
    },
  });
}
