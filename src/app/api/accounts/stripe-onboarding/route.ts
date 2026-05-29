import { type NextRequest, NextResponse } from "next/server";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import { createStripeOnboardingLink } from "@/lib/organization-payment-destinations";

export async function POST(request: NextRequest) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_bank_accounts");
  if (permissionError) {
    return NextResponse.json({ error: permissionError.error }, { status: permissionError.status });
  }

  try {
    const { url } = await createStripeOnboardingLink(
      access.orgDbId,
      request.nextUrl.origin,
    );
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create the Stripe onboarding link.",
      },
      { status: 400 },
    );
  }
}
