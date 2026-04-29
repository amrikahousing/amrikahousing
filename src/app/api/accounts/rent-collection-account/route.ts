import { NextResponse } from "next/server";
import { getOrgPermissionContext, requirePermission } from "@/lib/org-authorization";
import {
  clearOrganizationRentCollectionAccount,
  setOrganizationRentCollectionAccount,
} from "@/lib/organization-payment-destinations";

type PostBody = {
  connectedAccountId?: unknown;
};

export async function POST(request: Request) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_bank_accounts");
  if (permissionError) {
    return NextResponse.json({ error: permissionError.error }, { status: permissionError.status });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.connectedAccountId !== "string" || !body.connectedAccountId.trim()) {
    return NextResponse.json(
      { error: "A connected account selection is required." },
      { status: 422 },
    );
  }

  try {
    const destination = await setOrganizationRentCollectionAccount({
      organizationId: access.orgDbId,
      clerkOrgId: access.orgId,
      connectedAccountId: body.connectedAccountId.trim(),
    });

    return NextResponse.json({ destination });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save the rent collection account.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_bank_accounts");
  if (permissionError) {
    return NextResponse.json({ error: permissionError.error }, { status: permissionError.status });
  }

  await clearOrganizationRentCollectionAccount(access.orgDbId);
  return NextResponse.json({ ok: true });
}
