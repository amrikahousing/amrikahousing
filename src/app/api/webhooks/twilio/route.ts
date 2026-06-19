import twilio from "twilio";
import { prisma } from "@/lib/db";
import { smsStatusCallbackUrl } from "@/lib/messaging";

// Map Twilio MessageStatus values onto our notifications_sent.status values.
function mapTwilioStatus(status: string): string {
  switch (status) {
    case "delivered":
      return "delivered";
    case "undelivered":
    case "failed":
      return "failed";
    case "sent":
      return "sent";
    case "queued":
    case "sending":
      return "queued";
    default:
      return status;
  }
}

/**
 * Twilio delivery-receipt webhook. Verifies Twilio's request signature, then
 * updates the matching notifications_sent row (by provider_sid) with the latest
 * delivery status. Mirrors the secret-check pattern in the DocuSeal webhook.
 */
export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    return Response.json({ error: "Messaging not configured." }, { status: 503 });
  }

  const signature = request.headers.get("x-twilio-signature") ?? "";

  const params: Record<string, string> = {};
  try {
    const formData = await request.formData();
    for (const [key, value] of formData.entries()) {
      params[key] = typeof value === "string" ? value : "";
    }
  } catch {
    return Response.json({ error: "Invalid payload." }, { status: 400 });
  }

  // Validate against the exact URL Twilio signed (the configured statusCallback),
  // falling back to the incoming request URL.
  const url = smsStatusCallbackUrl() ?? new URL(request.url).toString();
  if (!twilio.validateRequest(authToken, signature, url, params)) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const sid = params.MessageSid || params.SmsSid;
  const status = params.MessageStatus || params.SmsStatus;
  if (sid && status) {
    // On undelivered/failed, Twilio includes the carrier ErrorCode (e.g. 30032
    // toll-free not verified, 30007 carrier filtered). Persist it so the reason
    // a message never reached the handset is visible in the DB, not just logs.
    const errorReason =
      params.ErrorCode && params.ErrorCode !== "0"
        ? `twilio_${params.ErrorCode}${params.ErrorMessage ? `: ${params.ErrorMessage}` : ""}`
        : undefined;
    await prisma.notifications_sent.updateMany({
      where: { provider_sid: sid },
      data: {
        status: mapTwilioStatus(status),
        ...(errorReason ? { error_reason: errorReason } : {}),
        updated_at: new Date(),
      },
    });
  }

  return Response.json({ received: true });
}
