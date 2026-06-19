import twilio, { type Twilio } from "twilio";

let twilioClient: Twilio | null = null;

/**
 * SMS messaging via Twilio. Mirrors the lazy-client + config-guard shape of
 * `src/lib/stripe.ts`: callers check `isMessagingConfigured()` (or rely on
 * `sendSms` returning a `skipped` result) so an unconfigured environment is a
 * no-op rather than an error.
 *
 * Channel-shaped internals (`channel: "sms"`) leave room to add a `whatsapp`
 * channel + `TWILIO_WHATSAPP_FROM` later without touching callers.
 */
export function isMessagingConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_SMS_FROM,
  );
}

export function getTwilioClient(): Twilio {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).",
    );
  }
  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

/**
 * Normalize a free-form phone string (DB values are not validated) to E.164.
 * Returns null when it can't be confidently normalized, so callers skip rather
 * than send garbage. Defaults bare 10/11-digit numbers to US (+1).
 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;

  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;

  return null;
}

/**
 * Public URL Twilio should POST delivery receipts to (and which we validate the
 * webhook signature against). Returns undefined when no public base URL is set —
 * Twilio can't reach localhost, so delivery receipts are simply off in local dev
 * unless a tunnel URL is configured.
 */
export function smsStatusCallbackUrl(): string | undefined {
  const explicit = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  return base ? `${base.replace(/\/$/, "")}/api/webhooks/twilio` : undefined;
}

export type Channel = "sms";

export type SendResult =
  | { status: "sent"; sid: string; toE164: string }
  | { status: "skipped"; reason: "not_configured" | "invalid_phone" }
  | { status: "failed"; reason: string };

/**
 * Send an SMS. Never throws — returns a discriminated result:
 * - `skipped` for deterministic, non-retryable conditions (no config, bad number)
 * - `failed` for a Twilio/network error (the caller may retry)
 * - `sent` with the Twilio message SID
 */
export async function sendSms({
  to,
  body,
  statusCallback,
}: {
  to: string | null | undefined;
  body: string;
  statusCallback?: string;
}): Promise<SendResult> {
  if (!isMessagingConfigured()) {
    return { status: "skipped", reason: "not_configured" };
  }

  const normalized = toE164(to);
  if (!normalized) {
    return { status: "skipped", reason: "invalid_phone" };
  }

  try {
    const message = await getTwilioClient().messages.create({
      to: normalized,
      from: process.env.TWILIO_SMS_FROM!,
      body,
      ...(statusCallback ? { statusCallback } : {}),
    });
    return { status: "sent", sid: message.sid, toE164: normalized };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "twilio_error";
    console.error("[messaging] sendSms failed", error);
    return { status: "failed", reason };
  }
}
