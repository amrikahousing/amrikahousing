import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const SOURCES = new Set(["plaid", "rent"]);

function normalizeCategory(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function PATCH(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!orgId) {
    return NextResponse.json({ error: "Organization is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    transactionId?: unknown;
    source?: unknown;
    category?: unknown;
  } | null;
  const transactionId =
    typeof body?.transactionId === "string" ? body.transactionId.trim() : "";
  const source = typeof body?.source === "string" ? body.source.trim() : "";
  const category = normalizeCategory(body?.category);

  if (!transactionId || !SOURCES.has(source)) {
    return NextResponse.json(
      { error: "A valid transaction and source are required" },
      { status: 400 },
    );
  }

  const organization = await prisma.organizations.findUnique({
    where: { clerk_org_id: orgId },
    select: { id: true },
  });

  if (!organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  if (!category) {
    await prisma.accounting_transaction_categories.deleteMany({
      where: {
        organization_id: organization.id,
        source,
        transaction_id: transactionId,
      },
    });

    return NextResponse.json({ category: null });
  }

  const override = await prisma.accounting_transaction_categories.upsert({
    where: {
      accounting_transaction_categories_org_source_transaction_key: {
        organization_id: organization.id,
        source,
        transaction_id: transactionId,
      },
    },
    create: {
      organization_id: organization.id,
      transaction_id: transactionId,
      source,
      category,
      created_by: userId,
    },
    update: {
      category,
      updated_at: new Date(),
    },
    select: {
      category: true,
    },
  });

  return NextResponse.json({ category: override.category });
}
