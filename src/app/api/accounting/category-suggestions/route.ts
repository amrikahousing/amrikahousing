import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canonicalAccountingCategory,
  mergeAccountingCategoryOptions,
} from "@/lib/accounting-categories";
import { getAccountingData } from "@/lib/accounting";
import {
  cleanVendorName,
  findVendorRuleForTransaction,
  normalizeVendorKey,
} from "@/lib/accounting-vendor-rules";
import { isAccessError, requireOrgAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MAX_SUGGESTIONS = 40;

const suggestionOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      transactionId: z.string(),
      category: z.string(),
      confidence: z.number(),
      reason: z.string(),
    }),
  ),
});

function readTransactionIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS);
}

function amountBucket(amount: number) {
  if (amount < 25) return "under $25";
  if (amount < 100) return "$25-$99";
  if (amount < 500) return "$100-$499";
  if (amount < 1000) return "$500-$999";
  return "$1,000+";
}

export async function POST(request: Request) {
  const access = await requireOrgAccess();
  if (isAccessError(access)) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI categorization is not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    transactionIds?: unknown;
  } | null;
  const transactionIds = readTransactionIds(body?.transactionIds);

  if (transactionIds.length === 0) {
    return NextResponse.json(
      { error: "Choose at least one transaction to categorize." },
      { status: 400 },
    );
  }

  const [accountingData, vendorRules, categoryOverrides] = await Promise.all([
    getAccountingData(access.orgId),
    prisma.accounting_vendor_category_rules.findMany({
      where: { organization_id: access.orgDbId },
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
    }),
    prisma.accounting_transaction_categories.findMany({
      where: {
        organization_id: access.orgDbId,
        source: "plaid",
      },
      select: {
        transaction_id: true,
        category_source: true,
      },
    }),
  ]);

  const selectedIds = new Set(transactionIds);
  const selectedTransactions = accountingData.transactions
    .filter((transaction) => selectedIds.has(transaction.id))
    .filter((transaction) => transaction.source === "plaid" && !transaction.isIncome);
  const manuallyCategorizedIds = new Set(
    categoryOverrides
      .filter((override) => override.category_source === "manual")
      .map((override) => override.transaction_id),
  );
  const transactionsWithoutManualOverrides = selectedTransactions
    .filter((transaction) => !manuallyCategorizedIds.has(transaction.id));
  const transactions = transactionsWithoutManualOverrides
    .filter((transaction) => !findVendorRuleForTransaction(transaction, vendorRules))
    .slice(0, MAX_SUGGESTIONS);
  const skippedManualCount =
    selectedTransactions.length - transactionsWithoutManualOverrides.length;
  const skippedRuleCount =
    transactionsWithoutManualOverrides.length - transactions.length;

  if (transactions.length === 0) {
    return NextResponse.json({
      suggestions: [],
      reviewedCount: 0,
      skippedManualCount,
      skippedRuleCount,
    });
  }

  const categories = mergeAccountingCategoryOptions(
    accountingData.transactions.map((transaction) => transaction.category),
  );
  const safeTransactions = transactions.map((transaction) => ({
    transactionId: transaction.id,
    vendor: cleanVendorName(transaction.description),
    vendorKey: normalizeVendorKey(transaction.description),
    currentCategory: transaction.category,
    amountBucket: amountBucket(transaction.amount),
    type: transaction.isIncome ? "income" : "expense",
    bank: transaction.bank,
    account: transaction.account,
    date: transaction.date ? transaction.date.toISOString().slice(0, 10) : null,
    source: transaction.source,
  }));

  try {
    const result = await generateText({
      model: anthropic(process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"),
      system:
        "You categorize rental property accounting transactions. Return conservative, reviewable suggestions only. Prefer the provided categories when they fit. Use clean accounting category names. Never invent facts.",
      prompt: JSON.stringify({
        instructions: [
          "Return one category suggestion for every transaction provided.",
          "Use the best accounting category even if it matches currentCategory.",
          "Use confidence from 0 to 1.",
          "Keep reasons under 80 characters.",
        ],
        availableCategories: categories,
        transactions: safeTransactions,
      }),
      output: Output.object({
        schema: suggestionOutputSchema,
        name: "transaction_category_suggestions",
      }),
    });

    const aiSuggestionsById = new Map(
      result.output.suggestions.map((suggestion) => [
        suggestion.transactionId,
        {
          category: canonicalAccountingCategory(suggestion.category, categories),
          confidence: Math.max(0, Math.min(1, suggestion.confidence)),
          reason: suggestion.reason.trim().replace(/\s+/g, " ").slice(0, 100),
        },
      ]),
    );
    const suggestions = transactions.map((transaction) => {
      const aiSuggestion = aiSuggestionsById.get(transaction.id);

      return {
        transactionId: transaction.id,
        category: aiSuggestion?.category || transaction.category,
        confidence: aiSuggestion?.confidence ?? null,
        reason: aiSuggestion?.reason || "",
      };
    });

    return NextResponse.json({
      suggestions,
      reviewedCount: transactions.length,
      skippedManualCount,
      skippedRuleCount,
    });
  } catch (err) {
    console.error("[category-suggestions]", err);
    return NextResponse.json(
      { error: "Could not generate category suggestions." },
      { status: 502 },
    );
  }
}
