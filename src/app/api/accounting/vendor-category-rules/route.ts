import { NextResponse } from "next/server";
import { canonicalAccountingCategory } from "@/lib/accounting-categories";
import { cleanVendorName, normalizeRuleContext, normalizeVendorKey } from "@/lib/accounting-vendor-rules";
import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";

function cleanOptionalText(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, limit);
}

export async function GET() {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_accounting");
  if (permissionError) {
    return NextResponse.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const rules = await prisma.accounting_vendor_category_rules.findMany({
    where: { organization_id: access.orgDbId },
    select: {
      id: true,
      vendor_name: true,
      vendor_key: true,
      category: true,
      bank: true,
      account: true,
      confidence: true,
      reason: true,
      updated_at: true,
    },
    orderBy: { vendor_name: "asc" },
  });

  return NextResponse.json({ rules });
}

export async function PATCH(request: Request) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_accounting");
  if (permissionError) {
    return NextResponse.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const body = (await request.json().catch(() => null)) as {
    ruleId?: unknown;
    category?: unknown;
  } | null;
  const ruleId = cleanOptionalText(body?.ruleId, 80);
  const category = canonicalAccountingCategory(cleanOptionalText(body?.category, 80));

  if (!ruleId || !category) {
    return NextResponse.json({ error: "ruleId and category are required." }, { status: 400 });
  }

  const { count } = await prisma.accounting_vendor_category_rules.updateMany({
    where: { id: ruleId, organization_id: access.orgDbId },
    data: { category, updated_at: new Date() },
  });

  if (count === 0) {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }

  const updated = await prisma.accounting_vendor_category_rules.findUnique({
    where: { id: ruleId },
    select: {
      id: true,
      vendor_name: true,
      vendor_key: true,
      category: true,
      bank: true,
      account: true,
      confidence: true,
      reason: true,
      updated_at: true,
    },
  });

  return NextResponse.json({ rule: updated });
}

export async function DELETE(request: Request) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_accounting");
  if (permissionError) {
    return NextResponse.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const body = (await request.json().catch(() => null)) as {
    ruleId?: unknown;
  } | null;
  const ruleId = cleanOptionalText(body?.ruleId, 80);

  if (!ruleId) {
    return NextResponse.json({ error: "ruleId is required." }, { status: 400 });
  }

  const { count } = await prisma.accounting_vendor_category_rules.deleteMany({
    where: { id: ruleId, organization_id: access.orgDbId },
  });

  if (count === 0) {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_accounting");
  if (permissionError) {
    return NextResponse.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const body = (await request.json().catch(() => null)) as {
    description?: unknown;
    category?: unknown;
    bank?: unknown;
    account?: unknown;
    confidence?: unknown;
    reason?: unknown;
  } | null;
  const description = cleanOptionalText(body?.description, 160);
  const vendorKey = normalizeVendorKey(description);
  const category = canonicalAccountingCategory(cleanOptionalText(body?.category, 80));
  const bank = normalizeRuleContext(cleanOptionalText(body?.bank, 120));
  const account = normalizeRuleContext(cleanOptionalText(body?.account, 160));
  const confidence =
    typeof body?.confidence === "number"
      ? Math.max(0, Math.min(1, body.confidence))
      : null;
  const reason = cleanOptionalText(body?.reason, 160) || null;

  if (!vendorKey || !category) {
    return NextResponse.json(
      { error: "A vendor and category are required." },
      { status: 400 },
    );
  }

  const conflictingRule = await prisma.accounting_vendor_category_rules.findFirst({
    where: {
      organization_id: access.orgDbId,
      vendor_key: vendorKey,
      category: { not: category },
    },
    select: { id: true },
  });
  const scopedBank = conflictingRule ? bank : "";
  const scopedAccount = conflictingRule ? account : "";

  const rule = await prisma.accounting_vendor_category_rules.upsert({
    where: {
      accounting_vendor_rules_org_vendor_context_key: {
        organization_id: access.orgDbId,
        vendor_key: vendorKey,
        bank: scopedBank,
        account: scopedAccount,
      },
    },
    create: {
      organization_id: access.orgDbId,
      vendor_key: vendorKey,
      vendor_name: cleanVendorName(description),
      category,
      bank: scopedBank,
      account: scopedAccount,
      confidence,
      reason,
      created_by: access.userId,
    },
    update: {
      vendor_name: cleanVendorName(description),
      category,
      confidence,
      reason,
      updated_at: new Date(),
    },
    select: {
      id: true,
      vendor_key: true,
      vendor_name: true,
      category: true,
      bank: true,
      account: true,
      confidence: true,
      reason: true,
      updated_at: true,
    },
  });

  return NextResponse.json({ rule });
}
