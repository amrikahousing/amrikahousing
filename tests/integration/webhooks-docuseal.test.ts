import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The completed path stores the signed PDF via @vercel/blob; mock it so no
// spec can ever reach real blob storage (the declined path never uploads).
vi.mock("@vercel/blob", async () => (await import("./blob-mock")).blobMock());

import { NextRequest } from "next/server";
import { POST as docusealWebhook } from "@/app/api/webhooks/docuseal/route";
import { prisma } from "@/lib/db";
import { LEASE_PENDING, SIGNATURE_REQUEST_PENDING } from "./fixtures";

// The route compares against DOCUSEAL_WEBHOOK_SECRET (not DOCUSEAL_API_SECRET,
// which is what .env.local carries), so the suite pins its own value.
const WEBHOOK_SECRET = "integration-docuseal-webhook-secret";

function webhookRequest(body: unknown, secret?: string) {
  return new NextRequest("http://localhost/api/webhooks/docuseal", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(secret !== undefined ? { "x-docuseal-webhook-secret": secret } : {}),
    },
  });
}

describe("POST /api/webhooks/docuseal", () => {
  beforeEach(() => {
    vi.stubEnv("DOCUSEAL_WEBHOOK_SECRET", WEBHOOK_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a request without the webhook secret header", async () => {
    const res = await docusealWebhook(webhookRequest({ event_type: "submission.completed" }));
    expect(res.status).toBe(401);
    const { error } = await res.json();
    expect(error).toMatch(/Invalid webhook secret/);
  });

  it("rejects a request with the wrong webhook secret", async () => {
    const res = await docusealWebhook(
      webhookRequest({ event_type: "submission.completed" }, "not-the-secret"),
    );
    expect(res.status).toBe(401);
  });

  it("rejects every request while no webhook secret is configured", async () => {
    vi.stubEnv("DOCUSEAL_WEBHOOK_SECRET", "");
    const res = await docusealWebhook(webhookRequest({ event_type: "submission.completed" }, ""));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an authenticated payload without a submission id", async () => {
    const res = await docusealWebhook(
      webhookRequest({ event_type: "form.viewed", data: {} }, WEBHOOK_SECRET),
    );
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error).toMatch(/Missing DocuSeal submission id/);
  });

  it("reports not_found for a submission it has no signature request for", async () => {
    const res = await docusealWebhook(
      webhookRequest(
        { event_type: "form.declined", data: { submission: { id: 424242 } } },
        WEBHOOK_SECRET,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ synced: false, reason: "not_found" });
  });

  it("marks the seeded signature request declined on form.declined", async () => {
    const res = await docusealWebhook(
      webhookRequest(
        {
          event_type: "form.declined",
          data: {
            submission: { id: Number(SIGNATURE_REQUEST_PENDING.providerDocumentId) },
          },
        },
        WEBHOOK_SECRET,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ synced: true, status: "declined" });

    const request = await prisma.lease_signature_requests.findUniqueOrThrow({
      where: { id: SIGNATURE_REQUEST_PENDING.id },
    });
    expect(request.status).toBe("declined");
    expect(request.last_synced_at).not.toBeNull();

    // A declined signature must not activate the lease.
    const lease = await prisma.leases.findUniqueOrThrow({ where: { id: LEASE_PENDING.id } });
    expect(lease.status).toBe("pending_signature");
  });
});
