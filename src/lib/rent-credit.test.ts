import { describe, it, expect } from "vitest";
import {
  roundCurrency,
  computeNetRent,
  buildMonthlyBreakdown,
  type BreakdownPaymentInput,
} from "@/lib/rent-credit";

describe("roundCurrency", () => {
  it("returns integers and exact cents unchanged", () => {
    expect(roundCurrency(0)).toBe(0);
    expect(roundCurrency(1500)).toBe(1500);
    expect(roundCurrency(1234.56)).toBe(1234.56);
  });

  it("fixes classic binary floating-point drift (0.1 + 0.2)", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  it("rounds half-cent values up thanks to the EPSILON nudge", () => {
    // 1.005 is stored as 1.00499..., but the EPSILON nudge restores half-up rounding.
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(2.675)).toBe(2.68);
    expect(roundCurrency(999.995)).toBe(1000);
  });

  it("truncates sub-half-cent noise down", () => {
    expect(roundCurrency(1.0049999)).toBe(1);
    expect(roundCurrency(1234.567)).toBe(1234.57);
  });

  it("rounds negative values toward positive infinity at the half-cent (Math.round semantics)", () => {
    expect(roundCurrency(-1.005)).toBe(-1);
    expect(roundCurrency(-1.235)).toBe(-1.23);
    expect(roundCurrency(-1.239)).toBe(-1.24);
  });
});

describe("computeNetRent", () => {
  it("subtracts the credit from rent", () => {
    expect(computeNetRent(1000, 100)).toBe(900);
    expect(computeNetRent(2350.5, 350.5)).toBe(2000);
  });

  it("returns full rent when the credit is zero", () => {
    expect(computeNetRent(1000, 0)).toBe(1000);
  });

  it("clamps negative credits to zero instead of increasing rent", () => {
    expect(computeNetRent(1000, -250)).toBe(1000);
  });

  it("never goes below zero when the credit exceeds rent", () => {
    expect(computeNetRent(500, 750)).toBe(0);
    expect(computeNetRent(500, 500)).toBe(0);
  });

  it("returns zero for zero or negative rent", () => {
    expect(computeNetRent(0, 100)).toBe(0);
    expect(computeNetRent(-800, 0)).toBe(0);
  });

  it("rounds the net amount to cents", () => {
    // 1000.1 - 100.05 = 900.05000000000007 in binary floating point
    expect(computeNetRent(1000.1, 100.05)).toBe(900.05);
    expect(computeNetRent(0.3, 0.1)).toBe(0.2);
  });
});

describe("buildMonthlyBreakdown", () => {
  it("returns an empty array for no payments", () => {
    expect(buildMonthlyBreakdown(1000, [])).toEqual([]);
  });

  it("numbers months chronologically by due date, not input order", () => {
    const payments: BreakdownPaymentInput[] = [
      { amount: 900, dueDate: "2026-03-01" },
      { amount: 1000, dueDate: "2026-01-01" },
      { amount: 900, dueDate: "2026-02-01" },
    ];
    const rows = buildMonthlyBreakdown(1000, payments);
    expect(rows.map((r) => r.dueDate)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    expect(rows.map((r) => r.month)).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const payments: BreakdownPaymentInput[] = [
      { amount: 900, dueDate: "2026-02-01" },
      { amount: 1000, dueDate: "2026-01-01" },
    ];
    buildMonthlyBreakdown(1000, payments);
    expect(payments[0].dueDate).toBe("2026-02-01");
  });

  it("sorts null due dates after dated payments", () => {
    const payments: BreakdownPaymentInput[] = [
      { amount: 500, dueDate: null },
      { amount: 1000, dueDate: "2026-01-01" },
    ];
    const rows = buildMonthlyBreakdown(1000, payments);
    expect(rows[0].dueDate).toBe("2026-01-01");
    expect(rows[1]).toMatchObject({ month: 2, dueDate: null, tenantPays: 500 });
  });

  it("derives the credit as rent minus the billed amount", () => {
    const rows = buildMonthlyBreakdown(1000, [
      { amount: 1000, dueDate: "2026-01-01" },
      { amount: 850, dueDate: "2026-02-01" },
    ]);
    expect(rows[0]).toEqual({
      month: 1,
      dueDate: "2026-01-01",
      leaseRent: 1000,
      creditApplied: 0,
      tenantPays: 1000,
    });
    expect(rows[1]).toEqual({
      month: 2,
      dueDate: "2026-02-01",
      leaseRent: 1000,
      creditApplied: 150,
      tenantPays: 850,
    });
  });

  it("clamps the derived credit to zero when a payment exceeds the lease rent", () => {
    const rows = buildMonthlyBreakdown(1000, [
      { amount: 1200, dueDate: "2026-01-01" },
    ]);
    expect(rows[0].creditApplied).toBe(0);
    expect(rows[0].tenantPays).toBe(1200);
  });

  it("rounds rent, amount, and credit to cents", () => {
    const rows = buildMonthlyBreakdown(1000.005, [
      { amount: 900.0049999, dueDate: "2026-01-01" },
    ]);
    expect(rows[0].leaseRent).toBe(1000.01);
    expect(rows[0].tenantPays).toBe(900);
    // credit derived from the rounded tenantPays: 1000.005 - 900 → rounds to 100.01
    expect(rows[0].creditApplied).toBe(100.01);
  });
});
