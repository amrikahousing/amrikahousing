import { NextResponse } from "next/server";
import { getTransactionsMatchingRule } from "@/lib/accounting-rule-matches";
import { isAccessError, requireOrgAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const access = await requireOrgAccess();
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as {
    ruleId?: unknown;
    excludeTransactionId?: unknown;
  } | null;
  const ruleId = cleanText(body?.ruleId);

  if (!ruleId) {
    return NextResponse.json({ error: "A rule is required." }, { status: 400 });
  }

  const rule = await prisma.accounting_vendor_category_rules.findFirst({
    where: {
      id: ruleId,
      organization_id: access.orgDbId,
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
    },
  });

  if (!rule) {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }

  const matches = await getTransactionsMatchingRule({
    orgId: access.orgId,
    rule,
    excludeTransactionId: cleanText(body?.excludeTransactionId),
  });

  return NextResponse.json({
    count: matches.length,
    transactionIds: matches.map((transaction) => transaction.id),
    category: rule.category,
    categoryAudit: {
      source: "vendor_rule",
      updatedAt: null,
      updatedBy: null,
    },
  });
}
