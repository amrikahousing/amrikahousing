"use client";

import {
  type KeyboardEvent,
  useMemo,
  useState,
} from "react";
import { mergeAccountingCategoryOptions } from "@/lib/accounting-categories";
import type { SerializedAccountingTransaction } from "@/lib/accounting";

type RowStatus = "idle" | "saving" | "saved" | "error";
type AiStatus = "idle" | "loading" | "success" | "error";
type VendorRule = {
  id: string;
  vendor_name: string;
  vendor_key: string;
  category: string;
  bank: string;
  account: string;
  confidence: number | null;
  reason: string | null;
  updated_at: string | null;
};

type CategorySuggestion = {
  transactionId: string;
  category: string;
  confidence: number;
  reason: string;
};

type PastApplyPrompt = {
  ruleId: string;
  excludeTransactionId: string;
  vendorName: string;
  category: string;
  count: number;
  examples: Array<{
    id: string;
    description: string;
    date: string | null;
    amount: number;
    category: string;
  }>;
};

type TransactionsLedgerProps = {
  transactions: SerializedAccountingTransaction[];
  allTransactionCount: number;
  categoryOptions: string[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function csvEscape(value: string | number | null) {
  const stringValue = value === null ? "" : String(value);
  return `"${stringValue.replaceAll('"', '""')}"`;
}

function buildCsv(transactions: SerializedAccountingTransaction[]) {
  const header = [
    "Date",
    "Description",
    "Bank",
    "Account",
    "Category",
    "Source",
    "Type",
    "Amount",
  ];
  const rows = transactions.map((transaction) => [
    transaction.date ? transaction.date.slice(0, 10) : "",
    transaction.description,
    transaction.bank,
    transaction.account,
    transaction.category,
    transaction.source,
    transaction.isIncome ? "Income" : "Expense",
    transaction.isIncome ? transaction.amount : -transaction.amount,
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => csvEscape(value)).join(","))
    .join("\n");
}

function categoryKey(category: string) {
  return category.trim().toLowerCase();
}

function optionValueForCategory(categoryList: string[], category: string) {
  return (
    categoryList.find((item) => categoryKey(item) === categoryKey(category)) ??
    category
  );
}

export function TransactionsLedger({
  transactions,
  allTransactionCount,
  categoryOptions,
}: TransactionsLedgerProps) {
  const [rows, setRows] = useState(transactions);
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [customCategoryRows, setCustomCategoryRows] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<Record<string, CategorySuggestion>>({});
  const [rememberRules, setRememberRules] = useState<Record<string, boolean>>({});
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiMessage, setAiMessage] = useState("");
  const [pastApplyPrompt, setPastApplyPrompt] = useState<PastApplyPrompt | null>(null);
  const [pastApplyStatus, setPastApplyStatus] = useState<RowStatus>("idle");
  const [showVendorMap, setShowVendorMap] = useState(false);
  const [vendorRules, setVendorRules] = useState<VendorRule[]>([]);
  const [vendorMapStatus, setVendorMapStatus] = useState<"idle" | "loading" | "error">("idle");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState("");
  const [ruleUpdateStatus, setRuleUpdateStatus] = useState<Record<string, "saving" | "error">>({});
  const [pendingRuleApply, setPendingRuleApply] = useState<{
    ruleId: string;
    category: string;
    count: number;
    examples: Array<{ id: string; description: string }>;
  } | null>(null);
  const [ruleApplyStatus, setRuleApplyStatus] = useState<"idle" | "saving" | "error">("idle");
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleVendor, setNewRuleVendor] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("");
  const [newRuleCustomCategory, setNewRuleCustomCategory] = useState("");
  const [addRuleStatus, setAddRuleStatus] = useState<"idle" | "saving" | "error">("idle");
  const categoryList = useMemo(
    () => mergeAccountingCategoryOptions([...categoryOptions, ...rows.map((row) => row.category)]),
    [categoryOptions, rows],
  );

  async function saveCategory(
    transaction: SerializedAccountingTransaction,
    category: string,
  ) {
    const nextCategory = category.trim().replace(/\s+/g, " ");
    if (!nextCategory) {
      setCustomCategoryRows((current) => ({ ...current, [transaction.id]: false }));
      return false;
    }
    if (categoryKey(nextCategory) === categoryKey(transaction.category)) return true;

    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === transaction.id ? { ...row, category: nextCategory } : row,
      ),
    );
    setStatuses((current) => ({ ...current, [transaction.id]: "saving" }));

    try {
      const response = await fetch("/api/accounting/transaction-category", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: transaction.id,
          source: transaction.source,
          category: nextCategory,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update category");
      }

      const result = (await response.json()) as { category: string | null };
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === transaction.id
            ? { ...row, category: result.category ?? transaction.category }
            : row,
        ),
      );
      setStatuses((current) => ({ ...current, [transaction.id]: "saved" }));
      setCustomCategoryRows((current) => ({ ...current, [transaction.id]: false }));
      window.setTimeout(() => {
        setStatuses((current) => ({ ...current, [transaction.id]: "idle" }));
      }, 1600);
      return true;
    } catch {
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === transaction.id
            ? { ...row, category: transaction.category }
            : row,
        ),
      );
      setStatuses((current) => ({ ...current, [transaction.id]: "error" }));
      return false;
    }
  }

  async function handleAiRecategorize() {
    const eligibleRows = rows.filter(
      (transaction) => transaction.source === "plaid" && !transaction.isIncome,
    );

    if (eligibleRows.length === 0) {
      setAiStatus("success");
      setAiMessage("No Plaid expense transactions are available for AI review.");
      return;
    }

    setAiStatus("loading");
    setAiMessage("Reviewing visible transactions...");

    try {
      const response = await fetch("/api/accounting/category-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionIds: eligibleRows.map((transaction) => transaction.id),
        }),
      });

      const result = (await response.json()) as {
        suggestions?: CategorySuggestion[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to generate suggestions");
      }

      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const nextSuggestions: Record<string, CategorySuggestion> = {};
      for (const suggestion of result.suggestions ?? []) {
        const row = rowsById.get(suggestion.transactionId);
        if (!row) continue;
        if (categoryKey(row.category) === categoryKey(suggestion.category)) continue;
        nextSuggestions[suggestion.transactionId] = suggestion;
      }

      setSuggestions(nextSuggestions);
      setRememberRules((current) => {
        const next = { ...current };
        for (const suggestion of Object.values(nextSuggestions)) {
          next[suggestion.transactionId] = current[suggestion.transactionId] ?? true;
        }
        return next;
      });
      setAiStatus("success");
      setAiMessage(
        Object.keys(nextSuggestions).length > 0
          ? `${Object.keys(nextSuggestions).length} suggestion${
              Object.keys(nextSuggestions).length === 1 ? "" : "s"
            } ready to review.`
          : "No category changes suggested for these transactions.",
      );
    } catch (error) {
      setAiStatus("error");
      setAiMessage(
        error instanceof Error
          ? error.message
          : "Could not generate category suggestions.",
      );
    }
  }

  async function handleApplySuggestion(
    transaction: SerializedAccountingTransaction,
    suggestion: CategorySuggestion,
  ) {
    const saved = await saveCategory(transaction, suggestion.category);
    if (!saved) return;

    setSuggestions((current) => {
      const next = { ...current };
      delete next[transaction.id];
      return next;
    });

    if (!rememberRules[transaction.id]) return;

    try {
      const ruleResponse = await fetch("/api/accounting/vendor-category-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: transaction.description,
          category: suggestion.category,
          bank: transaction.bank,
          account: transaction.account,
          confidence: suggestion.confidence,
          reason: suggestion.reason,
        }),
      });

      const ruleResult = (await ruleResponse.json()) as {
        rule?: {
          id: string;
          vendor_name: string;
          category: string;
        };
      };

      if (!ruleResponse.ok || !ruleResult.rule) return;

      const previewResponse = await fetch(
        "/api/accounting/vendor-category-rules/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ruleId: ruleResult.rule.id,
            excludeTransactionId: transaction.id,
          }),
        },
      );
      const preview = (await previewResponse.json()) as Omit<
        PastApplyPrompt,
        "ruleId" | "excludeTransactionId" | "vendorName" | "category"
      >;

      if (previewResponse.ok && preview.count > 0) {
        setPastApplyPrompt({
          ruleId: ruleResult.rule.id,
          excludeTransactionId: transaction.id,
          vendorName: ruleResult.rule.vendor_name,
          category: ruleResult.rule.category,
          count: preview.count,
          examples: preview.examples,
        });
      }
    } catch {
      setAiStatus("error");
      setAiMessage("Category saved, but the vendor rule could not be remembered.");
    }
  }

  async function handleApplyPastTransactions() {
    if (!pastApplyPrompt) return;

    setPastApplyStatus("saving");
    try {
      const response = await fetch("/api/accounting/vendor-category-rules/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: pastApplyPrompt.ruleId,
          excludeTransactionId: pastApplyPrompt.excludeTransactionId,
        }),
      });
      const result = (await response.json()) as {
        transactionIds?: string[];
        category?: string;
      };

      if (!response.ok) throw new Error("Unable to apply past transactions");

      const changedIds = new Set(result.transactionIds ?? []);
      setRows((currentRows) =>
        currentRows.map((row) =>
          changedIds.has(row.id) && result.category
            ? { ...row, category: result.category }
            : row,
        ),
      );
      setPastApplyStatus("saved");
      setPastApplyPrompt(null);
    } catch {
      setPastApplyStatus("error");
    }
  }

  async function handleOpenVendorMap() {
    setShowVendorMap(true);
    if (vendorMapStatus === "loading") return;
    setVendorMapStatus("loading");
    try {
      const response = await fetch("/api/accounting/vendor-category-rules");
      const result = (await response.json()) as { rules?: VendorRule[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Failed to load rules");
      setVendorRules(result.rules ?? []);
      setVendorMapStatus("idle");
    } catch {
      setVendorMapStatus("error");
    }
  }

  async function handleSaveRuleCategory(rule: VendorRule, newCategory: string) {
    const trimmed = newCategory.trim();
    if (!trimmed || trimmed.toLowerCase() === rule.category.toLowerCase()) {
      setEditingRuleId(null);
      return;
    }

    setRuleUpdateStatus((s) => ({ ...s, [rule.id]: "saving" }));

    try {
      const res = await fetch("/api/accounting/vendor-category-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId: rule.id, category: trimmed }),
      });
      const result = (await res.json()) as { rule?: VendorRule; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Failed to update rule");

      setVendorRules((current) =>
        current.map((r) => (r.id === rule.id ? { ...r, category: result.rule!.category } : r)),
      );
      setRuleUpdateStatus((s) => {
        const next = { ...s };
        delete next[rule.id];
        return next;
      });
      setEditingRuleId(null);

      // Preview how many transactions would be affected
      const previewRes = await fetch("/api/accounting/vendor-category-rules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId: rule.id }),
      });
      const preview = (await previewRes.json()) as {
        count?: number;
        examples?: Array<{ id: string; description: string }>;
      };

      if (previewRes.ok && (preview.count ?? 0) > 0) {
        setPendingRuleApply({
          ruleId: rule.id,
          category: trimmed,
          count: preview.count!,
          examples: preview.examples ?? [],
        });
        setRuleApplyStatus("idle");
      }
    } catch {
      setRuleUpdateStatus((s) => ({ ...s, [rule.id]: "error" }));
    }
  }

  async function handleApplyRuleToAll() {
    if (!pendingRuleApply) return;
    setRuleApplyStatus("saving");
    try {
      const res = await fetch("/api/accounting/vendor-category-rules/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId: pendingRuleApply.ruleId }),
      });
      const result = (await res.json()) as { transactionIds?: string[]; category?: string };
      if (!res.ok) throw new Error();

      const changedIds = new Set(result.transactionIds ?? []);
      setRows((current) =>
        current.map((row) =>
          changedIds.has(row.id) && result.category ? { ...row, category: result.category } : row,
        ),
      );
      setPendingRuleApply(null);
      setRuleApplyStatus("idle");
    } catch {
      setRuleApplyStatus("error");
    }
  }

  async function handleAddRule() {
    const vendor = newRuleVendor.trim();
    const category = (newRuleCategory === "__custom__" ? newRuleCustomCategory : newRuleCategory).trim();
    if (!vendor || !category) return;

    setAddRuleStatus("saving");
    try {
      const res = await fetch("/api/accounting/vendor-category-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: vendor, category }),
      });
      const result = (await res.json()) as { rule?: VendorRule; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Failed to add rule");

      setVendorRules((current) => {
        const existing = current.findIndex((r) => r.id === result.rule!.id);
        if (existing >= 0) {
          return current.map((r) => (r.id === result.rule!.id ? { ...r, ...result.rule! } : r));
        }
        return [...current, result.rule!].sort((a, b) =>
          a.vendor_name.localeCompare(b.vendor_name),
        );
      });
      setAddRuleStatus("idle");
      setNewRuleVendor("");
      setNewRuleCategory("");
      setNewRuleCustomCategory("");
      setShowAddRule(false);

      // Ask about applying to existing transactions
      const previewRes = await fetch("/api/accounting/vendor-category-rules/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId: result.rule!.id }),
      });
      const preview = (await previewRes.json()) as {
        count?: number;
        examples?: Array<{ id: string; description: string }>;
      };
      if (previewRes.ok && (preview.count ?? 0) > 0) {
        setPendingRuleApply({
          ruleId: result.rule!.id,
          category,
          count: preview.count!,
          examples: preview.examples ?? [],
        });
        setRuleApplyStatus("idle");
      }
    } catch {
      setAddRuleStatus("error");
    }
  }

  function handleDownloadCsv() {
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `amrika-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            All Transactions
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {rows.length.toLocaleString()} of {allTransactionCount.toLocaleString()} records
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleAiRecategorize}
              disabled={rows.length === 0 || aiStatus === "loading"}
              title={aiStatus === "loading" ? "Reviewing..." : "AI recategorize"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {aiStatus === "loading" ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={handleOpenVendorMap}
              title="Vendor–category mapping"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M3 15h18M9 3v18" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={rows.length === 0}
              title="Download CSV"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
          {aiMessage ? (
            <p
              className={
                aiStatus === "error"
                  ? "text-xs font-medium text-red-600"
                  : "text-xs font-medium text-slate-500"
              }
            >
              {aiMessage}
            </p>
          ) : null}
        </div>
      </div>

      {pastApplyPrompt ? (
        <div className="border-b border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-950">
                Remembered {pastApplyPrompt.vendorName} as {pastApplyPrompt.category}.
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                Apply this category to {pastApplyPrompt.count.toLocaleString()} matching past transaction{pastApplyPrompt.count === 1 ? "" : "s"}?
              </p>
              {pastApplyPrompt.examples.length > 0 ? (
                <p className="mt-2 text-xs text-emerald-700">
                  Examples: {pastApplyPrompt.examples.map((item) => item.description).join(", ")}
                </p>
              ) : null}
              {pastApplyStatus === "error" ? (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  Could not apply past transactions. Try again.
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleApplyPastTransactions}
                disabled={pastApplyStatus === "saving"}
                className="h-9 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {pastApplyStatus === "saving" ? "Applying..." : "Apply past"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPastApplyPrompt(null);
                  setPastApplyStatus("idle");
                }}
                className="h-9 rounded-lg px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Skip past
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            No transactions match these filters.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Try clearing a filter or syncing another Plaid account.
          </p>
        </div>
      ) : (
        <div className="max-h-[65vh] overflow-x-auto overflow-y-auto">
          <table className="min-w-[1080px] divide-y divide-slate-200 text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Description</th>
                <th className="px-5 py-3 font-semibold">Bank</th>
                <th className="px-5 py-3 font-semibold">Account</th>
                <th className="px-5 py-3 font-semibold">
                  Category
                  <span className="ml-1 normal-case tracking-normal text-slate-400">
                    select or add
                  </span>
                </th>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((transaction) => {
                const status = statuses[transaction.id] ?? "idle";
                const isCustomCategory = customCategoryRows[transaction.id] ?? false;
                const suggestion = suggestions[transaction.id];

                return (
                  <tr key={transaction.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {formatDate(transaction.date)}
                    </td>
                    <td className="max-w-80 truncate px-5 py-4 font-medium text-slate-950">
                      {transaction.description}
                    </td>
                    <td className="max-w-52 truncate px-5 py-4 text-slate-600">
                      {transaction.bank}
                    </td>
                    <td className="max-w-64 truncate px-5 py-4 text-slate-600">
                      {transaction.account}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex min-w-60 items-start gap-2">
                        <div className="w-full space-y-2">
                          <select
                            value={
                              isCustomCategory
                                ? "__custom__"
                                : optionValueForCategory(categoryList, transaction.category)
                            }
                            aria-label={`Category for ${transaction.description}`}
                            onChange={(event) => {
                              const nextCategory = event.currentTarget.value;
                              if (nextCategory === "__custom__") {
                                setCustomCategoryRows((current) => ({
                                  ...current,
                                  [transaction.id]: true,
                                }));
                                return;
                              }

                              setCustomCategoryRows((current) => ({
                                ...current,
                                [transaction.id]: false,
                              }));
                              saveCategory(transaction, nextCategory);
                            }}
                            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm capitalize text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                          >
                            {categoryList.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                            <option value="__custom__">Add custom category...</option>
                          </select>
                          {isCustomCategory ? (
                            <input
                              aria-label={`Custom category for ${transaction.description}`}
                              placeholder="Type custom category"
                              onBlur={(event) =>
                                saveCategory(transaction, event.currentTarget.value)
                              }
                              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }

                                if (event.key === "Escape") {
                                  setCustomCategoryRows((current) => ({
                                    ...current,
                                    [transaction.id]: false,
                                  }));
                                }
                              }}
                              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                            />
                          ) : null}
                          {suggestion ? (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-emerald-700">
                                  {suggestion.category}
                                </span>
                                <span className="text-xs font-medium text-emerald-700">
                                  {Math.round(suggestion.confidence * 100)}% confidence
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-emerald-800">
                                {suggestion.reason}
                              </p>
                              <label className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-900">
                                <input
                                  type="checkbox"
                                  checked={rememberRules[transaction.id] ?? true}
                                  onChange={(event) =>
                                    setRememberRules((current) => ({
                                      ...current,
                                      [transaction.id]: event.currentTarget.checked,
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-emerald-300"
                                />
                                Remember this vendor for future transactions
                              </label>
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplySuggestion(transaction, suggestion)
                                  }
                                  className="h-8 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                                >
                                  Apply
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSuggestions((current) => {
                                      const next = { ...current };
                                      delete next[transaction.id];
                                      return next;
                                    })
                                  }
                                  className="h-8 rounded-lg px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={
                            status === "error"
                              ? "mt-2 w-12 text-xs font-semibold text-red-600"
                              : status === "saved"
                                ? "mt-2 w-12 text-xs font-semibold text-emerald-600"
                                : "mt-2 w-12 text-xs text-slate-400"
                          }
                        >
                          {status === "saving"
                            ? "Saving"
                            : status === "saved"
                              ? "Saved"
                              : status === "error"
                                ? "Retry"
                                : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                        {transaction.source}
                      </span>
                    </td>
                    <td
                      className={
                        transaction.isIncome
                          ? "whitespace-nowrap px-5 py-4 text-right font-semibold text-emerald-600"
                          : "whitespace-nowrap px-5 py-4 text-right font-semibold text-red-600"
                      }
                    >
                      {transaction.isIncome ? "+" : "-"}
                      {formatCurrency(transaction.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>

      {showVendorMap ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowVendorMap(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Vendor–Category Mapping</h2>
                <p className="mt-0.5 text-xs text-slate-500">Rules remembered from AI suggestions</p>
              </div>
              <button
                type="button"
                onClick={() => setShowVendorMap(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {pendingRuleApply ? (
              <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-4">
                <p className="text-sm font-semibold text-emerald-950">
                  Apply "{pendingRuleApply.category}" to {pendingRuleApply.count.toLocaleString()} matching transaction{pendingRuleApply.count === 1 ? "" : "s"}?
                </p>
                {pendingRuleApply.examples.length > 0 ? (
                  <p className="mt-1 text-xs text-emerald-700">
                    e.g. {pendingRuleApply.examples.map((e) => e.description).join(", ")}
                  </p>
                ) : null}
                {ruleApplyStatus === "error" ? (
                  <p className="mt-1 text-xs font-semibold text-red-600">Could not apply. Try again.</p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleApplyRuleToAll}
                    disabled={ruleApplyStatus === "saving"}
                    className="h-8 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {ruleApplyStatus === "saving" ? "Applying…" : "Apply to all"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRuleApply(null)}
                    className="h-8 rounded-lg px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    Skip
                  </button>
                </div>
              </div>
            ) : null}
            <div className="overflow-y-auto">
              {vendorMapStatus === "loading" ? (
                <p className="px-6 py-8 text-center text-sm text-slate-500">Loading rules…</p>
              ) : vendorMapStatus === "error" ? (
                <p className="px-6 py-8 text-center text-sm font-medium text-red-600">Could not load vendor rules.</p>
              ) : vendorRules.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-slate-500">No vendor rules saved yet. Apply AI suggestions to create rules.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Vendor</th>
                      <th className="px-6 py-3 font-semibold">Category</th>
                      <th className="px-6 py-3 font-semibold">Context</th>
                      <th className="px-6 py-3 font-semibold">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vendorRules.map((rule) => {
                      const isEditing = editingRuleId === rule.id;
                      const updateStatus = ruleUpdateStatus[rule.id];
                      return (
                        <tr key={rule.id} className="hover:bg-slate-50">
                          <td className="max-w-48 truncate px-6 py-3 font-medium text-slate-950" title={rule.vendor_name}>
                            {rule.vendor_name || rule.vendor_key}
                          </td>
                          <td className="px-6 py-3">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <select
                                  value={editingCategory}
                                  onChange={(e) => setEditingCategory(e.currentTarget.value)}
                                  className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm capitalize text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                                >
                                  {categoryList.map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleSaveRuleCategory(rule, editingCategory)}
                                  disabled={updateStatus === "saving"}
                                  className="h-7 rounded-lg bg-emerald-700 px-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                                >
                                  {updateStatus === "saving" ? "Saving…" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRuleId(null)}
                                  className="h-7 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                >
                                  Cancel
                                </button>
                                {updateStatus === "error" ? (
                                  <span className="text-xs font-medium text-red-600">Error</span>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="capitalize text-slate-700">{rule.category}</span>
                                <button
                                  type="button"
                                  title="Edit category"
                                  onClick={() => {
                                    setEditingRuleId(rule.id);
                                    setEditingCategory(
                                      categoryList.find(
                                        (c) => c.toLowerCase() === rule.category.toLowerCase(),
                                      ) ?? rule.category,
                                    );
                                  }}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3 text-slate-500">
                            {rule.bank || rule.account ? (
                              <span className="text-xs">
                                {[rule.bank, rule.account].filter(Boolean).join(" / ")}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">All accounts</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-slate-600">
                            {rule.confidence !== null ? (
                              <span className="text-xs font-medium">
                                {Math.round(rule.confidence * 100)}%
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add rule form */}
            <div className="border-t border-slate-200">
              {showAddRule ? (
                <div className="p-5">
                  <p className="mb-3 text-sm font-semibold text-slate-800">Add vendor rule</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex-1 space-y-1.5" style={{ minWidth: "180px" }}>
                      <span className="text-xs font-semibold text-slate-600">Vendor name</span>
                      <input
                        type="text"
                        value={newRuleVendor}
                        onChange={(e) => setNewRuleVendor(e.currentTarget.value)}
                        placeholder="e.g. Home Depot"
                        className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                      />
                    </label>
                    <label className="flex-1 space-y-1.5" style={{ minWidth: "180px" }}>
                      <span className="text-xs font-semibold text-slate-600">Category</span>
                      <select
                        value={newRuleCategory}
                        onChange={(e) => setNewRuleCategory(e.currentTarget.value)}
                        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm capitalize outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                      >
                        <option value="">Select category…</option>
                        {categoryList.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="__custom__">Add custom…</option>
                      </select>
                    </label>
                    {newRuleCategory === "__custom__" ? (
                      <label className="flex-1 space-y-1.5" style={{ minWidth: "180px" }}>
                        <span className="text-xs font-semibold text-slate-600">Custom category</span>
                        <input
                          type="text"
                          value={newRuleCustomCategory}
                          onChange={(e) => setNewRuleCustomCategory(e.currentTarget.value)}
                          placeholder="Type category name"
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                        />
                      </label>
                    ) : null}
                    <div className="flex items-center gap-2 pb-0.5">
                      <button
                        type="button"
                        onClick={handleAddRule}
                        disabled={
                          addRuleStatus === "saving" ||
                          !newRuleVendor.trim() ||
                          !newRuleCategory ||
                          (newRuleCategory === "__custom__" && !newRuleCustomCategory.trim())
                        }
                        className="h-9 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {addRuleStatus === "saving" ? "Saving…" : "Add"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddRule(false); setAddRuleStatus("idle"); }}
                        className="h-9 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  {addRuleStatus === "error" ? (
                    <p className="mt-2 text-xs font-medium text-red-600">Could not save rule. Try again.</p>
                  ) : null}
                </div>
              ) : (
                <div className="px-6 py-3">
                  <button
                    type="button"
                    onClick={() => setShowAddRule(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add vendor rule
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
