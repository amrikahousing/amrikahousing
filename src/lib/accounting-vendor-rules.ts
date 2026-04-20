import type { AccountingTransaction } from "@/lib/accounting";

export type AccountingVendorRule = {
  id: string;
  vendor_key: string;
  vendor_name: string;
  category: string;
  bank: string;
  account: string;
  confidence: number | null;
  reason: string | null;
};

const NOISY_PREFIXES = [
  "pending",
  "debit card purchase",
  "card purchase",
  "purchase authorized on",
  "purchase auth",
  "pos purchase",
  "point of sale",
  "recurring payment",
  "online payment",
  "ach withdrawal",
  "ach debit",
  "checkcard",
  "visa direct",
  "paypal",
  "sq",
  "tst",
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVendorKey(description: string) {
  let normalized = normalizeText(description);

  for (const prefix of NOISY_PREFIXES) {
    if (normalized === prefix) return "";
    if (normalized.startsWith(`${prefix} `)) {
      normalized = normalized.slice(prefix.length).trim();
    }
  }

  return normalized
    .replace(/\b(co|corp|corporation|inc|llc|ltd|store|online)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanVendorName(description: string) {
  const cleanName = description
    .replace(/\s+/g, " ")
    .replace(/[*#]+/g, " ")
    .trim()
    .slice(0, 120);

  return cleanName || "Vendor";
}

export function normalizeRuleContext(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function findVendorRuleForTransaction(
  transaction: Pick<AccountingTransaction, "description" | "bank" | "account" | "source">,
  rules: AccountingVendorRule[],
) {
  if (transaction.source !== "plaid") return null;

  const vendorKey = normalizeVendorKey(transaction.description);
  if (!vendorKey) return null;

  let bestRule: AccountingVendorRule | null = null;
  let bestScore = -1;

  for (const rule of rules) {
    if (rule.vendor_key !== vendorKey) continue;
    if (rule.bank && rule.bank !== transaction.bank) continue;
    if (rule.account && rule.account !== transaction.account) continue;

    const score = (rule.bank ? 1 : 0) + (rule.account ? 1 : 0);
    if (score > bestScore) {
      bestRule = rule;
      bestScore = score;
    }
  }

  return bestRule;
}
