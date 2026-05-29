import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | { webhook_type?: string; webhook_code?: string }
    | null;

  if (!payload?.webhook_type || !payload?.webhook_code) {
    return NextResponse.json({ error: "Invalid Plaid webhook payload." }, { status: 400 });
  }

  return NextResponse.json({ received: true, ignored: payload.webhook_type === "TRANSFER" });
}
