import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { email, firstName, lastName, phone, propertyId } = body as Record<string, unknown>;

  if (!email || typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return Response.json({ error: "A valid email address is required." }, { status: 422 });
  }
  if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
    return Response.json({ error: "First name is required." }, { status: 422 });
  }
  if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
    return Response.json({ error: "Last name is required." }, { status: 422 });
  }
  if (!propertyId || typeof propertyId !== "string" || !propertyId.trim()) {
    return Response.json({ error: "propertyId is required." }, { status: 422 });
  }
  const permissionError = requirePropertyPermission(
    ctx,
    "invite_renters",
    propertyId.trim(),
  );
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFirstName = (firstName as string).trim();
  const normalizedLastName = (lastName as string).trim();
  const normalizedPhone =
    typeof phone === "string" && phone.trim() ? phone.trim() : null;

  // Check if a Clerk account already exists for this email
  const clerk = await clerkClient();
  const existingUsers = await clerk.users.getUserList({ emailAddress: [normalizedEmail] });
  const existingClerkUser = existingUsers.data[0] ?? null;
  const clerkUserIdToLink = existingClerkUser?.id ?? null;

  // Upsert tenant record in DB
  const existing = await prisma.tenants.findUnique({
    where: { organization_id_email: { organization_id: ctx.orgDbId, email: normalizedEmail } },
    select: { id: true },
  });

  let tenant: { id: string };
  if (existing) {
    tenant = await prisma.tenants.update({
      where: { id: existing.id },
      data: {
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        ...(clerkUserIdToLink ? { clerk_user_id: clerkUserIdToLink } : {}),
        deleted_at: null,
      },
      select: { id: true },
    });
  } else {
    tenant = await prisma.tenants.create({
      data: {
        organization_id: ctx.orgDbId,
        email: normalizedEmail,
        first_name: normalizedFirstName,
        last_name: normalizedLastName,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        ...(clerkUserIdToLink ? { clerk_user_id: clerkUserIdToLink } : {}),
      },
      select: { id: true },
    });
  }

  const existingSharedUser = await prisma.users.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, role: true },
  });

  if (clerkUserIdToLink || existingSharedUser) {
    const sharedUserData = {
      email: normalizedEmail,
      organization_id: ctx.orgDbId,
      first_name: normalizedFirstName,
      last_name: normalizedLastName,
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      ...(clerkUserIdToLink ? { clerk_user_id: clerkUserIdToLink } : {}),
      role:
        existingSharedUser?.role && existingSharedUser.role !== "renter"
          ? existingSharedUser.role
          : "renter",
      updated_at: new Date(),
    };

    if (existingSharedUser) {
      await prisma.users.update({
        where: { id: existingSharedUser.id },
        data: sharedUserData,
      });
    } else if (clerkUserIdToLink) {
      await prisma.users.create({
        data: {
          ...sharedUserData,
          clerk_user_id: clerkUserIdToLink,
        },
      });
    }
  }

  // If the user already has a Clerk account they don't need an invitation email —
  // their tenant record is now linked and they can visit /renter directly.
  if (existingClerkUser) {
    return Response.json(
      { tenantId: tenant.id, linked: normalizedEmail },
      { status: 201 },
    );
  }

  // Send Clerk application-level invitation
  const redirectUrl = new URL("/login?renter=1", request.nextUrl.origin).toString();

  try {
    // Revoke any existing pending invitation so a fresh email is always sent
    const existing_invites = await clerk.invitations.getInvitationList({ status: "pending" });
    const pending = existing_invites.data.find(
      (inv) => inv.emailAddress.toLowerCase() === normalizedEmail,
    );
    if (pending) {
      await clerk.invitations.revokeInvitation(pending.id);
    }

    await clerk.invitations.createInvitation({
      emailAddress: normalizedEmail,
      redirectUrl,
      publicMetadata: { role: "renter" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send invitation email.";
    return Response.json(
      { error: `Tenant record created but invite email failed: ${message}`, tenantId: tenant.id },
      { status: 207 },
    );
  }

  return Response.json({ tenantId: tenant.id, invited: normalizedEmail }, { status: 201 });
}
