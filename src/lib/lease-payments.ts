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
