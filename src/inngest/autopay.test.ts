import { InngestTestEngine } from "@inngest/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  AutopayChargeCandidate,
  AutopayChargeResult,
} from "@/lib/renter-payments";

vi.mock("@/lib/renter-payments", () => ({
  getAutopayChargesDue: vi.fn(),
  chargeAutopayPayment: vi.fn(),
}));

import { autopayChargeDueRent } from "@/inngest/autopay";
import { chargeAutopayPayment, getAutopayChargesDue } from "@/lib/renter-payments";

const getAutopayChargesDueMock = vi.mocked(getAutopayChargesDue);
const chargeAutopayPaymentMock = vi.mocked(chargeAutopayPayment);

function makeCandidate(paymentId: string): AutopayChargeCandidate {
  return {
    tenantId: `tenant-${paymentId}`,
    organizationId: "org-1",
    sharedUserId: null,
    paymentId,
    paymentMethodId: `pm-${paymentId}`,
    amount: "1200.00",
  };
}

function charged(paymentId: string): AutopayChargeResult {
  return {
    paymentId,
    outcome: "charged",
    paymentIntentId: `pi-${paymentId}`,
    stripeStatus: "succeeded",
  };
}

function declined(paymentId: string): AutopayChargeResult {
  return {
    paymentId,
    outcome: "failed",
    paymentIntentId: `pi-${paymentId}`,
    stripeStatus: "requires_payment_method",
    failureCode: "card_declined",
    failureMessage: "Your card was declined.",
  };
}

const runEvent = { name: "renter/autopay.run", data: {} };

function makeEngine() {
  return new InngestTestEngine({
    function: autopayChargeDueRent,
    events: [runEvent],
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("autopayChargeDueRent", () => {
  test("returns processed: 0 and charges nothing when no charges are due", async () => {
    getAutopayChargesDueMock.mockResolvedValue([]);

    const { result, ctx } = await makeEngine().execute();

    expect(result).toEqual({ processed: 0, results: [] });
    expect(getAutopayChargesDueMock).toHaveBeenCalledTimes(1);
    // getAutopayChargesDue is called with no arguments so it defaults to "now".
    expect(getAutopayChargesDueMock).toHaveBeenCalledWith();
    expect(chargeAutopayPaymentMock).not.toHaveBeenCalled();
    expect(ctx.step.run).toHaveBeenCalledWith(
      "select-due-autopay-charges",
      expect.any(Function),
    );
  });

  test("charges each due candidate in its own step, in order", async () => {
    const candidates = [makeCandidate("pay-1"), makeCandidate("pay-2")];
    getAutopayChargesDueMock.mockResolvedValue(candidates);
    chargeAutopayPaymentMock.mockImplementation(async (candidate) =>
      charged(candidate.paymentId),
    );

    const { result, ctx } = await makeEngine().execute();

    expect(result).toEqual({
      processed: 2,
      results: [charged("pay-1"), charged("pay-2")],
    });

    // One selector call, one charge call per candidate — steps are memoized
    // across the engine's repeated executions, so no double charging.
    expect(getAutopayChargesDueMock).toHaveBeenCalledTimes(1);
    expect(chargeAutopayPaymentMock).toHaveBeenCalledTimes(2);
    expect(chargeAutopayPaymentMock).toHaveBeenNthCalledWith(1, candidates[0]);
    expect(chargeAutopayPaymentMock).toHaveBeenNthCalledWith(2, candidates[1]);

    // Each charge runs in its own named step keyed by payment id.
    expect(ctx.step.run).toHaveBeenCalledWith("charge-pay-1", expect.any(Function));
    expect(ctx.step.run).toHaveBeenCalledWith("charge-pay-2", expect.any(Function));
  });

  test("a declined charge (failed outcome) does not abort the rest of the batch", async () => {
    const candidates = [
      makeCandidate("pay-1"),
      makeCandidate("pay-2"),
      makeCandidate("pay-3"),
    ];
    getAutopayChargesDueMock.mockResolvedValue(candidates);
    chargeAutopayPaymentMock.mockImplementation(async (candidate) =>
      candidate.paymentId === "pay-2"
        ? declined(candidate.paymentId)
        : charged(candidate.paymentId),
    );

    const { result, error } = await makeEngine().execute();

    expect(error).toBeUndefined();
    expect(result).toEqual({
      processed: 3,
      results: [charged("pay-1"), declined("pay-2"), charged("pay-3")],
    });
    expect(chargeAutopayPaymentMock).toHaveBeenCalledTimes(3);
  });

  test("an unexpected thrown error in one charge step fails the run without re-charging earlier candidates", async () => {
    const candidates = [makeCandidate("pay-1"), makeCandidate("pay-2")];
    getAutopayChargesDueMock.mockResolvedValue(candidates);
    chargeAutopayPaymentMock.mockImplementation(async (candidate) => {
      if (candidate.paymentId === "pay-2") {
        throw new Error("stripe exploded");
      }
      return charged(candidate.paymentId);
    });

    const { result, error } = await makeEngine().execute();

    expect(result).toBeUndefined();
    expect(error).toMatchObject({ name: "Error", message: "stripe exploded" });
    // The successful earlier charge was executed exactly once (memoized), and
    // the failing one was attempted once (the test engine models no retries).
    expect(
      chargeAutopayPaymentMock.mock.calls.filter(([c]) => c.paymentId === "pay-1"),
    ).toHaveLength(1);
    expect(
      chargeAutopayPaymentMock.mock.calls.filter(([c]) => c.paymentId === "pay-2"),
    ).toHaveLength(1);
  });

  test("downstream charge steps consume the selector step's state, not a fresh query", async () => {
    const candidates = [makeCandidate("pay-9")];
    chargeAutopayPaymentMock.mockImplementation(async (candidate) =>
      charged(candidate.paymentId),
    );

    const { result } = await makeEngine().execute({
      steps: [
        {
          id: "select-due-autopay-charges",
          handler: () => candidates,
        },
      ],
    });

    expect(result).toEqual({ processed: 1, results: [charged("pay-9")] });
    // The selector step was mocked, so the real lib function is never touched.
    expect(getAutopayChargesDueMock).not.toHaveBeenCalled();
    expect(chargeAutopayPaymentMock).toHaveBeenCalledWith(candidates[0]);
  });
});

describe("autopayChargeDueRent triggers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function triggersOf(fn: unknown): Array<Record<string, unknown>> {
    return (
      (fn as { opts: { triggers?: Array<Record<string, unknown>> } }).opts
        .triggers ?? []
    );
  }

  async function importAutopayFresh() {
    vi.resetModules();
    return import("@/inngest/autopay");
  }

  test("registers the daily cron only when VERCEL_ENV is production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const mod = await importAutopayFresh();

    expect(triggersOf(mod.autopayChargeDueRent)).toEqual([
      { cron: "TZ=America/New_York 0 8 * * *" },
      { event: "renter/autopay.run" },
    ]);
  });

  test("keeps only the manual event trigger in preview environments", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const mod = await importAutopayFresh();

    expect(triggersOf(mod.autopayChargeDueRent)).toEqual([
      { event: "renter/autopay.run" },
    ]);
  });
});
