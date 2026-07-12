import { describe, it, expect } from "vitest";
import {
  addMonthsClamped,
  buildRentPaymentDueDates,
  seedRentPayments,
} from "@/lib/lease-payments";

const utc = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day));

const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("addMonthsClamped", () => {
  it("adds whole months when the day exists in the target month", () => {
    expect(iso(addMonthsClamped(utc(2026, 1, 15), 1))).toBe("2026-02-15");
    expect(iso(addMonthsClamped(utc(2026, 1, 15), 6))).toBe("2026-07-15");
  });

  it("returns the same calendar date for zero months", () => {
    expect(iso(addMonthsClamped(utc(2026, 3, 31), 0))).toBe("2026-03-31");
  });

  it("clamps Jan 31 to Feb 28 in a non-leap year", () => {
    expect(iso(addMonthsClamped(utc(2026, 1, 31), 1))).toBe("2026-02-28");
  });

  it("clamps Jan 31 to Feb 29 in a leap year", () => {
    expect(iso(addMonthsClamped(utc(2024, 1, 31), 1))).toBe("2024-02-29");
  });

  it("clamps 31st into 30-day months", () => {
    expect(iso(addMonthsClamped(utc(2026, 3, 31), 1))).toBe("2026-04-30");
    expect(iso(addMonthsClamped(utc(2026, 8, 31), 1))).toBe("2026-09-30");
  });

  it("does not stick to a prior clamp: Jan 31 + 2 months is Mar 31", () => {
    expect(iso(addMonthsClamped(utc(2026, 1, 31), 2))).toBe("2026-03-31");
  });

  it("rolls over year boundaries", () => {
    expect(iso(addMonthsClamped(utc(2025, 11, 15), 3))).toBe("2026-02-15");
    expect(iso(addMonthsClamped(utc(2025, 12, 31), 14))).toBe("2027-02-28");
  });

  it("supports negative month offsets with clamping", () => {
    expect(iso(addMonthsClamped(utc(2026, 3, 31), -1))).toBe("2026-02-28");
    expect(iso(addMonthsClamped(utc(2026, 1, 15), -2))).toBe("2025-11-15");
  });

  it("normalizes any time-of-day to midnight UTC", () => {
    const withTime = new Date(Date.UTC(2026, 0, 15, 17, 30, 45));
    expect(addMonthsClamped(withTime, 1).toISOString()).toBe(
      "2026-02-15T00:00:00.000Z",
    );
  });
});

describe("buildRentPaymentDueDates", () => {
  it("generates one due date per calendar month, inclusive of both ends", () => {
    const dates = buildRentPaymentDueDates(utc(2026, 1, 15), utc(2026, 3, 15));
    expect(dates.map(iso)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("defaults an open-ended lease to 12 monthly payments", () => {
    const dates = buildRentPaymentDueDates(utc(2026, 1, 1), null);
    expect(dates).toHaveLength(12);
    expect(iso(dates[0])).toBe("2026-01-01");
    expect(iso(dates[11])).toBe("2026-12-01");
  });

  it("clamps month-end due dates within an open-ended schedule", () => {
    const dates = buildRentPaymentDueDates(utc(2024, 1, 31), null);
    expect(dates).toHaveLength(12);
    expect(dates.map(iso)).toEqual([
      "2024-01-31",
      "2024-02-29", // leap year
      "2024-03-31",
      "2024-04-30",
      "2024-05-31",
      "2024-06-30",
      "2024-07-31",
      "2024-08-31",
      "2024-09-30",
      "2024-10-31",
      "2024-11-30",
      "2024-12-31",
    ]);
  });

  it("includes the final month when the end date is on/after the clamped due date", () => {
    const dates = buildRentPaymentDueDates(utc(2026, 1, 31), utc(2026, 6, 30));
    expect(dates.map(iso)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });

  it("drops the final month when its due date lands after the end date", () => {
    const dates = buildRentPaymentDueDates(utc(2026, 1, 31), utc(2026, 6, 15));
    expect(dates).toHaveLength(5);
    expect(iso(dates[4])).toBe("2026-05-31");
  });

  it("returns a single payment when start and end share a month", () => {
    const dates = buildRentPaymentDueDates(utc(2026, 4, 10), utc(2026, 4, 25));
    expect(dates.map(iso)).toEqual(["2026-04-10"]);
  });

  it("returns no payments when the end date precedes the start within the month", () => {
    expect(buildRentPaymentDueDates(utc(2026, 4, 15), utc(2026, 4, 10))).toEqual([]);
  });

  it("returns no payments when the end date is in an earlier month", () => {
    expect(buildRentPaymentDueDates(utc(2026, 4, 1), utc(2026, 2, 1))).toEqual([]);
  });

  it("spans year boundaries with the month count intact", () => {
    const dates = buildRentPaymentDueDates(utc(2025, 11, 30), utc(2026, 2, 28));
    expect(dates.map(iso)).toEqual([
      "2025-11-30",
      "2025-12-30",
      "2026-01-30",
      "2026-02-28", // clamped and equal to endDate, so included
    ]);
  });
});

describe("seedRentPayments", () => {
  type Tx = Parameters<typeof seedRentPayments>[0];
  type CreateManyArgs = { data: Array<Record<string, unknown>> };

  function makeTx(existingCount: number) {
    const calls: CreateManyArgs[] = [];
    const tx = {
      payments: {
        count: async () => existingCount,
        createMany: async (args: CreateManyArgs) => {
          calls.push(args);
          return { count: args.data.length };
        },
      },
    } as unknown as Tx;
    return { tx, calls };
  }

  const baseInput = {
    leaseId: "lease-1",
    tenantId: "tenant-1",
    rentAmount: 1000,
    startDate: utc(2026, 1, 1),
    endDate: utc(2026, 3, 1),
  };

  it("no-ops when the lease already has payments", async () => {
    const { tx, calls } = makeTx(2);
    await seedRentPayments(tx, baseInput);
    expect(calls).toHaveLength(0);
  });

  it("no-ops when the date range yields no due dates", async () => {
    const { tx, calls } = makeTx(0);
    await seedRentPayments(tx, {
      ...baseInput,
      startDate: utc(2026, 4, 15),
      endDate: utc(2026, 4, 10),
    });
    expect(calls).toHaveLength(0);
  });

  it("creates one pending rent row per month with full metadata", async () => {
    const { tx, calls } = makeTx(0);
    await seedRentPayments(tx, baseInput);
    expect(calls).toHaveLength(1);
    const rows = calls[0].data;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      lease_id: "lease-1",
      tenant_id: "tenant-1",
      amount: 1000,
      type: "rent",
      status: "pending",
      due_date: utc(2026, 1, 1),
      notes: "Monthly rent",
    });
    expect(rows.map((r) => iso(r.due_date as Date))).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  it("bills month 1 at full rent and applies the credit from month 2 onward", async () => {
    const { tx, calls } = makeTx(0);
    await seedRentPayments(tx, { ...baseInput, monthlyRentCredit: 150 });
    const rows = calls[0].data;
    expect(rows.map((r) => r.amount)).toEqual([1000, 850, 850]);
    expect(rows[0].notes).toBe("Monthly rent");
    expect(rows[1].notes).toBe("Monthly rent (credit $150.00 applied)");
    expect(rows[2].notes).toBe("Monthly rent (credit $150.00 applied)");
  });

  it("treats null, undefined, zero, and negative credits as no credit", async () => {
    for (const monthlyRentCredit of [null, undefined, 0, -50]) {
      const { tx, calls } = makeTx(0);
      await seedRentPayments(tx, { ...baseInput, monthlyRentCredit });
      const rows = calls[0].data;
      expect(rows.map((r) => r.amount)).toEqual([1000, 1000, 1000]);
      expect(rows.every((r) => r.notes === "Monthly rent")).toBe(true);
    }
  });

  it("floors credited months at $0 when the credit exceeds rent", async () => {
    const { tx, calls } = makeTx(0);
    await seedRentPayments(tx, {
      ...baseInput,
      rentAmount: 500,
      monthlyRentCredit: 750,
    });
    const rows = calls[0].data;
    expect(rows.map((r) => r.amount)).toEqual([500, 0, 0]);
    expect(rows[1].notes).toBe("Monthly rent (credit $750.00 applied)");
  });

  it("rounds credited amounts to cents and formats the note to two decimals", async () => {
    const { tx, calls } = makeTx(0);
    await seedRentPayments(tx, {
      ...baseInput,
      rentAmount: 1000.1,
      monthlyRentCredit: 100.05,
    });
    const rows = calls[0].data;
    // Month 1 passes rentAmount through untouched; later months go through computeNetRent.
    expect(rows[0].amount).toBe(1000.1);
    expect(rows[1].amount).toBe(900.05);
    expect(rows[1].notes).toBe("Monthly rent (credit $100.05 applied)");
  });

  it("seeds 12 months for an open-ended lease", async () => {
    const { tx, calls } = makeTx(0);
    await seedRentPayments(tx, { ...baseInput, endDate: null });
    expect(calls[0].data).toHaveLength(12);
  });
});
