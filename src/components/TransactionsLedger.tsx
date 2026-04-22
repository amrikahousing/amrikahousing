"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
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
  confidence: number | null;
  reason: string;
};

type ManualDraft = {
  date: string;
  description: string;
  amount: string;
  isIncome: boolean;
  category: string;
  account: string;
  notes: string;
  reference: string;
};

type ManualSaveStatus = "idle" | "saving" | "saved" | "error";

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
  filters: Filters;
  banks: string[];
  accounts: string[];
  categories: string[];
  years: number[];
};

type Filters = {
  bank: string;
  account: string;
  category: string;
  type: string;
  year: string;
  from: string;
  to: string;
  q: string;
};

const filterInputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";
const drawerInputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyManualDraft(): ManualDraft {
  return {
    date: todayInputValue(),
    description: "",
    amount: "",
    isIncome: false,
    category: "Uncategorized",
    account: "Manual",
    notes: "",
    reference: "",
  };
}

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

function parseDateInputValue(value: string, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function rowMatchesFilters(
  transaction: SerializedAccountingTransaction,
  filters: Filters,
) {
  if (filters.bank && transaction.bank !== filters.bank) return false;
  if (filters.account && transaction.account !== filters.account) return false;
  if (
    filters.category &&
    normalizeText(transaction.category) !== normalizeText(filters.category)
  ) {
    return false;
  }
  if (filters.type === "income" && !transaction.isIncome) return false;
  if (filters.type === "expense" && transaction.isIncome) return false;

  const rowDate = transaction.date ? new Date(transaction.date) : null;
  const selectedYear = Number.parseInt(filters.year, 10);
  if (filters.year !== "all" && Number.isInteger(selectedYear)) {
    if (!rowDate || rowDate.getFullYear() !== selectedYear) return false;
  }

  const fromDate = parseDateInputValue(filters.from);
  if (fromDate && (!rowDate || rowDate < fromDate)) return false;
  const toDate = parseDateInputValue(filters.to, true);
  if (toDate && (!rowDate || rowDate > toDate)) return false;

  const query = normalizeText(filters.q);
  if (query) {
    const haystack = normalizeText(
      [
        transaction.description,
        transaction.category,
        transaction.account,
        transaction.bank,
        transaction.source,
      ].join(" "),
    );
    if (!haystack.includes(query)) return false;
  }

  return true;
}

function formatAuditDate(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function auditSourceLabel(source: SerializedAccountingTransaction["categoryAudit"]["source"]) {
  if (source === "vendor_rule") return "Vendor rule";
  if (source === "manual") return "Manual";
  return "";
}

function transactionAccountLabel(transaction: SerializedAccountingTransaction) {
  const bank = transaction.bank.trim();
  const account = transaction.account.trim();

  if (transaction.source === "manual") {
    if (!account || account.toLowerCase() === "manual") return "Manual entry";
    return account;
  }

  if (!bank) return account;
  if (!account || bank.toLowerCase() === account.toLowerCase()) return bank;
  return `${bank} / ${account}`;
}

function groupLabelForDate(value: string | null) {
  if (!value) return "Pending";
  return formatDate(value);
}

function transactionInitials(description: string) {
  const words = description
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "TX";
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
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
    "Category Updated By",
    "Category Updated At",
    "Category Update Source",
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
    transaction.categoryAudit.updatedBy,
    transaction.categoryAudit.updatedAt,
    auditSourceLabel(transaction.categoryAudit.source),
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

function buildFilterUrl(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return `/accounts/transactions${qs ? `?${qs}` : ""}`;
}

function sortSerializedRows(transactions: SerializedAccountingTransaction[]) {
  return [...transactions].sort(
    (a, b) =>
      (b.date ? new Date(b.date).getTime() : 0) -
      (a.date ? new Date(a.date).getTime() : 0),
  );
}

function mergeVendorRuleList(current: VendorRule[], rule: VendorRule) {
  const existingRuleIndex = current.findIndex((item) => item.id === rule.id);
  const nextRules =
    existingRuleIndex >= 0
      ? current.map((item) => (item.id === rule.id ? { ...item, ...rule } : item))
      : [...current, rule];

  return nextRules.sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));
}

function dateFromQuickToken(token: string) {
  const currentYear = new Date().getFullYear();
  const slashMatch = token.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1], 10);
    const day = Number.parseInt(slashMatch[2], 10);
    const rawYear = slashMatch[3] ? Number.parseInt(slashMatch[3], 10) : currentYear;
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
  return null;
}

function categoryFromQuickInput(input: string, categories: string[]) {
  const normalized = normalizeText(input);
  const aliases: Array<[RegExp, string]> = [
    [/\b(repair|repairs|maintenance|fix|plumb|electric|hvac)\b/, "Repairs and maintenance"],
    [/\b(rent|tenant payment|lease payment)\b/, "Income"],
    [/\b(utilit|water|gas|electric|power|internet)\b/, "Utilities"],
    [/\b(insurance|premium)\b/, "Insurance"],
    [/\b(tax|property tax)\b/, "Property taxes"],
    [/\b(mortgage|loan)\b/, "Mortgage"],
    [/\b(bank fee|fee)\b/, "Bank fees"],
    [/\b(supply|supplies)\b/, "Supplies"],
    [/\b(software|subscription|saas)\b/, "Software"],
    [/\b(marketing|advertis)\b/, "Marketing"],
    [/\b(uber|lyft|taxi|cab|rideshare|parking|fuel|gas station|toll)\b/, "Transportation"],
    [/\b(home depot|lowe'?s|hardware)\b/, "Repairs and maintenance"],
  ];

  for (const [pattern, category] of aliases) {
    if (pattern.test(normalized)) {
      return optionValueForCategory(categories, category);
    }
  }

  const directMatch = categories.find((category) =>
    normalized.includes(category.toLowerCase()),
  );
  return directMatch ?? "Uncategorized";
}

function parseQuickManualTransaction(input: string, categories: string[]): ManualDraft {
  const draft = emptyManualDraft();
  const trimmed = input.trim();
  if (!trimmed) return draft;

  const tokens = trimmed.split(/\s+/);
  const amountIndex = tokens.findIndex((token) =>
    /^[-+]?\$?\d[\d,]*(?:\.\d{1,2})?$/.test(token),
  );
  const dateIndex = tokens.findIndex((token) => dateFromQuickToken(token) !== null);
  const amountToken = amountIndex >= 0 ? tokens[amountIndex] : "";
  const parsedAmount = amountToken.replace(/[$,]/g, "");
  const parsedDate = dateIndex >= 0 ? dateFromQuickToken(tokens[dateIndex]) : null;
  const unitMatch = trimmed.match(/\bunit\s+([a-z0-9-]+)/i);
  const isIncome = /\b(income|rent|paid|payment|deposit|received)\b/i.test(trimmed);
  const descriptionTokens = tokens.filter((_, index) => index !== amountIndex && index !== dateIndex);
  let description = descriptionTokens.join(" ");

  if (unitMatch?.[0]) {
    description = description.replace(new RegExp(`\\bfor\\s+${unitMatch[0]}\\b`, "i"), "");
    description = description.replace(new RegExp(`\\b${unitMatch[0]}\\b`, "i"), "");
  }

  const category = categoryFromQuickInput(trimmed, categories);
  if (category !== "Uncategorized") {
    description = description.replace(new RegExp(`\\b${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "");
  }
  description = description
    .replace(/\b(for|expense|income|paid|payment|received)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    ...draft,
    date: parsedDate ?? draft.date,
    description: description || trimmed,
    amount: parsedAmount,
    isIncome,
    category,
    account: unitMatch ? `Unit ${unitMatch[1]}` : draft.account,
  };
}

export function TransactionsLedger({
  transactions,
  allTransactionCount,
  categoryOptions,
  filters,
  banks,
  accounts,
  categories,
  years,
}: TransactionsLedgerProps) {
  const router = useRouter();
  const [rows, setRows] = useState(transactions);
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});
  const [customCategoryRows, setCustomCategoryRows] = useState<Record<string, boolean>>({});
  const [suggestions, setSuggestions] = useState<Record<string, CategorySuggestion>>({});
  const [rememberRules, setRememberRules] = useState<Record<string, boolean>>({});
  const [suggestedCategories, setSuggestedCategories] = useState<Record<string, string>>({});
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
  const [ruleDeleteStatus, setRuleDeleteStatus] = useState<Record<string, "deleting" | "error">>({});
  const [pendingRuleApply, setPendingRuleApply] = useState<{
    ruleId: string;
    category: string;
    count: number;
    examples: Array<{ id: string; description: string }>;
  } | null>(null);
  const [ruleApplyStatus, setRuleApplyStatus] = useState<"idle" | "saving" | "error">("idle");
  const [ruleApplyMessage, setRuleApplyMessage] = useState("");
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleVendor, setNewRuleVendor] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("");
  const [newRuleCustomCategory, setNewRuleCustomCategory] = useState("");
  const [addRuleStatus, setAddRuleStatus] = useState<"idle" | "saving" | "error">("idle");
  const [acceptAllStatus, setAcceptAllStatus] = useState<"idle" | "saving">("idle");
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false);
  const [manualMode, setManualMode] = useState<"quick" | "details">("quick");
  const [quickManualInput, setQuickManualInput] = useState("");
  const [manualDraft, setManualDraft] = useState<ManualDraft>(() => emptyManualDraft());
  const [manualSaveStatus, setManualSaveStatus] = useState<ManualSaveStatus>("idle");
  const [manualSaveMessage, setManualSaveMessage] = useState("");
  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const [lastAddedManual, setLastAddedManual] = useState<SerializedAccountingTransaction | null>(null);
  const [failedLogoUrls, setFailedLogoUrls] = useState<Record<string, boolean>>({});
  const manualSaveInFlight = useRef(false);

  useEffect(() => {
    setRows(transactions);
    setStatuses({});
    setCustomCategoryRows({});
  }, [transactions]);

  const dropdownFilterCount =
    (filters.bank ? 1 : 0) +
    (filters.account ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.year ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const categoryList = useMemo(
    () => mergeAccountingCategoryOptions([...categoryOptions, ...rows.map((row) => row.category)]),
    [categoryOptions, rows],
  );
  const quickManualPreview = useMemo(
    () => parseQuickManualTransaction(quickManualInput, categoryList),
    [categoryList, quickManualInput],
  );
  const recentManualTransactions = useMemo(
    () => rows.filter((row) => row.source === "manual").slice(0, 6),
    [rows],
  );
  const activeFilterChips: Array<{ key: keyof Filters; label: string }> = [
    filters.q.trim() ? { key: "q", label: `Search: ${filters.q.trim()}` } : null,
    filters.bank ? { key: "bank", label: `Bank: ${filters.bank}` } : null,
    filters.account ? { key: "account", label: `Account: ${filters.account}` } : null,
    filters.category ? { key: "category", label: `Category: ${filters.category}` } : null,
    filters.type ? { key: "type", label: `Type: ${filters.type}` } : null,
    filters.year && filters.year !== "all"
      ? { key: "year", label: `Year: ${filters.year}` }
      : null,
    filters.year === "all" ? { key: "year", label: "All years" } : null,
    filters.from ? { key: "from", label: `From: ${filters.from}` } : null,
    filters.to ? { key: "to", label: `To: ${filters.to}` } : null,
  ].filter(Boolean) as Array<{ key: keyof Filters; label: string }>;
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const groupedRows = useMemo(() => {
    const groups: Array<{ label: string; rows: SerializedAccountingTransaction[] }> = [];
    const groupsByLabel = new Map<string, SerializedAccountingTransaction[]>();

    for (const row of rows) {
      const label = groupLabelForDate(row.date);
      const existingRows = groupsByLabel.get(label);
      if (existingRows) {
        existingRows.push(row);
        continue;
      }

      const nextRows = [row];
      groupsByLabel.set(label, nextRows);
      groups.push({ label, rows: nextRows });
    }

    return groups;
  }, [rows]);

  async function refreshVendorRules() {
    setVendorMapStatus("loading");

    try {
      const response = await fetch("/api/accounting/vendor-category-rules");
      const result = (await response.json()) as {
        rules?: VendorRule[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Unable to load vendor rules");

      setVendorRules(result.rules ?? []);
      setVendorMapStatus("idle");
    } catch {
      setVendorMapStatus("error");
    }
  }

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

      const result = (await response.json()) as {
        category: string | null;
        categoryAudit?: SerializedAccountingTransaction["categoryAudit"];
      };
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === transaction.id
            ? {
                ...row,
                category: result.category ?? transaction.category,
                categoryAudit: result.categoryAudit ?? row.categoryAudit,
              }
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

  async function handleOpenVendorMap() {
    setShowVendorMap(true);
    setAiStatus("idle");
    setAiMessage("");
    setSuggestions({});
    setSuggestedCategories({});
    setPastApplyPrompt(null);
    setPastApplyStatus("idle");

    if (vendorMapStatus !== "loading") {
      void refreshVendorRules();
    }
  }

  async function handleAiCategorize() {
    const eligibleRows = rows.filter(
      (transaction) => transaction.source === "plaid" && !transaction.isIncome,
    );
    if (eligibleRows.length === 0) {
      setAiStatus("success");
      setAiMessage("No Plaid expense transactions are available for AI review.");
      return;
    }

    setAiStatus("loading");
    setSuggestions({});

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
        reviewedCount?: number;
        skippedManualCount?: number;
        skippedRuleCount?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Unable to generate suggestions");

      const nextSuggestions: Record<string, CategorySuggestion> = {};
      const nextSuggestedCategories: Record<string, string> = {};
      for (const suggestion of result.suggestions ?? []) {
        nextSuggestions[suggestion.transactionId] = suggestion;
        nextSuggestedCategories[suggestion.transactionId] = suggestion.category;
      }

      setSuggestions(nextSuggestions);
      setSuggestedCategories(nextSuggestedCategories);
      const suggestionCount = Object.keys(nextSuggestions).length;
      if (suggestionCount > 0) {
        const parts = [`${suggestionCount} vendor suggestion${suggestionCount === 1 ? "" : "s"} ready.`];
        if ((result.skippedManualCount ?? 0) > 0) {
          parts.push(`${result.skippedManualCount!.toLocaleString()} manually categorized ignored.`);
        }
        if ((result.skippedRuleCount ?? 0) > 0) {
          parts.push(`${result.skippedRuleCount!.toLocaleString()} existing mapping${result.skippedRuleCount === 1 ? "" : "s"} skipped.`);
        }
        setAiMessage(parts.join(" "));
      } else if ((result.skippedManualCount ?? 0) > 0 || (result.skippedRuleCount ?? 0) > 0) {
        setAiMessage(
          [
            "No new vendors to review.",
            (result.skippedManualCount ?? 0) > 0
              ? `${result.skippedManualCount!.toLocaleString()} manually categorized ignored.`
              : "",
            (result.skippedRuleCount ?? 0) > 0
              ? `${result.skippedRuleCount!.toLocaleString()} existing mapping${result.skippedRuleCount === 1 ? "" : "s"} skipped.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      } else {
        setAiMessage("No new vendors need AI categorization.");
      }
      setRememberRules((current) => {
        const next = { ...current };
        for (const suggestion of Object.values(nextSuggestions)) {
          next[suggestion.transactionId] = current[suggestion.transactionId] ?? true;
        }
        return next;
      });
      setPastApplyPrompt(null);
      setPastApplyStatus("idle");
      setAiStatus("success");
    } catch (error) {
      setAiStatus("error");
      setAiMessage(
        error instanceof Error ? error.message : "Could not generate suggestions.",
      );
    }
  }

  async function handleApplySuggestion(
    transaction: SerializedAccountingTransaction,
    suggestion: CategorySuggestion,
    opts?: { skipPastApply?: boolean },
  ) {
    const selectedCategory =
      suggestedCategories[transaction.id]?.trim() || suggestion.category;
    const suggestionToApply = { ...suggestion, category: selectedCategory };
    const shouldRememberRule = rememberRules[transaction.id] ?? true;

    if (!shouldRememberRule) {
      const saved = await saveCategory(transaction, suggestionToApply.category);
      if (!saved) return;

      setSuggestions((current) => {
        const next = { ...current };
        delete next[transaction.id];
        return next;
      });
      setSuggestedCategories((current) => {
        const next = { ...current };
        delete next[transaction.id];
        return next;
      });
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === transaction.id
          ? {
              ...row,
              category: suggestionToApply.category,
              categoryAudit: {
                ...row.categoryAudit,
                source: "vendor_rule",
              },
            }
          : row,
      ),
    );
    setStatuses((current) => ({ ...current, [transaction.id]: "saving" }));

    try {
      const ruleResponse = await fetch("/api/accounting/vendor-category-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: transaction.description,
          category: suggestionToApply.category,
          bank: transaction.bank,
          account: transaction.account,
          confidence: suggestionToApply.confidence,
          reason: suggestionToApply.reason,
        }),
      });

      const ruleResult = (await ruleResponse.json()) as {
        rule?: VendorRule;
      };

      if (!ruleResponse.ok || !ruleResult.rule) throw new Error("Unable to save vendor rule");
      setVendorRules((current) => mergeVendorRuleList(current, ruleResult.rule!));
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === transaction.id
            ? {
                ...row,
                category: ruleResult.rule!.category,
                categoryAudit: {
                  source: "vendor_rule",
                  updatedAt: ruleResult.rule!.updated_at,
                  updatedBy: null,
                },
              }
            : row,
        ),
      );
      setStatuses((current) => ({ ...current, [transaction.id]: "saved" }));
      window.setTimeout(() => {
        setStatuses((current) => ({ ...current, [transaction.id]: "idle" }));
      }, 1600);
      setSuggestions((current) => {
        const next = { ...current };
        delete next[transaction.id];
        return next;
      });
      setSuggestedCategories((current) => {
        const next = { ...current };
        delete next[transaction.id];
        return next;
      });
      if (opts?.skipPastApply) return;

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
        setPastApplyStatus("idle");
      }
    } catch {
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.id === transaction.id
            ? {
                ...row,
                category: transaction.category,
                categoryAudit: transaction.categoryAudit,
              }
            : row,
        ),
      );
      setStatuses((current) => ({ ...current, [transaction.id]: "error" }));
    }
  }

  async function handleAcceptAll() {
    setAcceptAllStatus("saving");
    try {
      for (const suggestion of Object.values(suggestions)) {
        const transaction = rowsById.get(suggestion.transactionId);
        if (!transaction) continue;
        await handleApplySuggestion(transaction, suggestion, { skipPastApply: true });
      }
      await refreshVendorRules();
      setAiMessage("All suggestions accepted. Rules saved below.");
    } finally {
      setAcceptAllStatus("idle");
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
        categoryAudit?: SerializedAccountingTransaction["categoryAudit"];
      };

      if (!response.ok) throw new Error("Unable to apply past transactions");

      const changedIds = new Set(result.transactionIds ?? []);
      setRows((currentRows) =>
        currentRows.map((row) =>
          changedIds.has(row.id) && result.category
            ? {
                ...row,
                category: result.category,
                categoryAudit: result.categoryAudit ?? row.categoryAudit,
              }
            : row,
        ),
      );
      setPastApplyStatus("saved");
      setPastApplyPrompt(null);
    } catch {
      setPastApplyStatus("error");
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

      setVendorRules((current) => mergeVendorRuleList(current, result.rule!));
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
        setRuleApplyMessage("");
      }
    } catch {
      setRuleUpdateStatus((s) => ({ ...s, [rule.id]: "error" }));
    }
  }

  async function handleDeleteRule(rule: VendorRule) {
    const confirmed = window.confirm(
      `Delete the mapping for ${rule.vendor_name || rule.vendor_key}?`,
    );
    if (!confirmed) return;

    setRuleDeleteStatus((current) => ({ ...current, [rule.id]: "deleting" }));
    try {
      const res = await fetch("/api/accounting/vendor-category-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId: rule.id }),
      });
      const result = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(result?.error ?? "Failed to delete rule");

      setVendorRules((current) => current.filter((item) => item.id !== rule.id));
      setRuleDeleteStatus((current) => {
        const next = { ...current };
        delete next[rule.id];
        return next;
      });
      if (editingRuleId === rule.id) {
        setEditingRuleId(null);
      }
    } catch {
      setRuleDeleteStatus((current) => ({ ...current, [rule.id]: "error" }));
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
      const result = (await res.json()) as {
        transactionIds?: string[];
        category?: string;
        categoryAudit?: SerializedAccountingTransaction["categoryAudit"];
        error?: string;
      };
      if (!res.ok) throw new Error(result.error ?? "Could not apply. Try again.");

      const changedIds = new Set(result.transactionIds ?? []);
      setRows((current) =>
        current.map((row) =>
          changedIds.has(row.id) && result.category
            ? {
                ...row,
                category: result.category,
                categoryAudit: result.categoryAudit ?? row.categoryAudit,
              }
            : row,
        ),
      );
      setPendingRuleApply(null);
      setRuleApplyStatus("idle");
      setRuleApplyMessage("");
    } catch (error) {
      setRuleApplyStatus("error");
      setRuleApplyMessage(error instanceof Error ? error.message : "Could not apply. Try again.");
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

      setVendorRules((current) => mergeVendorRuleList(current, result.rule!));
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
        setRuleApplyMessage("");
      }
    } catch {
      setAddRuleStatus("error");
    }
  }

  function openManualDrawer(
    mode: "quick" | "details" = "quick",
    draft?: ManualDraft,
    editingId?: string | null,
  ) {
    setManualMode(mode);
    setManualDraft(draft ?? emptyManualDraft());
    setEditingManualId(editingId ?? null);
    setManualSaveStatus("idle");
    setManualSaveMessage("");
    setManualDrawerOpen(true);
  }

  function draftFromTransaction(
    transaction: SerializedAccountingTransaction,
    opts?: { today?: boolean },
  ): ManualDraft {
    return {
      date: opts?.today ? todayInputValue() : transaction.date?.slice(0, 10) ?? todayInputValue(),
      description: transaction.description,
      amount: String(transaction.amount),
      isIncome: transaction.isIncome,
      category: transaction.category,
      account: transaction.account || "Manual",
      notes: "",
      reference: "",
    };
  }

  async function saveManualTransaction(draft: ManualDraft) {
    if (manualSaveInFlight.current) return;

    const payload = {
      date: draft.date,
      description: draft.description,
      amount: draft.amount,
      isIncome: draft.isIncome,
      category: draft.category,
      account: draft.account,
      notes: draft.notes,
      reference: draft.reference,
    };
    const isEditing = Boolean(editingManualId);

    setManualSaveStatus("saving");
    setManualSaveMessage("");
    manualSaveInFlight.current = true;

    try {
      const response = await fetch("/api/accounting/manual-transactions", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEditing ? { transactionId: editingManualId, ...payload } : payload,
        ),
      });
      const result = (await response.json()) as {
        transaction?: SerializedAccountingTransaction;
        error?: string;
      };
      if (!response.ok || !result.transaction) {
        throw new Error(result.error ?? "Could not save transaction.");
      }

      setRows((current) => {
        const withoutExisting = current.filter((row) => row.id !== result.transaction!.id);
        if (!rowMatchesFilters(result.transaction!, filters)) return withoutExisting;
        return sortSerializedRows([result.transaction!, ...withoutExisting]);
      });
      setLastAddedManual(result.transaction);
      setManualSaveStatus("saved");
      setManualSaveMessage(isEditing ? "Updated." : "Added.");
      setManualDrawerOpen(false);
      setQuickManualInput("");
      setManualDraft(emptyManualDraft());
      setEditingManualId(null);
      router.refresh();
    } catch (error) {
      setManualSaveStatus("error");
      setManualSaveMessage(
        error instanceof Error ? error.message : "Could not save transaction.",
      );
    } finally {
      manualSaveInFlight.current = false;
    }
  }

  async function handleSaveQuickManual() {
    await saveManualTransaction(quickManualPreview);
  }

  async function handleUndoManual(transaction: SerializedAccountingTransaction) {
    setManualSaveStatus("saving");
    try {
      const response = await fetch("/api/accounting/manual-transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: transaction.id, deleted: true }),
      });
      if (!response.ok) throw new Error("Could not remove transaction.");
      setRows((current) => current.filter((row) => row.id !== transaction.id));
      setLastAddedManual(null);
      setManualSaveStatus("idle");
      router.refresh();
    } catch {
      setManualSaveStatus("error");
      setManualSaveMessage("Could not undo. Try again.");
    }
  }

  async function handleDeleteManualRow(transaction: SerializedAccountingTransaction) {
    const confirmed = window.confirm(`Delete ${transaction.description}?`);
    if (!confirmed) return;

    setStatuses((current) => ({ ...current, [transaction.id]: "saving" }));
    try {
      const response = await fetch("/api/accounting/manual-transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: transaction.id, deleted: true }),
      });
      if (!response.ok) throw new Error("Could not delete transaction.");
      setRows((current) => current.filter((row) => row.id !== transaction.id));
      if (lastAddedManual?.id === transaction.id) {
        setLastAddedManual(null);
      }
      router.refresh();
    } catch {
      setStatuses((current) => ({ ...current, [transaction.id]: "error" }));
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

  const activeManualDraft = manualMode === "quick" ? quickManualPreview : manualDraft;
  const canSaveManual =
    activeManualDraft.description.trim().length > 0 &&
    Number.parseFloat(activeManualDraft.amount.replace(/[$,\s]/g, "")) > 0 &&
    activeManualDraft.date.length > 0;

  return (
    <>
    <section className="space-y-5">
      <div>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">
            Activity
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {rows.length.toLocaleString()} of {allTransactionCount.toLocaleString()} records
          </p>
        </div>
      </div>

      <form action="/accounts/transactions" className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search transactions</span>
            <svg className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Search"
              className="h-14 w-full rounded-lg border border-slate-200 bg-white pl-14 pr-4 text-lg text-slate-950 shadow-sm outline-none placeholder:text-slate-500 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            title="Filters"
            className={
              filtersOpen || dropdownFilterCount > 0
                ? "relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm hover:bg-slate-800"
                : "relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
            }
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16" />
              <path d="M7 12h10" />
              <path d="M10 17h4" />
            </svg>
            {dropdownFilterCount > 0 ? (
              <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[11px] font-bold text-white">
                {dropdownFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {!filtersOpen ? (
          <>
            {filters.bank ? <input type="hidden" name="bank" value={filters.bank} /> : null}
            {filters.account ? <input type="hidden" name="account" value={filters.account} /> : null}
            {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
            {filters.type ? <input type="hidden" name="type" value={filters.type} /> : null}
            {filters.year ? <input type="hidden" name="year" value={filters.year} /> : null}
            {filters.from ? <input type="hidden" name="from" value={filters.from} /> : null}
            {filters.to ? <input type="hidden" name="to" value={filters.to} /> : null}
          </>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Bank</span>
                <select name="bank" defaultValue={filters.bank} className={filterInputClass}>
                  <option value="">All banks</option>
                  {banks.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Account</span>
                <select name="account" defaultValue={filters.account} className={filterInputClass}>
                  <option value="">All accounts</option>
                  {accounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Category</span>
                <select
                  name="category"
                  defaultValue={filters.category}
                  className={`${filterInputClass} capitalize`}
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Type</span>
                <select name="type" defaultValue={filters.type} className={filterInputClass}>
                  <option value="">Income and expenses</option>
                  <option value="income">Income only</option>
                  <option value="expense">Expenses only</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">Year</span>
                <select name="year" defaultValue={filters.year} className={filterInputClass}>
                  <option value="all">All years</option>
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">From</span>
                <input
                  name="from"
                  type="date"
                  defaultValue={filters.from}
                  className={filterInputClass}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-700">To</span>
                <input
                  name="to"
                  type="date"
                  defaultValue={filters.to}
                  className={filterInputClass}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="h-10 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Apply filters
              </button>
              <Link
                href="/accounts/transactions"
                className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Reset
              </Link>
            </div>
          </div>
        )}

        {activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilterChips.map(({ key, label }) => (
              <Link
                key={key}
                href={buildFilterUrl({ ...filters, [key]: "" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                {label}
                <span aria-hidden>×</span>
              </Link>
            ))}
          </div>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => openManualDrawer("quick")}
          title="Add manual transaction"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Add transaction
        </button>
        <button
          type="button"
          onClick={handleOpenVendorMap}
          title="Vendor-category mappings"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          </svg>
          Vendor mappings
        </button>
        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={rows.length === 0}
          title="Export CSV"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="M7 8l5-5 5 5" />
            <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
          </svg>
        </button>
      </div>

      {lastAddedManual ? (
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">
            {manualSaveMessage || "Added."} {lastAddedManual.description} · {formatCurrency(lastAddedManual.amount)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openManualDrawer("details", draftFromTransaction(lastAddedManual, { today: true }))}
              className="h-8 rounded-lg bg-white px-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => openManualDrawer("details", draftFromTransaction(lastAddedManual), lastAddedManual.id)}
              className="h-8 rounded-lg bg-white px-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => handleUndoManual(lastAddedManual)}
              disabled={manualSaveStatus === "saving"}
              className="h-8 rounded-lg px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              Undo
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            No transactions match these filters.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Try clearing a filter, syncing another Plaid account, or adding a manual transaction.
          </p>
        </div>
      ) : (
        <div className="max-h-[72vh] space-y-6 overflow-y-auto bg-slate-50/60 p-4 sm:p-5">
          {groupedRows.map((group) => (
            <div key={group.label} className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-500">
                {group.label}
              </h3>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                {group.rows.map((transaction, index) => {
                  const status = statuses[transaction.id] ?? "idle";
                  const isCustomCategory = customCategoryRows[transaction.id] ?? false;
                  const accountLabel = transactionAccountLabel(transaction);
                  const logoUrl =
                    transaction.merchantLogoUrl && !failedLogoUrls[transaction.merchantLogoUrl]
                      ? transaction.merchantLogoUrl
                      : null;

                  return (
                    <div
                      key={transaction.id}
                      className={
                        index === 0
                          ? "grid gap-4 px-4 py-4 text-sm transition-colors hover:bg-slate-50 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.85fr)_minmax(118px,auto)] lg:items-center"
                          : "grid gap-4 border-t border-slate-100 px-4 py-4 text-sm transition-colors hover:bg-slate-50 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.85fr)_minmax(118px,auto)] lg:items-center"
                      }
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-xs font-bold text-slate-700 shadow-sm">
                          <span>{transactionInitials(transaction.description)}</span>
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={logoUrl}
                              alt={`${transaction.merchantName ?? transaction.description} logo`}
                              className="absolute inset-0 h-full w-full bg-white object-contain p-1"
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                                setFailedLogoUrls((current) => ({
                                  ...current,
                                  [logoUrl]: true,
                                }));
                              }}
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-slate-950" title={transaction.description}>
                            {transaction.description}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-medium text-slate-500" title={accountLabel}>
                            {accountLabel || "Account unavailable"}
                          </p>
                          <span className="mt-1 inline-flex rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                            {transaction.source}
                          </span>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="w-full min-w-0 space-y-2">
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
                              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold capitalize text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
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
                            <div className="min-h-9 text-xs text-slate-500">
                              {transaction.categoryAudit.updatedAt ? (
                                <div className="space-y-0.5">
                                  <p className="truncate font-medium text-slate-700">
                                    {transaction.categoryAudit.updatedBy ?? "Unknown user"}
                                  </p>
                                  <p className="truncate">
                                    {formatAuditDate(transaction.categoryAudit.updatedAt)}
                                    {transaction.categoryAudit.source ? (
                                      <> · {auditSourceLabel(transaction.categoryAudit.source)}</>
                                    ) : null}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-slate-400">No category edits</span>
                              )}
                            </div>
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
                      </div>

                      <div className="flex items-center justify-between gap-3 lg:justify-end">
                        <span className="text-xs font-medium text-slate-400 lg:hidden">
                          Amount
                        </span>
                        <div className="flex items-center gap-3">
                          <span
                            className={
                              transaction.isIncome
                                ? "whitespace-nowrap text-lg font-semibold text-emerald-600"
                                : "whitespace-nowrap text-lg font-semibold text-red-600"
                            }
                          >
                            {transaction.isIncome ? "+" : "-"}
                            {formatCurrency(transaction.amount)}
                          </span>
                          {transaction.source === "manual" ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteManualRow(transaction)}
                              title="Delete manual transaction"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v5" />
                                <path d="M14 11v5" />
                              </svg>
                            </button>
                          ) : null}
                          <svg className="hidden h-5 w-5 shrink-0 text-slate-300 sm:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>

      {manualDrawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35" onClick={() => setManualDrawerOpen(false)}>
          <aside
            className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
            aria-label="Manual transaction drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  {editingManualId ? "Edit transaction" : "Add transaction"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Manual records stay separate from Plaid sync.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualDrawerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Close"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="border-b border-slate-200 px-5 py-3">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setManualMode("quick")}
                  className={
                    manualMode === "quick"
                      ? "h-8 rounded-md bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm"
                      : "h-8 rounded-md px-3 text-sm font-semibold text-slate-500 hover:text-slate-800"
                  }
                >
                  Quick add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (manualMode === "quick" && quickManualInput.trim()) {
                      setManualDraft(quickManualPreview);
                    }
                    setManualMode("details");
                  }}
                  className={
                    manualMode === "details"
                      ? "h-8 rounded-md bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm"
                      : "h-8 rounded-md px-3 text-sm font-semibold text-slate-500 hover:text-slate-800"
                  }
                >
                  Details
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {manualMode === "quick" ? (
                <div className="space-y-5">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Quick add</span>
                    <input
                      value={quickManualInput}
                      onChange={(event) => setQuickManualInput(event.currentTarget.value)}
                      placeholder="Home Depot 4/18 248.90 repairs for Unit 2B"
                      className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                    />
                  </label>

                  {recentManualTransactions.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Recent manual
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {recentManualTransactions.map((transaction) => (
                          <button
                            key={transaction.id}
                            type="button"
                            onClick={() => {
                              setManualDraft(draftFromTransaction(transaction, { today: true }));
                              setManualMode("details");
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {transaction.description}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Preview
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Date</p>
                        <p className="font-semibold text-slate-950">{quickManualPreview.date}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Type</p>
                        <p className="font-semibold text-slate-950">
                          {quickManualPreview.isIncome ? "Income" : "Expense"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Amount</p>
                        <p className="font-semibold text-slate-950">
                          {quickManualPreview.amount || "$0.00"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Category</p>
                        <p className="font-semibold text-slate-950">{quickManualPreview.category}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-slate-500">Description</p>
                        <p className="font-semibold text-slate-950">
                          {quickManualPreview.description || "Waiting for details"}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-slate-500">Account</p>
                        <p className="font-semibold text-slate-950">{quickManualPreview.account}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Date</span>
                    <input
                      type="date"
                      value={manualDraft.date}
                      onChange={(event) =>
                        setManualDraft((draft) => ({ ...draft, date: event.currentTarget.value }))
                      }
                      className={drawerInputClass}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Amount</span>
                    <input
                      value={manualDraft.amount}
                      onChange={(event) =>
                        setManualDraft((draft) => ({ ...draft, amount: event.currentTarget.value }))
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      className={drawerInputClass}
                    />
                  </label>
                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">Description</span>
                    <input
                      value={manualDraft.description}
                      onChange={(event) =>
                        setManualDraft((draft) => ({ ...draft, description: event.currentTarget.value }))
                      }
                      placeholder="Vendor or memo"
                      className={drawerInputClass}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Type</span>
                    <select
                      value={manualDraft.isIncome ? "income" : "expense"}
                      onChange={(event) =>
                        setManualDraft((draft) => ({
                          ...draft,
                          isIncome: event.currentTarget.value === "income",
                        }))
                      }
                      className={drawerInputClass}
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Category</span>
                    <select
                      value={optionValueForCategory(categoryList, manualDraft.category)}
                      onChange={(event) =>
                        setManualDraft((draft) => ({ ...draft, category: event.currentTarget.value }))
                      }
                      className={`${drawerInputClass} capitalize`}
                    >
                      {categoryList.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">Account or unit</span>
                    <input
                      value={manualDraft.account}
                      onChange={(event) =>
                        setManualDraft((draft) => ({ ...draft, account: event.currentTarget.value }))
                      }
                      placeholder="Manual, Unit 2B, Operating account"
                      className={drawerInputClass}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Reference</span>
                    <input
                      value={manualDraft.reference}
                      onChange={(event) =>
                        setManualDraft((draft) => ({ ...draft, reference: event.currentTarget.value }))
                      }
                      placeholder="Check, invoice, memo"
                      className={drawerInputClass}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Notes</span>
                    <input
                      value={manualDraft.notes}
                      onChange={(event) =>
                        setManualDraft((draft) => ({ ...draft, notes: event.currentTarget.value }))
                      }
                      placeholder="Optional"
                      className={drawerInputClass}
                    />
                  </label>
                </div>
              )}

              {manualSaveStatus === "error" && manualSaveMessage ? (
                <p className="mt-4 text-sm font-semibold text-red-600">{manualSaveMessage}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => setManualDrawerOpen(false)}
                className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                {manualMode === "quick" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setManualDraft(quickManualPreview);
                      setManualMode("details");
                    }}
                    className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Edit details
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    manualMode === "quick"
                      ? handleSaveQuickManual()
                      : saveManualTransaction(manualDraft)
                  }
                  disabled={!canSaveManual || manualSaveStatus === "saving"}
                  className="h-10 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {manualSaveStatus === "saving"
                    ? "Saving..."
                    : editingManualId
                      ? "Save changes"
                      : "Add transaction"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {showVendorMap ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowVendorMap(false)}>
          <div
            className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Vendor-category mappings</h2>
                <p className="mt-0.5 text-xs text-slate-500">Saved rules for matching future transactions</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAiCategorize}
                  disabled={aiStatus === "loading" || rows.length === 0}
                  className="inline-flex h-8 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {aiStatus === "loading" ? "Reviewing..." : "Run AI categorize"}
                </button>
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
            </div>

            {/* AI suggestions section */}
            {(aiStatus === "loading" || aiStatus === "error" || Object.keys(suggestions).length > 0 || (aiStatus === "success" && aiMessage)) ? (
              <div className="border-b border-slate-200">
                {aiStatus === "loading" ? (
                  <div className="flex items-center gap-2 px-6 py-4 text-sm text-slate-500">
                    <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    Looking at uncategorized vendors…
                  </div>
                ) : aiStatus === "error" ? (
                  <p className="px-6 py-4 text-sm font-medium text-red-600">{aiMessage || "Could not generate suggestions."}</p>
                ) : (
                  <>
                    {/* Past-apply prompt */}
                    {pastApplyPrompt ? (
                      <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-4">
                        <p className="text-sm font-semibold text-emerald-950">
                          Remembered {pastApplyPrompt.vendorName} as {pastApplyPrompt.category}.
                        </p>
                        <p className="mt-1 text-sm text-emerald-800">
                          Apply this to {pastApplyPrompt.count.toLocaleString()} other matching transaction{pastApplyPrompt.count === 1 ? "" : "s"}?
                        </p>
                        {pastApplyPrompt.examples.length > 0 ? (
                          <p className="mt-1.5 text-xs text-emerald-700">
                            e.g. {pastApplyPrompt.examples.map((item) => item.description).join(", ")}
                          </p>
                        ) : null}
                        {pastApplyStatus === "error" ? (
                          <p className="mt-1.5 text-xs font-semibold text-red-600">Could not apply. Try again.</p>
                        ) : null}
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={handleApplyPastTransactions}
                            disabled={pastApplyStatus === "saving"}
                            className="h-8 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {pastApplyStatus === "saving" ? "Applying…" : "Apply to all"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setPastApplyPrompt(null); setPastApplyStatus("idle"); }}
                            className="h-8 rounded-lg px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* Accept-all bar */}
                    {Object.keys(suggestions).length > 1 ? (
                      <div className="flex items-center justify-between bg-slate-50 px-6 py-3">
                        <p className="text-xs text-slate-500">
                          {Object.keys(suggestions).length} vendor{Object.keys(suggestions).length === 1 ? "" : "s"} need categorizing
                        </p>
                        <button
                          type="button"
                          onClick={handleAcceptAll}
                          disabled={acceptAllStatus === "saving"}
                          className="h-8 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {acceptAllStatus === "saving" ? "Applying all…" : `Accept all (${Object.keys(suggestions).length})`}
                        </button>
                      </div>
                    ) : null}

                    {/* Suggestion cards */}
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {Object.keys(suggestions).length === 0 ? (
                        <p className="px-6 py-4 text-sm text-slate-500">{aiMessage || "All suggestions accepted. Rules saved below."}</p>
                      ) : (
                        Object.values(suggestions).map((suggestion) => {
                          const transaction = rowsById.get(suggestion.transactionId);
                          if (!transaction) return null;
                          const selectedCategory =
                            suggestedCategories[suggestion.transactionId] ?? suggestion.category;
                          return (
                            <div key={suggestion.transactionId} className="px-6 py-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-950">{transaction.description}</p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {[transaction.bank, transaction.account].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold text-red-600">−{formatCurrency(transaction.amount)}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 line-through">{transaction.category}</span>
                                <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{selectedCategory}</span>
                                <span className="text-xs text-slate-400">
                                  {suggestion.confidence !== null ? `${Math.round(suggestion.confidence * 100)}%` : "Review"}
                                </span>
                              </div>
                              {suggestion.reason ? (
                                <p className="mt-1 text-xs text-slate-500">{suggestion.reason}</p>
                              ) : null}
                              <div className="mt-2">
                                <select
                                  value={selectedCategory}
                                  onChange={(event) =>
                                    setSuggestedCategories((current) => ({
                                      ...current,
                                      [suggestion.transactionId]: event.currentTarget.value,
                                    }))
                                  }
                                  className="h-8 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-2 text-sm capitalize text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                                >
                                  {categoryList.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={rememberRules[suggestion.transactionId] ?? true}
                                  onChange={(event) =>
                                    setRememberRules((current) => ({
                                      ...current,
                                      [suggestion.transactionId]: event.currentTarget.checked,
                                    }))
                                  }
                                  className="h-3.5 w-3.5 rounded border-slate-300"
                                />
                                Remember this vendor
                              </label>
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApplySuggestion(transaction, suggestion)}
                                  className="h-7 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                                >
                                  Apply
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    {
                                      setSuggestions((current) => {
                                        const next = { ...current };
                                        delete next[suggestion.transactionId];
                                        return next;
                                      });
                                      setSuggestedCategories((current) => {
                                        const next = { ...current };
                                        delete next[suggestion.transactionId];
                                        return next;
                                      });
                                    }
                                  }
                                  className="h-7 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {pendingRuleApply ? (
              <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-4">
                <p className="text-sm font-semibold text-emerald-950">
                  Apply &quot;{pendingRuleApply.category}&quot; to {pendingRuleApply.count.toLocaleString()} matching transaction{pendingRuleApply.count === 1 ? "" : "s"}?
                </p>
                {pendingRuleApply.examples.length > 0 ? (
                  <p className="mt-1 text-xs text-emerald-700">
                    e.g. {pendingRuleApply.examples.map((e) => e.description).join(", ")}
                  </p>
                ) : null}
                {ruleApplyStatus === "error" ? (
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    {ruleApplyMessage || "Could not apply. Try again."}
                  </p>
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
                <p className="px-6 py-8 text-center text-sm text-slate-500">No saved vendor rules yet. Accept AI suggestions above to build your ruleset.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Vendor</th>
                      <th className="px-6 py-3 font-semibold">Category</th>
                      <th className="px-6 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vendorRules.map((rule) => {
                      const isEditing = editingRuleId === rule.id;
                      const updateStatus = ruleUpdateStatus[rule.id];
                      const deleteStatus = ruleDeleteStatus[rule.id];
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
                              <span className="capitalize text-slate-700">{rule.category}</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
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
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                title="Delete mapping"
                                onClick={() => handleDeleteRule(rule)}
                                disabled={deleteStatus === "deleting"}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                  <path d="M10 11v6" />
                                  <path d="M14 11v6" />
                                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                </svg>
                              </button>
                            </div>
                            {deleteStatus === "error" ? (
                              <span className="ml-2 text-xs font-medium text-red-600">Error</span>
                            ) : null}
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
