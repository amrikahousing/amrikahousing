import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import twilio from "twilio";
import { NextRequest } from "next/server";
import { POST as twilioWebhook } from "@/app/api/webhooks/twilio/route";
import { prisma } from "@/lib/db";
import { NOTIFICATION_SMS } from "./fixtures";

// The route validates the signature against smsStatusCallbackUrl(); pin it so
// the URL Twilio "signed" is deterministic regardless of local env config.
const WEBHOOK_URL = "http://localhost/api/webhooks/twilio";

function sign(params: Record<string, string>) {
  // .trim() mirrors the route: .env.local can carry stray whitespace around the token.
  return twilio.getExpectedTwilioSignature(
    process.env.TWILIO_AUTH_TOKEN!.trim(),
    WEBHOOK_URL,
    params,
  );
}

function twilioRequest(params: Record<string, string>, signature?: string) {
  return new NextRequest(WEBHOOK_URL, {
    method: "POST",
    body: new URLSearchParams(params).toString(),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(signature !== undefined ? { "x-twilio-signature": signature } : {}),
    },
  });
}

describe("POST /api/webhooks/twilio", () => {
  beforeEach(() => {
    vi.stubEnv("TWILIO_STATUS_CALLBACK_URL", WEBHOOK_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when messaging is not configured", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const res = await twilioWebhook(
      twilioRequest({ MessageSid: NOTIFICATION_SMS.providerSid, MessageStatus: "delivered" }),
    );
    expect(res.status).toBe(503);
  });

  it("rejects a request without a Twilio signature header", async () => {
    const res = await twilioWebhook(
      twilioRequest({ MessageSid: NOTIFICATION_SMS.providerSid, MessageStatus: "delivered" }),
    );
    expect(res.status).toBe(401);
    const { error } = await res.json();
    expect(error).toMatch(/Invalid signature/);
  });

  it("rejects a request whose params do not match the signature", async () => {
    const signature = sign({
      MessageSid: NOTIFICATION_SMS.providerSid,
      MessageStatus: "delivered",
    });
    const res = await twilioWebhook(
      twilioRequest(
        { MessageSid: NOTIFICATION_SMS.providerSid, MessageStatus: "failed" },
        signature,
      ),
    );
    expect(res.status).toBe(401);

    const notification = await prisma.notifications_sent.findUniqueOrThrow({
      where: { id: NOTIFICATION_SMS.id },
    });
    expect(notification.status).toBe("sent");
  });

  it("acknowledges a signed receipt for an unknown message sid without side effects", async () => {
    const params = { MessageSid: "SM0integration_unknown_sid_0000000", MessageStatus: "delivered" };
    const res = await twilioWebhook(twilioRequest(params, sign(params)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("records a delivered receipt on the matching notification", async () => {
    const params = {
      MessageSid: NOTIFICATION_SMS.providerSid,
      MessageStatus: "delivered",
      To: NOTIFICATION_SMS.toPhone,
    };
    const res = await twilioWebhook(twilioRequest(params, sign(params)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const notification = await prisma.notifications_sent.findUniqueOrThrow({
      where: { id: NOTIFICATION_SMS.id },
    });
    expect(notification.status).toBe("delivered");
    expect(notification.error_reason).toBeNull();
  });

  it("maps undelivered to failed and persists the carrier error reason", async () => {
    const params = {
      MessageSid: NOTIFICATION_SMS.providerSid,
      MessageStatus: "undelivered",
      ErrorCode: "30032",
      ErrorMessage: "Toll-Free Number Has Not Been Verified",
    };
    const res = await twilioWebhook(twilioRequest(params, sign(params)));
    expect(res.status).toBe(200);

    const notification = await prisma.notifications_sent.findUniqueOrThrow({
      where: { id: NOTIFICATION_SMS.id },
    });
    expect(notification.status).toBe("failed");
    expect(notification.error_reason).toBe(
      "twilio_30032: Toll-Free Number Has Not Been Verified",
    );
  });
});
