import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TransactionFiltersPanel } from "@/components/TransactionFiltersPanel";
import { TransactionsLedger } from "@/components/TransactionsLedger";
import { mergeAccountingCategoryOptions } from "@/lib/accounting-categories";
import {
  type AccountingTransaction,
  getAccountingData,
  serializeAccountingTransaction,
  sortTransactionsByDate,
} from "@/lib/accounting";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string) {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function parseDateInput(value: string, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function uniqueValues(
  transactions: AccountingTransaction[],
  key: keyof Pick<AccountingTransaction, "bank" | "account" | "category">,
) {
  return Array.from(
    new Set(
      transactions
        .map((transaction) => transaction[key])
        .filter((value) => value.trim().length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function yearsFor(transactions: AccountingTransaction[]) {
  const years = new Set<number>();
  for (const transaction of transactions) {
    if (transaction.date) years.add(transaction.date.getFullYear());
  }

  if (years.size === 0) years.add(new Date().getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}

function filterTransactions(
  transactions: AccountingTransaction[],
  filters: {
    bank: string;
    account: string;
    category: string;
    type: string;
    year: string;
    from: string;
    to: string;
    q: string;
  },
) {
  const fromDate = parseDateInput(filters.from);
  const toDate = parseDateInput(filters.to, true);
  const selectedYear = Number.parseInt(filters.year, 10);
  const hasSelectedYear = Number.isInteger(selectedYear);
  const query = normalize(filters.q);
  const selectedCategory = normalize(filters.category);

  return sortTransactionsByDate(
    transactions.filter((transaction) => {
      if (filters.bank && transaction.bank !== filters.bank) return false;
      if (filters.account && transaction.account !== filters.account) return false;
      if (selectedCategory && normalize(transaction.category) !== selectedCategory) {
        return false;
      }
      if (filters.type === "income" && !transaction.isIncome) return false;
      if (filters.type === "expense" && transaction.isIncome) return false;

      if (hasSelectedYear) {
        if (!transaction.date || transaction.date.getFullYear() !== selectedYear) {
          return false;
        }
      }

      if (fromDate && (!transaction.date || transaction.date < fromDate)) {
        return false;
      }

      if (toDate && (!transaction.date || transaction.date > toDate)) {
        return false;
      }

      if (query) {
        const haystack = normalize(
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
    }),
  );
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = {
    bank: readParam(resolvedSearchParams, "bank"),
    account: readParam(resolvedSearchParams, "account"),
    category: readParam(resolvedSearchParams, "category"),
    type: readParam(resolvedSearchParams, "type"),
    year: readParam(resolvedSearchParams, "year"),
    from: readParam(resolvedSearchParams, "from"),
    to: readParam(resolvedSearchParams, "to"),
    q: readParam(resolvedSearchParams, "q"),
  };

  const accountingData = orgId
    ? await getAccountingData(orgId)
    : {
        transactions: [],
        plaidTransactions: [],
        rentTransactions: [],
        accountSummaries: [],
      };
  const allTransactions = accountingData.transactions;
  const visibleTransactions = filterTransactions(allTransactions, filters);
  const banks = uniqueValues(allTransactions, "bank");
  const accounts = uniqueValues(allTransactions, "account");
  const categories = mergeAccountingCategoryOptions(
    uniqueValues(allTransactions, "category"),
  );
  const years = yearsFor(allTransactions);
  const totalIncome = visibleTransactions
    .filter((transaction) => transaction.isIncome)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalExpenses = visibleTransactions
    .filter((transaction) => !transaction.isIncome)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const netTotal = totalIncome - totalExpenses;

  return (
    <AppShell>
      <div className="space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/accounts"
              className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Back to accounts
            </Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Transactions
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Filter income and expenses across linked accounts and rent records.
            </p>
          </div>
        </header>

        <section
          aria-label="Filtered transaction totals"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Matching Transactions
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-950">
              {visibleTransactions.length.toLocaleString()}
            </p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Income
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-600">
              {formatCurrency(totalIncome)}
            </p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Expenses
            </p>
            <p className="mt-2 text-2xl font-bold text-red-600">
              {formatCurrency(totalExpenses)}
            </p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Net
            </p>
            <p
              className={
                netTotal >= 0
                  ? "mt-2 text-2xl font-bold text-emerald-600"
                  : "mt-2 text-2xl font-bold text-red-600"
              }
            >
              {formatCurrency(netTotal)}
            </p>
          </article>
        </section>

        <TransactionFiltersPanel
          filters={filters}
          banks={banks}
          accounts={accounts}
          categories={categories}
          years={years}
        />

        <TransactionsLedger
          key={visibleTransactions.map((transaction) => transaction.id).join("|")}
          transactions={visibleTransactions.map(serializeAccountingTransaction)}
          allTransactionCount={allTransactions.length}
          categoryOptions={categories}
        />
      </div>
    </AppShell>
  );
}
