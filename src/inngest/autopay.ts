import { inngest } from "@/inngest/client";
import { chargeAutopayPayment, getAutopayChargesDue } from "@/lib/renter-payments";

/**
 * Charges due rent for tenants who have auto-pay enabled.
 *
 * Runs every morning, and can also be kicked off on demand by sending a
 * `renter/autopay.run` event (used for testing and manual reruns). Each due
 * charge runs in its own step so a single decline retries in isolation without
 * re-charging the others.
 */
export const autopayChargeDueRent = inngest.createFunction(
  {
    id: "autopay-charge-due-rent",
    name: "Auto-pay due rent charges",
    // The daily cron must only run in production. Preview/branch environments
    // register the same function, but must never charge rent on a schedule —
    // so the cron trigger is added only when VERCEL_ENV is "production". The
    // manual `renter/autopay.run` event stays enabled everywhere for testing.
    triggers: [
      ...(process.env.VERCEL_ENV === "production"
        ? [{ cron: "TZ=America/New_York 0 8 * * *" }]
        : []),
      { event: "renter/autopay.run" },
    ],
  },
  async ({ step }) => {
    const candidates = await step.run("select-due-autopay-charges", () =>
      getAutopayChargesDue(),
    );

    const results = [];
    for (const candidate of candidates) {
      results.push(
        await step.run(`charge-${candidate.paymentId}`, () =>
          chargeAutopayPayment(candidate),
        ),
      );
    }

    return { processed: candidates.length, results };
  },
);
