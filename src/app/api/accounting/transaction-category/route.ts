import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";

const SOURCES = new Set(["plaid", "rent", "manual"]);

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCategory(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function PATCH(request: Request) {
  const [access, user] = await Promise.all([getOrgPermissionContext(), currentUser()]);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_accounting");
  if (permissionError) {
    return NextResponse.json({ error: permissionError.error }, { status: permissionError.status });
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

  if (source === "manual") {
    if (!category) {
      return NextResponse.json({ error: "A category is required" }, { status: 400 });
    }

    const { count } = await prisma.manual_transactions.updateMany({
      where: {
        id: transactionId,
        organization_id: access.orgDbId,
        deleted_at: null,
      },
      data: {
        category,
        updated_by: access.userId,
        updated_at: new Date(),
      },
    });

    if (count === 0) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const transaction = await prisma.manual_transactions.findFirst({
      where: {
        id: transactionId,
        organization_id: access.orgDbId,
        deleted_at: null,
      },
      select: {
        category: true,
        updated_at: true,
      },
    });

    const unsafeMetadata = user?.unsafeMetadata as Record<string, unknown> | null;
    const publicMetadata = user?.publicMetadata as Record<string, unknown> | null;
    const firstName =
      user?.firstName ??
      metadataString(unsafeMetadata, "firstName") ??
      metadataString(publicMetadata, "firstName");
    const lastName =
      user?.lastName ??
      metadataString(unsafeMetadata, "lastName") ??
      metadataString(publicMetadata, "lastName");
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    return NextResponse.json({
      category: transaction?.category ?? category,
      categoryAudit: {
        source: "manual",
        updatedAt: (transaction?.updated_at ?? new Date()).toISOString(),
        updatedBy:
          fullName ||
          user?.primaryEmailAddress?.emailAddress ||
          access.userId,
      },
    });
  }

  if (!category) {
    await prisma.accounting_transaction_categories.deleteMany({
      where: {
        organization_id: access.orgDbId,
        source,
        transaction_id: transactionId,
      },
    });

    return NextResponse.json({ category: null });
  }

  const override = await prisma.accounting_transaction_categories.upsert({
    where: {
      accounting_transaction_categories_org_source_transaction_key: {
        organization_id: access.orgDbId,
        source,
        transaction_id: transactionId,
      },
    },
    create: {
      organization_id: access.orgDbId,
      transaction_id: transactionId,
      source,
      category,
      category_source: "manual",
      created_by: access.userId,
      updated_by: access.userId,
    },
    update: {
      category,
      category_source: "manual",
      updated_by: access.userId,
      updated_at: new Date(),
    },
    select: {
      category: true,
      updated_at: true,
    },
  });

  const unsafeMetadata = user?.unsafeMetadata as Record<string, unknown> | null;
  const publicMetadata = user?.publicMetadata as Record<string, unknown> | null;
  const firstName =
    user?.firstName ??
    metadataString(unsafeMetadata, "firstName") ??
    metadataString(publicMetadata, "firstName");
  const lastName =
    user?.lastName ??
    metadataString(unsafeMetadata, "lastName") ??
    metadataString(publicMetadata, "lastName");
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return NextResponse.json({
    category: override.category,
    categoryAudit: {
      source: "manual",
      updatedAt: override.updated_at.toISOString(),
      updatedBy:
        fullName ||
        user?.primaryEmailAddress?.emailAddress ||
        access.userId,
    },
  });
}
