import { NextResponse } from "next/server";
import { handlePlaidTransferWebhookEvent } from "@/lib/renter-payments";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | { webhook_type?: string; webhook_code?: string }
    | null;

  if (!payload?.webhook_type || !payload?.webhook_code) {
    return NextResponse.json({ error: "Invalid Plaid webhook payload." }, { status: 400 });
  }

  try {
    await handlePlaidTransferWebhookEvent(payload);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[plaid-webhook]", error);
    return NextResponse.json({ error: "Unable to process the Plaid webhook." }, { status: 500 });
  }
}
