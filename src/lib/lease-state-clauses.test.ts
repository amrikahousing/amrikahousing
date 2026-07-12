import { describe, it, expect, vi, beforeEach } from "vitest";

const { upsert } = vi.hoisted(() => ({
  upsert: vi.fn(async (_args: unknown) => ({})),
}));

vi.mock("@/lib/db", () => ({
  prisma: { lease_state_specific_clauses: { upsert } },
}));

import { syncStateSpecificLeaseClauses } from "@/lib/lease-state-clauses";

const ORG = "org_123";

beforeEach(() => {
  upsert.mockClear();
});

describe("syncStateSpecificLeaseClauses", () => {
  it("returns 0 and skips the DB when there are no state law notes", async () => {
    const count = await syncStateSpecificLeaseClauses({
      organizationId: ORG,
      propertyState: "TX",
      reviewData: { extractedTerms: { state: "TX" }, stateLawNotes: [] },
    });
    expect(count).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 0 and skips the DB when no state can be resolved", async () => {
    const count = await syncStateSpecificLeaseClauses({
      organizationId: ORG,
      propertyState: "   ",
      reviewData: {
        extractedTerms: { state: 42 }, // non-string is ignored
        stateLawNotes: [{ area: "deposits", note: "Cap is 2x rent", risk: "warning" }],
      },
    });
    expect(count).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 0 when reviewData is null even if a property state exists (notes only come from the review)", async () => {
    const count = await syncStateSpecificLeaseClauses({
      organizationId: ORG,
      propertyState: "CA",
      reviewData: null,
    });
    expect(count).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("prefers the extracted state over the property state and uppercases it", async () => {
    await syncStateSpecificLeaseClauses({
      organizationId: ORG,
      propertyState: "ny",
      reviewData: {
        extractedTerms: { state: " tx " },
        stateLawNotes: [{ area: "deposits", note: "Note", risk: "info" }],
      },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0]![0] as {
      where: { organization_id_state_area: { organization_id: string; state: string; area: string } };
    };
    expect(args.where.organization_id_state_area).toEqual({
      organization_id: ORG,
      state: "TX",
      area: "deposits",
    });
  });

  it("falls back to the property state when the extracted state is blank", async () => {
    await syncStateSpecificLeaseClauses({
      organizationId: ORG,
      propertyState: " nj ",
      reviewData: {
        extractedTerms: { state: "  " },
        stateLawNotes: [{ area: "notice", note: "30 days required", risk: "warning" }],
      },
    });
    const args = upsert.mock.calls[0]![0] as {
      where: { organization_id_state_area: { state: string } };
    };
    expect(args.where.organization_id_state_area.state).toBe("NJ");
  });

  it("skips notes missing area or note text and counts only the persisted ones", async () => {
    const count = await syncStateSpecificLeaseClauses({
      organizationId: ORG,
      propertyState: "FL",
      reviewData: {
        stateLawNotes: [
          { area: "deposits", note: "Valid", risk: "info" },
          { area: "  ", note: "No area", risk: "warning" },
          { area: "entry", note: "", risk: "warning" },
          { area: 7, note: "Non-string area", risk: "info" },
          { area: "late-fees", note: "Also valid" },
        ],
      },
    });
    expect(count).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("keeps known risk levels (case-insensitive) and defaults everything else to info", async () => {
    await syncStateSpecificLeaseClauses({
      organizationId: ORG,
      propertyState: "WA",
      reviewData: {
        stateLawNotes: [
          { area: "a1", note: "n1", risk: " WARNING " },
          { area: "a2", note: "n2", risk: "Caution" },
          { area: "a3", note: "n3", risk: "severe" },
          { area: "a4", note: "n4" },
        ],
      },
    });
    const risks = upsert.mock.calls.map(
      (call) => (call[0] as { create: { risk: string } }).create.risk,
    );
    expect(risks).toEqual(["warning", "caution", "info", "info"]);
  });

  it("sends trimmed note text in both create and update payloads with a fresh updated_at", async () => {
    await syncStateSpecificLeaseClauses({
      organizationId: ORG,
      propertyState: "CO",
      reviewData: {
        stateLawNotes: [{ area: " deposits ", note: "  Deposit cap applies.  ", risk: "warning" }],
      },
    });
    const args = upsert.mock.calls[0]![0] as {
      create: { organization_id: string; state: string; area: string; note: string; risk: string };
      update: { note: string; risk: string; updated_at: Date };
    };
    expect(args.create).toEqual({
      organization_id: ORG,
      state: "CO",
      area: "deposits",
      note: "Deposit cap applies.",
      risk: "warning",
    });
    expect(args.update.note).toBe("Deposit cap applies.");
    expect(args.update.risk).toBe("warning");
    expect(args.update.updated_at).toBeInstanceOf(Date);
  });
});
