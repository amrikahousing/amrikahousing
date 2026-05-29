import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Plaid Transfer payments have been removed. Use Stripe online payments instead." },
    { status: 410 },
  );
}
