type ExpenseCategory = {
  category: string;
  amount: number;
};

type ExpenseCategoryPieChartProps = {
  categories: ExpenseCategory[];
  total: number;
  totalLabel: string;
};

const COLORS = [
  "#ef4444",
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

function formatPercent(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function ExpenseCategoryPieChart({
  categories,
  total,
  totalLabel,
}: ExpenseCategoryPieChartProps) {
  const radius = 76;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;
  const pieSegments = categories.map((item, index) => {
    const share = total === 0 ? 0 : item.amount / total;
    const offset = categories
      .slice(0, index)
      .reduce((sum, previousItem) => sum + (total === 0 ? 0 : previousItem.amount / total), 0);

    return {
      ...item,
      share,
      dash: circumference * share,
      dashOffset: -offset * circumference,
    };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] lg:items-center xl:grid-cols-[320px_minmax(360px,1fr)]">
      <div className="relative mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center">
        <svg
          className="h-full w-full -rotate-90 overflow-visible"
          viewBox="0 0 220 220"
          role="img"
          aria-label="YTD expenses by category pie chart"
        >
          <circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
          />
          {pieSegments.map((item, index) => (
            <circle
              key={item.category}
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              strokeDasharray={`${item.dash} ${circumference}`}
              strokeDashoffset={item.dashOffset}
            >
              <animate
                attributeName="stroke-dasharray"
                from={`0 ${circumference}`}
                to={`${item.dash} ${circumference}`}
                dur="650ms"
                begin={`${index * 90}ms`}
                fill="freeze"
                calcMode="spline"
                keySplines="0.2 0.8 0.2 1"
              />
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            {totalLabel}
          </p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {categories.map((item, index) => {
          const share = total === 0 ? 0 : (item.amount / total) * 100;

          return (
            <div
              key={item.category}
              className="rounded-xl border border-slate-200 p-3"
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold capitalize leading-5 text-slate-800">
                    {item.category}
                  </p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-xs font-medium text-slate-500">
                      {formatPercent(share)} of total
                    </p>
                    <p className="shrink-0 whitespace-nowrap text-sm font-bold text-slate-950">
                      {item.amount.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
