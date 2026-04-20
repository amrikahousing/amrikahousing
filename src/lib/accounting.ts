import { prisma } from "@/lib/db";
import {
  findVendorRuleForTransaction,
  type AccountingVendorRule,
} from "@/lib/accounting-vendor-rules";
import { decryptPlaidAccessToken, syncPlaidTransactions } from "@/lib/plaid";

export type AccountingTransaction = {
  id: string;
  date: Date | null;
  description: string;
  category: string;
  account: string;
  bank: string;
  amount: number;
  isIncome: boolean;
  source: "plaid" | "rent";
};

export type SerializedAccountingTransaction = Omit<
  AccountingTransaction,
  "date"
> & {
  date: string | null;
};

export type AccountSummary = {
  name: string;
  provider: string;
  balance: number;
  sync: string;
  status: string;
  icon: string;
};

type PlaidTransaction = {
  transaction_id?: unknown;
  date?: unknown;
  name?: unknown;
  merchant_name?: unknown;
  amount?: unknown;
  personal_finance_category?: {
    primary?: unknown;
    detailed?: unknown;
  } | null;
  category?: unknown;
  account_id?: unknown;
};

type PlaidAccount = {
  account_id?: unknown;
  name?: unknown;
  official_name?: unknown;
};

export type AccountingData = {
  transactions: AccountingTransaction[];
  plaidTransactions: AccountingTransaction[];
  rentTransactions: AccountingTransaction[];
  accountSummaries: AccountSummary[];
};

function parsePlaidDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCategory(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.replaceAll("_", " ").toLowerCase();
  }

  if (Array.isArray(value)) {
    const firstCategory = value.find(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    if (firstCategory) return firstCategory.toLowerCase();
  }

  return "uncategorized";
}

function isPaidStatus(status: string) {
  return status === "paid" || status === "completed";
}

export async function getAccountingData(orgId: string): Promise<AccountingData> {
  const [payments, plaidItems, categoryOverrides, vendorRules] = await Promise.all([
    prisma.payments.findMany({
      where: {
        leases: {
          units: {
            deleted_at: null,
            properties: {
              deleted_at: null,
              organizations: { clerk_org_id: orgId },
            },
          },
        },
      },
      include: {
        tenants: true,
        leases: {
          include: {
            units: {
              include: {
                properties: true,
              },
            },
          },
        },
      },
      orderBy: [{ paid_at: "desc" }, { due_date: "desc" }, { created_at: "desc" }],
      take: 250,
    }),
    prisma.plaid_items.findMany({
      where: {
        organizations: { clerk_org_id: orgId },
      },
      orderBy: { created_at: "desc" },
    }),
    prisma.accounting_transaction_categories.findMany({
      where: {
        organizations: { clerk_org_id: orgId },
      },
      select: {
        source: true,
        transaction_id: true,
        category: true,
      },
    }),
    prisma.accounting_vendor_category_rules.findMany({
      where: {
        organizations: { clerk_org_id: orgId },
      },
      orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
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
  ]);
  const rules: AccountingVendorRule[] = vendorRules;
  const categoryOverridesByTransaction = new Map(
    categoryOverrides.map((override) => [
      `${override.source}:${override.transaction_id}`,
      override.category,
    ]),
  );
  const applyCategoryOverride = (transaction: AccountingTransaction) => {
    const manualOverride = categoryOverridesByTransaction.get(
      `${transaction.source}:${transaction.id}`,
    );
    const vendorRule = findVendorRuleForTransaction(transaction, rules);

    return {
      ...transaction,
      category: manualOverride ?? vendorRule?.category ?? transaction.category,
    };
  };

  const plaidTransactions: AccountingTransaction[] = [];
  const plaidAccountSummaries = new Map<string, AccountSummary>();

  for (const item of plaidItems.slice(0, 5)) {
    try {
      const accessToken = decryptPlaidAccessToken(item.access_token);
      const syncResult = await syncPlaidTransactions({
        accessToken,
        cursor: null,
      });

      if ("error" in syncResult) {
        continue;
      }

      if (!item.transactions_cursor && syncResult.nextCursor) {
        await prisma.plaid_items.update({
          where: { id: item.id },
          data: {
            transactions_cursor: syncResult.nextCursor,
            updated_at: new Date(),
          },
        });
      }

      const accountsById = new Map<string, string>();
      for (const account of syncResult.accounts as PlaidAccount[]) {
        if (typeof account.account_id !== "string") continue;
        const name =
          typeof account.official_name === "string" && account.official_name.trim()
            ? account.official_name
            : typeof account.name === "string" && account.name.trim()
              ? account.name
              : item.institution_name ?? "Plaid account";
        accountsById.set(account.account_id, name);
        plaidAccountSummaries.set(account.account_id, {
          name,
          provider: item.institution_name ?? "Plaid",
          balance: 0,
          sync: "just now",
          status: item.status === "connected" ? "Connected" : "Needs attention",
          icon: "bank",
        });
      }

      for (const transaction of syncResult.added as PlaidTransaction[]) {
        const transactionId =
          typeof transaction.transaction_id === "string"
            ? transaction.transaction_id
            : `${item.id}-${plaidTransactions.length}`;
        const amount = typeof transaction.amount === "number" ? transaction.amount : 0;
        const merchant =
          typeof transaction.merchant_name === "string" && transaction.merchant_name.trim()
            ? transaction.merchant_name
            : typeof transaction.name === "string" && transaction.name.trim()
              ? transaction.name
              : "Plaid transaction";
        const category = normalizeCategory(
          transaction.personal_finance_category?.primary ?? transaction.category,
        );
        const accountKey =
          typeof transaction.account_id === "string" ? transaction.account_id : null;
        const accountName = accountKey ? accountsById.get(accountKey) : null;

        plaidTransactions.push({
          id: `plaid-${transactionId}`,
          date: parsePlaidDate(transaction.date),
          description: merchant,
          category,
          account: accountName ?? item.institution_name ?? "Plaid account",
          bank: item.institution_name ?? "Plaid",
          amount: Math.abs(amount),
          isIncome: amount < 0,
          source: "plaid",
        });

        if (accountKey) {
          const accountSummary = plaidAccountSummaries.get(accountKey);
          if (accountSummary) {
            accountSummary.balance += amount < 0 ? Math.abs(amount) : -Math.abs(amount);
          }
        }
      }
    } catch {
      continue;
    }
  }

  const rentTransactions: AccountingTransaction[] = payments.map((payment) => {
    const tenantName = payment.tenants
      ? `${payment.tenants.first_name} ${payment.tenants.last_name}`
      : "Tenant";
    const unit = payment.leases.units;
    const property = unit.properties;
    const isIncome = isPaidStatus(payment.status);

    return {
      id: payment.id,
      date: payment.paid_at ?? payment.due_date,
      description:
        payment.type === "rent"
          ? `Tenant Payment - ${tenantName}`
          : `${payment.type} - ${tenantName}`,
      category: payment.type === "rent" ? "Income" : payment.type,
      account: `${property.name}${unit.unit_number ? ` Unit ${unit.unit_number}` : ""}`,
      bank: "Amrika Housing",
      amount: Number(payment.amount ?? 0),
      isIncome,
      source: "rent",
    };
  });

  return {
    transactions: sortTransactionsByDate([
      ...plaidTransactions.map(applyCategoryOverride),
      ...rentTransactions.map(applyCategoryOverride),
    ]),
    plaidTransactions: plaidTransactions.map(applyCategoryOverride),
    rentTransactions: rentTransactions.map(applyCategoryOverride),
    accountSummaries: Array.from(plaidAccountSummaries.values()),
  };
}

export function sortTransactionsByDate(transactions: AccountingTransaction[]) {
  return [...transactions].sort(
    (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0),
  );
}

export function serializeAccountingTransaction(
  transaction: AccountingTransaction,
): SerializedAccountingTransaction {
  return {
    ...transaction,
    date: transaction.date ? transaction.date.toISOString() : null,
  };
}
