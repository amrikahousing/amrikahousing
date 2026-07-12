import type { Prisma } from "@/generated/prisma/client";
import { computeNetRent } from "./rent-credit";

const OPEN_ENDED_PAYMENT_MONTHS = 12;

export function addMonthsClamped(date: Date, months: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTargetMonth)));
}

export function buildRentPaymentDueDates(startDate: Date, endDate: Date | null) {
  const dates: Date[] = [];
  const paymentCount = endDate
    ? Math.max(
        0,
        (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
          (endDate.getUTCMonth() - startDate.getUTCMonth()) +
          1,
      )
    : OPEN_ENDED_PAYMENT_MONTHS;

  for (let i = 0; i < paymentCount; i += 1) {
    const dueDate = addMonthsClamped(startDate, i);
    if (endDate && dueDate > endDate) break;
    dates.push(dueDate);
  }

  return dates;
}

type SeedRentPaymentsInput = {
  leaseId: string;
  tenantId: string;
  rentAmount: number;
  monthlyRentCredit?: number | null;
  startDate: Date;
  endDate: Date | null;
};

/**
 * Creates the pending monthly rent schedule for a lease. No-ops if the lease
 * already has payments, so completing a signature after manual seeding (or a
 * webhook retry) never double-bills.
 */
export async function seedRentPayments(
  tx: Prisma.TransactionClient,
  input: SeedRentPaymentsInput,
) {
  const existingPaymentCount = await tx.payments.count({ where: { lease_id: input.leaseId } });
  if (existingPaymentCount > 0) return;

  const dueDates = buildRentPaymentDueDates(input.startDate, input.endDate);
  if (dueDates.length === 0) return;

  const credit = Math.max(0, input.monthlyRentCredit ?? 0);
  await tx.payments.createMany({
    // Month 1 is billed at full rent; the credit applies from month 2 onward.
    data: dueDates.map((dueDate, index) => {
      const applyCredit = index > 0 && credit > 0;
      const amount = applyCredit ? computeNetRent(input.rentAmount, credit) : input.rentAmount;
      return {
        lease_id: input.leaseId,
        tenant_id: input.tenantId,
        amount,
        type: "rent",
        status: "pending",
        due_date: dueDate,
        notes: applyCredit ? `Monthly rent (credit $${credit.toFixed(2)} applied)` : "Monthly rent",
      };
    }),
  });
}
