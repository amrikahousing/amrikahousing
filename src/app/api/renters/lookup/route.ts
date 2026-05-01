import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase() ?? "";
  const propertyId = request.nextUrl.searchParams.get("propertyId")?.trim() ?? "";

  if (!EMAIL_PATTERN.test(email)) {
    return Response.json({ error: "A valid email address is required." }, { status: 422 });
  }
  if (!propertyId) {
    return Response.json({ error: "propertyId is required." }, { status: 422 });
  }

  const permissionError = requirePropertyPermission(ctx, "invite_renters", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const [existingTenant, existingSharedUser, existingClerkUsers] = await Promise.all([
    prisma.tenants.findUnique({
      where: { organization_id_email: { organization_id: ctx.orgDbId, email } },
      select: { id: true },
    }),
    prisma.users.findUnique({
      where: { email },
      select: { id: true },
    }),
    clerkClient().then((clerk) => clerk.users.getUserList({ emailAddress: [email] })),
  ]);

  return Response.json({
    email,
    tenantExists: Boolean(existingTenant),
    sharedUserExists: Boolean(existingSharedUser),
    clerkUserExists: existingClerkUsers.data.length > 0,
  });
}
