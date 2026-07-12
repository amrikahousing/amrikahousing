import { describe, it, expect } from "vitest";
import {
  ACCOUNTING_CATEGORY_OPTIONS,
  canonicalAccountingCategory,
  cleanAccountingCategory,
  mergeAccountingCategoryOptions,
} from "@/lib/accounting-categories";

describe("cleanAccountingCategory", () => {
  it("trims surrounding whitespace", () => {
    expect(cleanAccountingCategory("  Rent  ")).toBe("Rent");
  });

  it("collapses internal whitespace (spaces, tabs, newlines) to single spaces", () => {
    expect(cleanAccountingCategory("Repairs \t and\n\nmaintenance")).toBe(
      "Repairs and maintenance",
    );
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(cleanAccountingCategory("")).toBe("");
    expect(cleanAccountingCategory("   \t\n ")).toBe("");
  });

  it("truncates to 80 characters after collapsing whitespace", () => {
    expect(cleanAccountingCategory("x".repeat(100))).toHaveLength(80);
    // Collapse and trim happen before the slice, so the cut can land on a
    // collapsed internal space and leave it trailing.
    expect(cleanAccountingCategory(`${"a".repeat(79)}    bcd`)).toBe(
      `${"a".repeat(79)} `,
    );
  });
});

describe("canonicalAccountingCategory", () => {
  it("returns the canonical option for an exact match", () => {
    expect(canonicalAccountingCategory("Rent")).toBe("Rent");
  });

  it("maps case-insensitively to the canonical casing", () => {
    expect(canonicalAccountingCategory("rent")).toBe("Rent");
    expect(canonicalAccountingCategory("REPAIRS AND MAINTENANCE")).toBe(
      "Repairs and maintenance",
    );
  });

  it("normalizes whitespace before matching", () => {
    expect(canonicalAccountingCategory("  bank\t\tFEES ")).toBe("Bank fees");
  });

  it("returns the cleaned input unchanged when no option matches", () => {
    expect(canonicalAccountingCategory("  Landscaping   services ")).toBe(
      "Landscaping services",
    );
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(canonicalAccountingCategory("")).toBe("");
    expect(canonicalAccountingCategory("   ")).toBe("");
  });

  it("matches against a custom option list when provided", () => {
    expect(canonicalAccountingCategory("gym", ["Gym", "Spa"])).toBe("Gym");
    // Default options are not consulted when a custom list is passed.
    expect(canonicalAccountingCategory("rent", ["Gym"])).toBe("rent");
  });

  it("trims options for comparison but returns the option verbatim", () => {
    expect(canonicalAccountingCategory("zoo", ["  Zoo  "])).toBe("  Zoo  ");
  });
});

describe("mergeAccountingCategoryOptions", () => {
  it("returns all default options, sorted, when given no extras", () => {
    const merged = mergeAccountingCategoryOptions([]);
    expect(merged).toHaveLength(ACCOUNTING_CATEGORY_OPTIONS.length);
    for (const option of ACCOUNTING_CATEGORY_OPTIONS) {
      expect(merged).toContain(option);
    }
    expect(merged).toEqual([...merged].sort((a, b) => a.localeCompare(b)));
  });

  it("dedupes case-insensitively, keeping the default option's casing", () => {
    const merged = mergeAccountingCategoryOptions(["rent", "BANK FEES"]);
    expect(merged).toContain("Rent");
    expect(merged).not.toContain("rent");
    expect(merged).toContain("Bank fees");
    expect(merged.filter((o) => o.toLowerCase() === "rent")).toHaveLength(1);
  });

  it("adds unknown categories with whitespace normalized", () => {
    const merged = mergeAccountingCategoryOptions(["  Pet   fees "]);
    expect(merged).toContain("Pet fees");
  });

  it("keeps the first-seen casing among duplicate custom categories", () => {
    const merged = mergeAccountingCategoryOptions(["Pet FEES", "pet fees"]);
    expect(merged).toContain("Pet FEES");
    expect(merged).not.toContain("pet fees");
  });

  it("skips empty and whitespace-only entries", () => {
    const merged = mergeAccountingCategoryOptions(["", "   ", "\t"]);
    expect(merged).toHaveLength(ACCOUNTING_CATEGORY_OPTIONS.length);
    expect(merged).not.toContain("");
  });

  it("returns a locale-sorted list including custom entries", () => {
    const merged = mergeAccountingCategoryOptions(["Zzz custom", "Aaa custom"]);
    expect(merged).toEqual([...merged].sort((a, b) => a.localeCompare(b)));
    expect(merged[merged.length - 1]).toBe("Zzz custom");
  });
});
