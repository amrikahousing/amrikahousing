import { NextResponse } from "next/server";
import { verifyPlaidWebhookRequest } from "@/lib/plaid";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const isVerified = await verifyPlaidWebhookRequest(rawBody, request.headers.get("plaid-verification"));
  if (!isVerified) {
    return NextResponse.json({ error: "Invalid Plaid webhook signature." }, { status: 401 });
  }

  let payload: { webhook_type?: string; webhook_code?: string } | null;
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid Plaid webhook payload." }, { status: 400 });
  }

  if (!payload?.webhook_type || !payload?.webhook_code) {
    return NextResponse.json({ error: "Invalid Plaid webhook payload." }, { status: 400 });
  }

  return NextResponse.json({ received: true, ignored: payload.webhook_type === "TRANSFER" });
}
