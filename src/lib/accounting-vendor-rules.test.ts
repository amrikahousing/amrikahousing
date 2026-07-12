import { describe, it, expect } from "vitest";
import type { AccountingTransaction } from "@/lib/accounting";
import {
  cleanVendorName,
  findVendorRuleForTransaction,
  normalizeRuleContext,
  normalizeVendorKey,
  type AccountingVendorRule,
} from "@/lib/accounting-vendor-rules";

describe("normalizeVendorKey", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeVendorKey("Blue-Bottle_Coffee!")).toBe("blue bottle coffee");
  });

  it("removes 4+ digit numbers but keeps 1-3 digit numbers", () => {
    expect(normalizeVendorKey("STARBUCKS #1234")).toBe("starbucks");
    expect(normalizeVendorKey("STARBUCKS 123")).toBe("starbucks 123");
  });

  it("removes date fragments like 07/03 and 7/1/2026", () => {
    expect(normalizeVendorKey("UBER TRIP 07/03")).toBe("uber trip");
    expect(normalizeVendorKey("NETFLIX 7/1/2026")).toBe("netflix");
  });

  it("expands & to 'and'", () => {
    expect(normalizeVendorKey("AT&T")).toBe("at and t");
  });

  it("strips noisy processor prefixes", () => {
    expect(normalizeVendorKey("Debit Card Purchase Starbucks")).toBe("starbucks");
    expect(normalizeVendorKey("POS PURCHASE WALMART")).toBe("walmart");
    expect(normalizeVendorKey("SQ *BLUE BOTTLE")).toBe("blue bottle");
    expect(normalizeVendorKey("TST* JOES PIZZA")).toBe("joes pizza");
    expect(normalizeVendorKey("PURCHASE AUTHORIZED ON 07/03 UBER TRIP")).toBe(
      "uber trip",
    );
  });

  it("strips stacked prefixes in declaration order only (no second pass)", () => {
    expect(normalizeVendorKey("PENDING DEBIT CARD PURCHASE TARGET")).toBe("target");
    // "pending" appears earlier in the prefix list than "debit card purchase",
    // so once the loop has passed it, it is not stripped again.
    expect(normalizeVendorKey("DEBIT CARD PURCHASE PENDING TARGET")).toBe(
      "pending target",
    );
  });

  it("returns empty string when the description is only a noisy prefix", () => {
    expect(normalizeVendorKey("PayPal")).toBe("");
    expect(normalizeVendorKey("PAYPAL *NETFLIX")).toBe("netflix");
  });

  it("removes corporate suffix words anywhere as whole words", () => {
    expect(normalizeVendorKey("Acme Inc")).toBe("acme");
    expect(normalizeVendorKey("Coffee Co Roasters")).toBe("coffee roasters");
    expect(normalizeVendorKey("The Container Store")).toBe("the container");
    // ...but not inside larger words.
    expect(normalizeVendorKey("Costco")).toBe("costco");
  });

  it("handles empty, punctuation-only, and accented input", () => {
    expect(normalizeVendorKey("")).toBe("");
    expect(normalizeVendorKey("***##--")).toBe("");
    // Non-ASCII letters are dropped, not transliterated.
    expect(normalizeVendorKey("Café Münch")).toBe("caf m nch");
  });

  it("strips checkcard prefix and long reference numbers together", () => {
    expect(normalizeVendorKey("CHECKCARD 0712 TRADER JOES")).toBe("trader joes");
  });
});

describe("cleanVendorName", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanVendorName("  Blue   Bottle  ")).toBe("Blue Bottle");
  });

  it("replaces * and # runs with a space (leaving the pre-collapsed gap)", () => {
    // Whitespace is collapsed before * / # are replaced, so a "* " becomes
    // two spaces in the output.
    expect(cleanVendorName("SQ *BLUE BOTTLE")).toBe("SQ  BLUE BOTTLE");
    expect(cleanVendorName("#42 Market")).toBe("42 Market");
  });

  it("falls back to 'Vendor' for empty or symbol-only input", () => {
    expect(cleanVendorName("")).toBe("Vendor");
    expect(cleanVendorName("   ")).toBe("Vendor");
    expect(cleanVendorName("***##")).toBe("Vendor");
  });

  it("truncates to 120 characters", () => {
    expect(cleanVendorName("A".repeat(150))).toHaveLength(120);
  });
});

describe("normalizeRuleContext", () => {
  it("returns empty string for null and undefined", () => {
    expect(normalizeRuleContext(null)).toBe("");
    expect(normalizeRuleContext(undefined)).toBe("");
  });

  it("trims and collapses whitespace", () => {
    expect(normalizeRuleContext("  Chase   Bank ")).toBe("Chase Bank");
    expect(normalizeRuleContext("")).toBe("");
  });
});

describe("findVendorRuleForTransaction", () => {
  function rule(overrides: Partial<AccountingVendorRule>): AccountingVendorRule {
    return {
      id: "rule-1",
      vendor_key: "starbucks",
      vendor_name: "Starbucks",
      category: "Meals",
      bank: "",
      account: "",
      confidence: null,
      reason: null,
      ...overrides,
    };
  }

  type TxInput = Pick<
    AccountingTransaction,
    "description" | "bank" | "account" | "source"
  >;

  function tx(overrides: Partial<TxInput> = {}): TxInput {
    return {
      description: "STARBUCKS #1234",
      bank: "Chase",
      account: "Checking",
      source: "plaid",
      ...overrides,
    };
  }

  it("returns null for non-plaid transactions", () => {
    expect(
      findVendorRuleForTransaction(tx({ source: "manual" }), [rule({})]),
    ).toBeNull();
  });

  it("returns null when the description normalizes to an empty vendor key", () => {
    expect(
      findVendorRuleForTransaction(tx({ description: "PayPal" }), [
        rule({ vendor_key: "" }),
      ]),
    ).toBeNull();
  });

  it("matches on the normalized vendor key of the description", () => {
    const generic = rule({ id: "generic" });
    expect(
      findVendorRuleForTransaction(
        tx({ description: "DEBIT CARD PURCHASE STARBUCKS 5678" }),
        [generic],
      ),
    ).toBe(generic);
  });

  it("returns null when no rule has the matching vendor key", () => {
    expect(
      findVendorRuleForTransaction(tx(), [rule({ vendor_key: "walmart" })]),
    ).toBeNull();
  });

  it("skips rules scoped to a different bank or account", () => {
    expect(
      findVendorRuleForTransaction(tx(), [rule({ bank: "Wells Fargo" })]),
    ).toBeNull();
    expect(
      findVendorRuleForTransaction(tx(), [rule({ account: "Savings" })]),
    ).toBeNull();
  });

  it("matches bank/account-scoped rules when the scope agrees", () => {
    const scoped = rule({ bank: "Chase", account: "Checking" });
    expect(findVendorRuleForTransaction(tx(), [scoped])).toBe(scoped);
  });

  it("prefers more specific rules regardless of array order", () => {
    const generic = rule({ id: "generic" });
    const bankOnly = rule({ id: "bank-only", bank: "Chase" });
    const bankAndAccount = rule({
      id: "bank-account",
      bank: "Chase",
      account: "Checking",
    });

    expect(
      findVendorRuleForTransaction(tx(), [generic, bankOnly, bankAndAccount]),
    ).toBe(bankAndAccount);
    expect(findVendorRuleForTransaction(tx(), [generic, bankOnly])).toBe(bankOnly);
  });

  it("scores an account-only rule above a generic one", () => {
    const generic = rule({ id: "generic" });
    const accountOnly = rule({ id: "account-only", account: "Checking" });
    expect(findVendorRuleForTransaction(tx(), [generic, accountOnly])).toBe(
      accountOnly,
    );
  });

  it("breaks ties by keeping the first rule in the array", () => {
    const first = rule({ id: "first" });
    const second = rule({ id: "second" });
    expect(findVendorRuleForTransaction(tx(), [first, second])).toBe(first);
  });

  it("returns null when given no rules", () => {
    expect(findVendorRuleForTransaction(tx(), [])).toBeNull();
  });
});
