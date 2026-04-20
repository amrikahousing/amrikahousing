import type { AccountingTransaction } from "@/lib/accounting";
import { getAccountingData, sortTransactionsByDate } from "@/lib/accounting";
import {
  normalizeVendorKey,
  type AccountingVendorRule,
} from "@/lib/accounting-vendor-rules";

export type RuleMatch = AccountingTransaction;

export async function getTransactionsMatchingRule({
  orgId,
  rule,
  excludeTransactionId,
}: {
  orgId: string;
  rule: Pick<AccountingVendorRule, "vendor_key" | "bank" | "account">;
  excludeTransactionId?: string;
}): Promise<RuleMatch[]> {
  const accountingData = await getAccountingData(orgId);

  return sortTransactionsByDate(
    accountingData.transactions.filter((transaction) => {
      if (transaction.id === excludeTransactionId) return false;
      if (transaction.source !== "plaid") return false;
      if (transaction.isIncome) return false;
      if (normalizeVendorKey(transaction.description) !== rule.vendor_key) {
        return false;
      }
      if (rule.bank && transaction.bank !== rule.bank) return false;
      if (rule.account && transaction.account !== rule.account) return false;
      return true;
    }),
  );
}
