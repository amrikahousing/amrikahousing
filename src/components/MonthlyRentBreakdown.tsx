import type { MonthlyBreakdownRow } from "@/lib/rent-credit";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDueDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(value));
}

export function MonthlyRentBreakdown({ rows }: { rows: MonthlyBreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
        No rent schedule is available yet for this lease.
      </p>
    );
  }

  const totalCredit = rows.reduce((sum, r) => sum + r.creditApplied, 0);
  const totalPays = rows.reduce((sum, r) => sum + r.tenantPays, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5">Month</th>
            <th className="px-4 py-2.5 text-right">Lease Rent</th>
            <th className="px-4 py-2.5 text-right">Credit Applied</th>
            <th className="px-4 py-2.5 text-right">Tenant Pays</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const due = formatDueDate(row.dueDate);
            return (
              <tr key={row.month} className="text-slate-800">
                <td className="px-4 py-2.5">
                  <span className="font-medium">Month {row.month}</span>
                  {due && <span className="ml-2 text-xs text-slate-400">{due}</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(row.leaseRent)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                  {row.creditApplied > 0 ? `-${formatCurrency(row.creditApplied)}` : "-$0"}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(row.tenantPays)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-slate-50 text-slate-900">
            <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Total</td>
            <td className="px-4 py-2.5" />
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-700">
              {totalCredit > 0 ? `-${formatCurrency(totalCredit)}` : "-$0"}
            </td>
            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(totalPays)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
