import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountingData, AccountingTransaction } from "@/lib/accounting";
import { getAccountingData } from "@/lib/accounting";
import { getTransactionsMatchingRule } from "@/lib/accounting-rule-matches";

// @/lib/accounting imports Prisma, Clerk, and the AI SDK at module scope, so it
// must be mocked. sortTransactionsByDate mirrors the real implementation
// (newest first, null dates treated as epoch 0).
vi.mock("@/lib/accounting", () => ({
  getAccountingData: vi.fn(),
  sortTransactionsByDate: (transactions: AccountingTransaction[]) =>
    [...transactions].sort(
      (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0),
    ),
}));

const mockedGetAccountingData = vi.mocked(getAccountingData);

// Only the fields the matcher reads are populated; the cast keeps the helper
// small without pulling in the full AccountingTransaction shape.
function tx(overrides: Partial<AccountingTransaction>): AccountingTransaction {
  return {
    id: "tx-1",
    date: new Date("2026-01-15"),
    description: "STARBUCKS #1234",
    source: "plaid",
    isIncome: false,
    bank: "Chase",
    account: "Checking",
    ...overrides,
  } as AccountingTransaction;
}

function givenTransactions(transactions: AccountingTransaction[]) {
  mockedGetAccountingData.mockResolvedValue({
    transactions,
  } as AccountingData);
}

const starbucksRule = { vendor_key: "starbucks", bank: "", account: "" };

describe("getTransactionsMatchingRule", () => {
  beforeEach(() => {
    mockedGetAccountingData.mockReset();
  });

  it("passes the orgId through to getAccountingData", async () => {
    givenTransactions([]);
    await getTransactionsMatchingRule({ orgId: "org_123", rule: starbucksRule });
    expect(mockedGetAccountingData).toHaveBeenCalledWith("org_123");
  });

  it("returns plaid expense transactions whose normalized description matches the vendor key", async () => {
    givenTransactions([
      tx({ id: "match-plain", description: "STARBUCKS" }),
      tx({ id: "match-noisy", description: "DEBIT CARD PURCHASE STARBUCKS 5678" }),
      tx({ id: "other-vendor", description: "WALMART" }),
    ]);

    const matches = await getTransactionsMatchingRule({
      orgId: "org_123",
      rule: starbucksRule,
    });

    expect(matches.map((m) => m.id).sort()).toEqual(["match-noisy", "match-plain"]);
  });

  it("excludes the transaction named by excludeTransactionId", async () => {
    givenTransactions([tx({ id: "keep" }), tx({ id: "skip" })]);

    const matches = await getTransactionsMatchingRule({
      orgId: "org_123",
      rule: starbucksRule,
      excludeTransactionId: "skip",
    });

    expect(matches.map((m) => m.id)).toEqual(["keep"]);
  });

  it("excludes non-plaid and income transactions", async () => {
    givenTransactions([
      tx({ id: "manual", source: "manual" }),
      tx({ id: "rent", source: "rent" }),
      tx({ id: "income", isIncome: true }),
      tx({ id: "expense" }),
    ]);

    const matches = await getTransactionsMatchingRule({
      orgId: "org_123",
      rule: starbucksRule,
    });

    expect(matches.map((m) => m.id)).toEqual(["expense"]);
  });

  it("filters by bank and account only when the rule scopes them", async () => {
    const transactions = [
      tx({ id: "chase-checking" }),
      tx({ id: "chase-savings", account: "Savings" }),
      tx({ id: "wells-checking", bank: "Wells Fargo" }),
    ];

    givenTransactions(transactions);
    const unscoped = await getTransactionsMatchingRule({
      orgId: "org_123",
      rule: starbucksRule,
    });
    expect(unscoped).toHaveLength(3);

    givenTransactions(transactions);
    const bankScoped = await getTransactionsMatchingRule({
      orgId: "org_123",
      rule: { vendor_key: "starbucks", bank: "Chase", account: "" },
    });
    expect(bankScoped.map((m) => m.id).sort()).toEqual([
      "chase-checking",
      "chase-savings",
    ]);

    givenTransactions(transactions);
    const fullyScoped = await getTransactionsMatchingRule({
      orgId: "org_123",
      rule: { vendor_key: "starbucks", bank: "Chase", account: "Checking" },
    });
    expect(fullyScoped.map((m) => m.id)).toEqual(["chase-checking"]);
  });

  it("returns matches sorted newest first, with null dates last", async () => {
    givenTransactions([
      tx({ id: "oldest", date: new Date("2025-01-01") }),
      tx({ id: "undated", date: null }),
      tx({ id: "newest", date: new Date("2026-06-30") }),
      tx({ id: "middle", date: new Date("2026-01-15") }),
    ]);

    const matches = await getTransactionsMatchingRule({
      orgId: "org_123",
      rule: starbucksRule,
    });

    expect(matches.map((m) => m.id)).toEqual([
      "newest",
      "middle",
      "oldest",
      "undated",
    ]);
  });

  it("returns an empty array when nothing matches", async () => {
    givenTransactions([tx({ id: "walmart", description: "WALMART" })]);

    const matches = await getTransactionsMatchingRule({
      orgId: "org_123",
      rule: { vendor_key: "no such vendor", bank: "", account: "" },
    });

    expect(matches).toEqual([]);
  });
});
