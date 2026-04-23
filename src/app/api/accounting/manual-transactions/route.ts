import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { canonicalAccountingCategory } from "@/lib/accounting-categories";
import { isAccessError, requireOrgAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { manualMerchantMetadata } from "@/lib/manual-merchant-logos";
import type { SerializedAccountingTransaction } from "@/lib/accounting";

function cleanText(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, limit);
}

function cleanOptionalText(value: unknown, limit: number) {
  const cleaned = cleanText(value, limit);
  return cleaned || null;
}

function readAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value);
  if (typeof value !== "string") return null;
  const amount = Number.parseFloat(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? Math.abs(amount) : null;
}

function readBoolean(value: unknown) {
  return value === true || value === "true" || value === "income";
}

function readDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(`${value.trim()}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function actorName(user: Awaited<ReturnType<typeof currentUser>>, fallback: string) {
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
  return fullName || user?.primaryEmailAddress?.emailAddress || fallback;
}

function serializeManualTransaction(
  row: {
    id: string;
    date: Date;
    description: string;
    amount: unknown;
    is_income: boolean;
    category: string;
    account_label: string;
    updated_at: Date;
    updated_by: string | null;
    created_by: string | null;
  },
  updatedBy: string,
): SerializedAccountingTransaction {
  const merchant = manualMerchantMetadata(row.description);

  return {
    id: row.id,
    date: row.date.toISOString(),
    description: row.description,
    merchantName: merchant.merchantName,
    merchantEntityId: null,
    merchantLogoUrl: merchant.merchantLogoUrl,
    merchantWebsite: merchant.merchantWebsite,
    categoryIconUrl: null,
    counterpartyType: null,
    category: row.category,
    categoryAudit: {
      source: "manual",
      updatedAt: row.updated_at.toISOString(),
      updatedBy,
    },
    account: row.account_label,
    bank: "Manual",
    amount: Math.abs(Number(row.amount)),
    isIncome: row.is_income,
    source: "manual",
  };
}

export async function POST(request: Request) {
  const [access, user] = await Promise.all([requireOrgAccess(), currentUser()]);
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as {
    date?: unknown;
    description?: unknown;
    amount?: unknown;
    isIncome?: unknown;
    category?: unknown;
    account?: unknown;
    notes?: unknown;
    reference?: unknown;
  } | null;
  const date = readDate(body?.date);
  const description = cleanText(body?.description, 160);
  const amount = readAmount(body?.amount);
  const category =
    canonicalAccountingCategory(cleanText(body?.category, 80)) || "Uncategorized";
  const account = cleanText(body?.account, 120) || "Manual";

  if (!date || !description || amount === null || amount <= 0) {
    return NextResponse.json(
      { error: "Date, description, and a positive amount are required." },
      { status: 400 },
    );
  }

  const transaction = await prisma.manual_transactions.create({
    data: {
      organization_id: access.orgDbId,
      date,
      description,
      amount,
      is_income: readBoolean(body?.isIncome),
      category,
      account_label: account,
      notes: cleanOptionalText(body?.notes, 500),
      reference: cleanOptionalText(body?.reference, 120),
      created_by: access.userId,
      updated_by: access.userId,
    },
  });

  return NextResponse.json(
    {
      transaction: serializeManualTransaction(
        transaction,
        actorName(user, access.userId),
      ),
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const [access, user] = await Promise.all([requireOrgAccess(), currentUser()]);
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as {
    transactionId?: unknown;
    deleted?: unknown;
    date?: unknown;
    description?: unknown;
    amount?: unknown;
    isIncome?: unknown;
    category?: unknown;
    account?: unknown;
    notes?: unknown;
    reference?: unknown;
  } | null;
  const transactionId = cleanText(body?.transactionId, 80);
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId is required." }, { status: 400 });
  }

  if (body?.deleted === true) {
    const { count } = await prisma.manual_transactions.updateMany({
      where: {
        id: transactionId,
        organization_id: access.orgDbId,
        deleted_at: null,
      },
      data: {
        deleted_at: new Date(),
        updated_by: access.userId,
        updated_at: new Date(),
      },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  const date = body?.date === undefined ? undefined : readDate(body.date);
  const amount = body?.amount === undefined ? undefined : readAmount(body.amount);
  const description =
    body?.description === undefined ? undefined : cleanText(body.description, 160);
  const category =
    body?.category === undefined
      ? undefined
      : canonicalAccountingCategory(cleanText(body.category, 80)) || "Uncategorized";
  const account =
    body?.account === undefined ? undefined : cleanText(body.account, 120) || "Manual";

  if (date === null || amount === null || amount === 0 || description === "") {
    return NextResponse.json({ error: "Invalid transaction fields." }, { status: 400 });
  }

  const { count } = await prisma.manual_transactions.updateMany({
    where: {
      id: transactionId,
      organization_id: access.orgDbId,
      deleted_at: null,
    },
    data: {
      ...(date ? { date } : {}),
      ...(description ? { description } : {}),
      ...(amount ? { amount } : {}),
      ...(body?.isIncome === undefined ? {} : { is_income: readBoolean(body.isIncome) }),
      ...(category ? { category } : {}),
      ...(account ? { account_label: account } : {}),
      ...(body?.notes === undefined ? {} : { notes: cleanOptionalText(body.notes, 500) }),
      ...(body?.reference === undefined
        ? {}
        : { reference: cleanOptionalText(body.reference, 120) }),
      updated_by: access.userId,
      updated_at: new Date(),
    },
  });

  if (count === 0) {
    return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  }

  const transaction = await prisma.manual_transactions.findFirst({
    where: {
      id: transactionId,
      organization_id: access.orgDbId,
      deleted_at: null,
    },
  });

  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  }

  return NextResponse.json({
    transaction: serializeManualTransaction(transaction, actorName(user, access.userId)),
  });
}
