import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountsYearSelect } from "@/components/AccountsYearSelect";
import { AccountsRangeSelect } from "@/components/AccountsRangeSelect";
import { AppShell } from "@/components/AppShell";
import { ExpenseCategoryPieChart } from "@/components/ExpenseCategoryPieChart";
import { PlaidLinkButton } from "@/components/PlaidLinkButton";
import { PlaidRemoveButton } from "@/components/PlaidRemoveButton";
import { RentCollectionAccountRadio } from "@/components/RentCollectionAccountRadio";
import { PlaidSyncButton } from "@/components/PlaidSyncButton";
import {
  getAccountingData,
  sortTransactionsByDate,
} from "@/lib/accounting";
import { prisma } from "@/lib/db";
import {
  getOrganizationRentCollectionAccount,
  isEligibleRentCollectionAccount,
} from "@/lib/organization-payment-destinations";
import { getOrgPermissionContext } from "@/lib/org-authorization";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShortDate(value: Date | null) {
  if (!value) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(value);
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

type ChartRange = "3m" | "6m" | "12m" | "ytd";

function getNiceChartScale(maxValue: number) {
  const target = Math.max(1, maxValue);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;
  const niceNormalized =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const max = niceNormalized * magnitude;
  const step = max / 4;

  return {
    max,
    ticks: Array.from({ length: 5 }, (_, index) => max - step * index),
  };
}

function formatAxisTick(value: number) {
  if (value === 0) return "$0";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 0 : 1,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function initialsForAccount(name: string, provider: string) {
  const source = name.trim() || provider.trim() || "A";
  const tokens = source.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0].slice(0, 1).toUpperCase();
  return `${tokens[0]?.[0] ?? ""}${tokens[1]?.[0] ?? ""}`.toUpperCase();
}

function syncStatusLabel(sync: string) {
  if (sync === "synced") return "Synced just now";
  if (sync === "sync needed") return "Sync needed";
  return sync;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const shared = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "wallet") {
    return (
      <svg {...shared}>
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
        <path d="M17 12h3v4h-3a2 2 0 0 1 0-4Z" />
        <path d="M8 9h5" />
      </svg>
    );
  }

  if (name === "trend") {
    return (
      <svg {...shared}>
        <path d="M4 17 9 12l4 4 7-9" />
        <path d="M14 7h6v6" />
      </svg>
    );
  }

  if (name === "down") {
    return (
      <svg {...shared}>
        <path d="m5 8 5 5 4-4 5 5" />
        <path d="M14 14h5V9" />
      </svg>
    );
  }

  if (name === "dollar") {
    return (
      <svg {...shared}>
        <path d="M12 3v18" />
        <path d="M16.5 7.5A3.5 3.5 0 0 0 12.8 6H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-2.2a4 4 0 0 1-3.8-2" />
      </svg>
    );
  }

  if (name === "bank") {
    return (
      <svg {...shared}>
        <path d="M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18" />
        <path d="m12 4 8 4H4l8-4Z" />
      </svg>
    );
  }

  if (name === "card") {
    return (
      <svg {...shared}>
        <path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h12A2.5 2.5 0 0 1 20.5 7v10A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7Z" />
        <path d="M3.5 9h17M7.5 15h4" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path d="M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string | string[]; range?: string | string[] }>;
}) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/login");
  const access = await getOrgPermissionContext();
  if ("error" in access) redirect("/dashboard");
  const accountingAccess =
    access.permissions.manage_accounting || access.permissions.manage_bank_accounts;
  if (!accountingAccess) redirect("/dashboard");

  const now = new Date();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedYear =
    typeof resolvedSearchParams.year === "string"
      ? Number.parseInt(resolvedSearchParams.year, 10)
      : Number.NaN;
  const requestedRange =
    typeof resolvedSearchParams.range === "string"
      ? resolvedSearchParams.range.toLowerCase()
      : "";
  const currentYear = now.getFullYear();
  const selectedRange: ChartRange =
    requestedRange === "3m" ||
    requestedRange === "6m" ||
    requestedRange === "12m" ||
    requestedRange === "ytd"
      ? requestedRange
      : "ytd";
  const selectedYear =
    Number.isInteger(requestedYear) &&
    requestedYear >= currentYear - 5 &&
    requestedYear <= currentYear
      ? requestedYear
      : currentYear;
  const yearOptions = Array.from({ length: 6 }, (_, index) => currentYear - index);
  const currentMonthStart = monthStart(now);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const chartMonthCount =
    selectedRange === "3m" ? 3 : selectedRange === "6m" ? 6 : selectedRange === "12m" ? 12 : now.getMonth() + 1;
  const months = Array.from({ length: chartMonthCount }, (_, index) => {
    const date =
      selectedRange === "ytd"
        ? new Date(selectedYear, index, 1)
        : new Date(now.getFullYear(), now.getMonth() - (chartMonthCount - 1 - index), 1);
    date.setHours(0, 0, 0, 0);
    return date;
  });

  const orgRecord = orgId
    ? await prisma.organizations.findUnique({
        where: { clerk_org_id: orgId },
        select: { id: true },
      })
    : null;
  const [accountingData, rentCollectionAccount] =
    orgId && orgRecord
      ? await Promise.all([
          getAccountingData(orgId),
          getOrganizationRentCollectionAccount(orgRecord.id),
        ])
      : [
          {
            transactions: [],
            plaidTransactions: [],
            rentTransactions: [],
            manualTransactions: [],
            accountSummaries: [],
          },
          null,
        ];
  const transactions = accountingData.transactions;
  const recentTransactions = sortTransactionsByDate(transactions).slice(0, 8);
  const activeTransactions = transactions.filter((transaction) => transaction.date);
  const currentMonthTransactions = activeTransactions.filter((transaction) => {
    if (!transaction.date) return false;
    return transaction.date >= currentMonthStart && transaction.date < nextMonthStart;
  });
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthTransactions = activeTransactions.filter((transaction) => {
    if (!transaction.date) return false;
    return transaction.date >= previousMonthStart && transaction.date < currentMonthStart;
  });
  const monthlyRevenue = currentMonthTransactions
    .filter((transaction) => transaction.isIncome)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthlyExpenses = currentMonthTransactions
    .filter((transaction) => !transaction.isIncome)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const previousRevenue = previousMonthTransactions
    .filter((transaction) => transaction.isIncome)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const previousExpenses = previousMonthTransactions
    .filter((transaction) => !transaction.isIncome)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const netProfit = monthlyRevenue - monthlyExpenses;
  const totalBalance = transactions.reduce(
    (sum, transaction) =>
      sum + (transaction.isIncome ? transaction.amount : -transaction.amount),
    0,
  );
  const percentChange = (current: number, previous: number) => {
    if (previous === 0) return current === 0 ? "0.0%" : "+100.0%";
    const change = ((current - previous) / Math.abs(previous)) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
  };

  const revenueData = months.map((date) => {
    const start = monthStart(date);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const monthTransactions = activeTransactions.filter(
      (transaction) => transaction.date && transaction.date >= start && transaction.date < end,
    );

    return {
      month: monthLabel(start),
      revenue: monthTransactions
        .filter((transaction) => transaction.isIncome)
        .reduce((sum, transaction) => sum + transaction.amount, 0),
      expenses: monthTransactions
        .filter((transaction) => !transaction.isIncome)
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    };
  });
  const chartWidth = 560;
  const chartHeight = 210;
  const chartPadding = 18;
  const chartInnerHeight = chartHeight - chartPadding * 2;
  const chartScale = getNiceChartScale(
    Math.max(
      0,
      ...revenueData.map((item) => Math.max(item.revenue, item.expenses)),
    ),
  );
  const tallestChartValue = chartScale.max;
  const largestActualChartValue = Math.max(
    1,
    monthlyRevenue,
    monthlyExpenses,
    ...revenueData.map((item) => Math.max(item.revenue, item.expenses)),
  );
  const xStep = chartWidth / Math.max(1, revenueData.length - 1);
  const chartY = (value: number) =>
    chartPadding + chartInnerHeight - (value / tallestChartValue) * chartInnerHeight;
  const totalChartRevenue = revenueData.reduce((sum, item) => sum + item.revenue, 0);
  const totalChartExpenses = revenueData.reduce((sum, item) => sum + item.expenses, 0);
  const totalChartNet = totalChartRevenue - totalChartExpenses;
  const revenuePoints = revenueData
    .map((item, index) => `${index * xStep},${chartY(item.revenue)}`)
    .join(" ");
  const expensePoints = revenueData
    .map((item, index) => `${index * xStep},${chartY(item.expenses)}`)
    .join(" ");
  const revenueAreaPoints = `0,${chartHeight} ${revenuePoints} ${chartWidth},${chartHeight}`;
  const expenseAreaPoints = `0,${chartHeight} ${expensePoints} ${chartWidth},${chartHeight}`;
  const chartSubtitle =
    selectedRange === "ytd"
      ? `${selectedYear} year to date . all properties`
      : `Trailing ${chartMonthCount} months . all properties`;
  const ytdStart = new Date(selectedYear, 0, 1);
  const ytdEnd =
    selectedYear === currentYear ? now : new Date(selectedYear + 1, 0, 1);
  const ytdExpenseTotals = new Map<string, number>();
  for (const transaction of activeTransactions) {
    if (
      !transaction.date ||
      transaction.isIncome ||
      transaction.date < ytdStart ||
      transaction.date >= ytdEnd
    ) {
      continue;
    }

    ytdExpenseTotals.set(
      transaction.category,
      (ytdExpenseTotals.get(transaction.category) ?? 0) + transaction.amount,
    );
  }
  const ytdExpenseCategories = Array.from(ytdExpenseTotals.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
  const ytdExpenseTotal = ytdExpenseCategories.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const metricCards = [
    {
      label: "Total Balance",
      value: formatCurrency(totalBalance),
      change: percentChange(totalBalance, 0),
      icon: "wallet",
      tone: "bg-blue-50 text-blue-600",
    },
    {
      label: "Monthly Revenue",
      value: formatCurrency(monthlyRevenue),
      change: percentChange(monthlyRevenue, previousRevenue),
      icon: "trend",
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Monthly Expenses",
      value: formatCurrency(monthlyExpenses),
      change: percentChange(monthlyExpenses, previousExpenses),
      icon: "down",
      tone: "bg-rose-50 text-rose-600",
    },
    {
      label: "Net Profit",
      value: formatCurrency(netProfit),
      change: percentChange(netProfit, previousRevenue - previousExpenses),
      icon: "dollar",
      tone: "bg-teal-50 text-teal-600",
    },
  ];

  const connectedAccounts = accountingData.accountSummaries;
  const activeRentCollectionAccountId = rentCollectionAccount?.selectedConnectedAccountId ?? null;

  return (
    <AppShell>
      <div className="space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Accounts
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Welcome back! Here&apos;s your financial overview.
            </p>
          </div>
          <Link
            href="/accounts/transactions"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            View all transactions
          </Link>
        </header>

        <section
          aria-label="Financial summary"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {metricCards.map((card) => (
            <article
              key={card.label}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className={cx("rounded-lg p-3", card.tone)}>
                  <Icon name={card.icon} className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-emerald-600">
                  {card.change}
                </span>
              </div>
              <p className="mt-5 text-xs font-semibold text-slate-500">
                {card.label}
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
                {card.value}
              </p>
            </article>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                  Revenue vs Expenses
                </h2>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                  {chartSubtitle}
                </p>
              </div>
              <AccountsRangeSelect selectedRange={selectedRange} selectedYear={selectedYear} />
            </div>
            <div className="h-[310px] px-5 pb-5">
              <div className="grid h-full grid-cols-[44px_1fr] grid-rows-[1fr_24px]">
                <div className="flex flex-col justify-between pb-6 pr-3 text-right text-xs text-slate-500">
                  {chartScale.ticks.map((tick) => (
                    <span key={tick}>{formatAxisTick(tick)}</span>
                  ))}
                </div>
                <div className="relative overflow-hidden">
                  <div className="absolute inset-0 grid grid-rows-4 border-b border-slate-300">
                    <div className="border-t border-dashed border-slate-200" />
                    <div className="border-t border-dashed border-slate-200" />
                    <div className="border-t border-dashed border-slate-200" />
                    <div className="border-t border-dashed border-slate-200" />
                  </div>
                  <svg
                    className="absolute inset-0 h-full w-full overflow-visible"
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="revenueArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity="0.24" />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="expenseArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polygon points={revenueAreaPoints} fill="url(#revenueArea)" opacity="0">
                      <animate
                        attributeName="opacity"
                        from="0"
                        to="1"
                        dur="700ms"
                        begin="180ms"
                        fill="freeze"
                      />
                    </polygon>
                    <polygon points={expenseAreaPoints} fill="url(#expenseArea)" opacity="0">
                      <animate
                        attributeName="opacity"
                        from="0"
                        to="1"
                        dur="700ms"
                        begin="280ms"
                        fill="freeze"
                      />
                    </polygon>
                    <polyline
                      points={revenuePoints}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="2.5"
                      strokeDasharray="1"
                      strokeDashoffset="1"
                      pathLength={1}
                      vectorEffect="non-scaling-stroke"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="1"
                        to="0"
                        dur="850ms"
                        begin="50ms"
                        fill="freeze"
                        calcMode="spline"
                        keySplines="0.2 0.8 0.2 1"
                      />
                    </polyline>
                    <polyline
                      points={expensePoints}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      strokeDasharray="1"
                      strokeDashoffset="1"
                      pathLength={1}
                      vectorEffect="non-scaling-stroke"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="1"
                        to="0"
                        dur="850ms"
                        begin="150ms"
                        fill="freeze"
                        calcMode="spline"
                        keySplines="0.2 0.8 0.2 1"
                      />
                    </polyline>
                    {revenueData.map((item, index) => (
                      <circle
                        key={`revenue-${item.month}`}
                        cx={index * xStep}
                        cy={chartY(item.revenue)}
                        r="0"
                        fill="#2563eb"
                      >
                        <animate
                          attributeName="r"
                          from="0"
                          to={item.revenue === 0 ? "2.2" : "3.4"}
                          dur="260ms"
                          begin={`${260 + index * 90}ms`}
                          fill="freeze"
                        />
                      </circle>
                    ))}
                    {revenueData.map((item, index) => (
                      <circle
                        key={`expense-${item.month}`}
                        cx={index * xStep}
                        cy={chartY(item.expenses)}
                        r="0"
                        fill="#ef4444"
                      >
                        <animate
                          attributeName="r"
                          from="0"
                          to={item.expenses === 0 ? "2.2" : "3.4"}
                          dur="260ms"
                          begin={`${340 + index * 90}ms`}
                          fill="freeze"
                        />
                      </circle>
                    ))}
                  </svg>
                </div>
                <div />
                <div
                  className="grid text-center text-xs text-slate-500 sm:text-sm"
                  style={{ gridTemplateColumns: `repeat(${revenueData.length}, minmax(0, 1fr))` }}
                >
                  {revenueData.map((item) => (
                    <span key={item.month}>{item.month}</span>
                  ))}
                </div>
                <div />
                <div className="mt-1 flex justify-center gap-4 text-xs text-slate-500 sm:text-sm">
                  <span className="inline-flex items-center gap-2 text-blue-600">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
                    revenue
                  </span>
                  <span className="inline-flex items-center gap-2 text-red-600">
                    <span className="h-2.5 w-2.5 rounded-sm bg-red-600" />
                    expenses
                  </span>
                  <span>peak {formatCurrency(largestActualChartValue)}</span>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:text-sm">
                <div className="flex flex-wrap items-center gap-5">
                  <span className="inline-flex items-center gap-2 text-slate-700">
                    <span className="h-4 w-4 rounded bg-blue-600" />
                    Revenue
                    <span className="font-semibold text-slate-950">
                      {formatCompactCurrency(totalChartRevenue)}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-2 text-slate-700">
                    <span className="h-4 w-4 rounded bg-red-600" />
                    Expenses
                    <span className="font-semibold text-slate-950">
                      {formatCompactCurrency(totalChartExpenses)}
                    </span>
                  </span>
                </div>
                <p className="text-sm text-slate-500 sm:text-base">
                  Net{" "}
                  <span
                    className={cx(
                      "font-semibold",
                      totalChartNet >= 0 ? "text-emerald-600" : "text-red-600",
                    )}
                  >
                    {totalChartNet >= 0 ? "+" : ""}
                    {formatCompactCurrency(totalChartNet)}
                  </span>
                </p>
              </div>
            </div>
          </article>

        <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div className="flex items-start gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  Connected Accounts
                </h2>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  Linked bank accounts and credit cards used for rent and expenses.
                </p>
              </div>
              <div className="hidden items-center gap-2 pt-2 text-xs text-slate-500 md:flex">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Live</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2 text-xs text-slate-500 md:hidden">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>Live</span>
              </div>
              <div>
                <PlaidSyncButton />
              </div>
              <div>
                <PlaidLinkButton />
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            {connectedAccounts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">No accounts linked yet</p>
                <p className="max-w-sm text-sm text-slate-500">Connect a bank account to track transactions automatically.</p>
                <PlaidLinkButton />
              </div>
            ) : (
              <div className="space-y-3">
                {connectedAccounts.map((account) => {
                  const isRentCollectionAccount =
                    activeRentCollectionAccountId === account.id;
                  const isRentCollectionEligible = isEligibleRentCollectionAccount({
                    connectedAccountId: account.id,
                    name: account.name,
                    provider: account.provider,
                    accountType: account.accountType,
                    accountSubtype: account.accountSubtype,
                  });
                  const isRentCollectionDisabled =
                    !isRentCollectionEligible || account.status !== "Connected";
                  const isConnected = account.status === "Connected";
                  const accountTone = isConnected
                    ? isRentCollectionAccount
                      ? "border-emerald-400 bg-emerald-50/40"
                      : "border-stone-200 bg-white"
                    : "border-amber-200 bg-amber-50/40";

                  return (
                    <article
                      key={account.id}
                      className={cx(
                        "overflow-hidden rounded-[24px] border px-4 py-3 shadow-sm transition",
                        accountTone,
                      )}
                    >
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-slate-900 text-sm font-semibold text-white shadow-sm">
                            {account.institutionLogoUrl ? (
                              <Image
                                src={account.institutionLogoUrl}
                                alt={`${account.provider} logo`}
                                width={40}
                                height={40}
                                className="h-7 w-7 object-contain"
                                loading="lazy"
                                unoptimized
                              />
                            ) : (
                              initialsForAccount(account.name, account.provider)
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold tracking-tight text-slate-950 sm:truncate sm:text-base">
                              {account.name}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500 sm:truncate">
                              {account.provider}
                              <span className="mx-2 text-slate-300">•</span>
                              <span>
                                {isRentCollectionEligible
                                  ? "Checking or savings"
                                  : "Credit or ineligible"}
                              </span>
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span
                                className={cx(
                                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                                  isConnected
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700",
                                )}
                              >
                                {isConnected
                                  ? syncStatusLabel(account.sync)
                                  : "Reconnect required"}
                              </span>
                              {isRentCollectionAccount ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                                  Rent collection
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-col gap-2 md:items-end">
                          <p
                            className={cx(
                              "max-w-full text-right text-xl font-semibold tracking-tight",
                              account.balance >= 0 ? "text-slate-950" : "text-red-600",
                            )}
                          >
                            {account.balance < 0 ? "-" : ""}
                            {formatCurrency(Math.abs(account.balance))}
                          </p>
                          <div className="flex w-full flex-wrap items-center gap-2 md:justify-end">
                            {isRentCollectionEligible ? (
                              <RentCollectionAccountRadio
                                connectedAccountId={account.id}
                                checked={isRentCollectionAccount}
                                disabled={isRentCollectionDisabled}
                              />
                            ) : null}
                            {account.plaidItemId ? (
                              <PlaidRemoveButton
                                plaidItemId={account.plaidItemId}
                                plaidAccountId={account.plaidAccountId}
                                accountName={account.name}
                              />
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 md:justify-end">
                            <span>{account.status}</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </article>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                YTD Expenses by Category
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {formatCurrency(ytdExpenseTotal)} in expenses for {selectedYear}
              </p>
            </div>
            <AccountsYearSelect
              selectedYear={selectedYear}
              yearOptions={yearOptions}
              selectedRange={selectedRange}
            />
          </div>
          <div className="p-5">
            {ytdExpenseCategories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No expenses found for {selectedYear}.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Plaid expense transactions will appear here after they sync.
                </p>
              </div>
            ) : (
              <ExpenseCategoryPieChart
                categories={ytdExpenseCategories}
                total={ytdExpenseTotal}
                totalLabel={formatCurrency(ytdExpenseTotal)}
              />
            )}
          </div>
        </section>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-950">
              Recent Transactions
            </h2>
            <Link
              href="/accounts/transactions"
              className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              View all
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                No account records yet.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Plaid transactions and lease payments will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Description</th>
                    <th className="px-5 py-3 font-semibold">Category</th>
                    <th className="px-5 py-3 font-semibold">Account</th>
                    <th className="px-5 py-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentTransactions.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatShortDate(item.date)}
                      </td>
                      <td className="max-w-72 px-5 py-4 font-medium text-slate-950">
                        <span
                          className={cx(
                            "mr-2 inline-block size-2 rounded-full align-middle",
                            item.isIncome ? "bg-emerald-500" : "bg-red-500",
                          )}
                          aria-hidden="true"
                        />
                        <span className="sr-only">
                          {item.isIncome ? "Income: " : "Expense: "}
                        </span>
                        <span className="align-middle">{item.description}</span>
                        {item.source === "plaid" ? (
                          <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                            Plaid
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-600">
                          {item.category}
                        </span>
                      </td>
                      <td className="max-w-64 truncate px-5 py-4 text-slate-600">
                        {item.account}
                      </td>
                      <td
                        className={cx(
                          "px-5 py-4 text-right font-semibold",
                          item.isIncome ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {item.isIncome ? "+" : "-"}
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
