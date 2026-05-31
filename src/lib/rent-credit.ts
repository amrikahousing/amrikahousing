// ─── Monthly rent credit ────────────────────────────────────────────────────
//
// A monthly rent credit is a flat dollar concession subtracted from the rent the
// tenant actually pays each month. We store only the per-month credit amount on
// the lease (`monthly_rent_credit`) and the *net* amount the tenant pays on each
// monthly `payments` row. The credit shown per month is therefore always derived
// as `lease.rent_amount - payment.amount`, so the breakdown never drifts from
// what is actually billed.

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Net rent the tenant pays for a month given the gross rent and the monthly
 * credit. Never negative — a credit larger than rent simply yields $0.
 */
export function computeNetRent(rentAmount: number, monthlyCredit: number): number {
  return Math.max(0, roundCurrency(rentAmount - Math.max(0, monthlyCredit)));
}

export type BreakdownPaymentInput = {
  amount: number;
  dueDate: string | null;
};

export type MonthlyBreakdownRow = {
  month: number;
  dueDate: string | null;
  leaseRent: number;
  creditApplied: number;
  tenantPays: number;
};

/**
 * Builds the per-month breakdown rows for a lease's rent schedule from the actual
 * payment ledger. Rows are sorted chronologically and the credit shown for each
 * month is derived as `rent - amount`, so the breakdown always matches what is
 * actually billed for that month.
 */
export function buildMonthlyBreakdown(
  rentAmount: number,
  payments: BreakdownPaymentInput[],
): MonthlyBreakdownRow[] {
  const ordered = [...payments].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return ordered.map((payment, index) => {
    const tenantPays = roundCurrency(payment.amount);
    return {
      month: index + 1,
      dueDate: payment.dueDate,
      leaseRent: roundCurrency(rentAmount),
      creditApplied: Math.max(0, roundCurrency(rentAmount - tenantPays)),
      tenantPays,
    };
  });
}
