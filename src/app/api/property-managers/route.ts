import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  normalizeManagerAccessInput,
  resolveManagerPropertyIds,
  roleLabel,
} from "@/lib/manager-access";
import {
  getOrgPermissionContext,
  requirePermission,
} from "@/lib/org-authorization";
import {
  normalizePermissionRole,
  normalizeOrganizationRole,
  ORGANIZATION_ROLES,
  readOrganizationAccessMetadata,
  replaceMembershipAccess,
  replacePropertyAssignments,
} from "@/lib/permissions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteManagerBody = {
  email?: unknown;
  permissionRole?: unknown;
  propertyIds?: unknown;
};

export async function GET() {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_team");
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const clerk = await clerkClient();
  const [properties, memberships, invitations] = await Promise.all([
    prisma.properties.findMany({
      where: { organization_id: access.orgDbId, deleted_at: null },
      select: { id: true, name: true },
      orderBy: { created_at: "asc" },
    }),
    clerk.organizations.getOrganizationMembershipList({
      organizationId: access.orgId,
      limit: 100,
    }),
    clerk.organizations.getOrganizationInvitationList({
      organizationId: access.orgId,
      status: ["pending"],
      limit: 100,
    }),
  ]);

  const memberUserIds = memberships.data
    .map((membership) => membership.publicUserData?.userId)
    .filter((userId): userId is string => Boolean(userId));
  const localUsers = memberUserIds.length
    ? await prisma.users.findMany({
        where: {
          organization_id: access.orgDbId,
          clerk_user_id: { in: memberUserIds },
          deleted_at: null,
        },
        select: {
          id: true,
          clerk_user_id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
          is_active: true,
          property_assignments: { select: { property_id: true } },
          memberships: {
            where: { organization_id: access.orgDbId },
            select: { role: true, property_id: true, is_active: true },
          },
        },
      })
    : [];
  const localUsersByClerkId = new Map(
    localUsers.map((user) => [user.clerk_user_id, user]),
  );

  return Response.json({
    properties,
    presetRoles: ORGANIZATION_ROLES.map((role) => ({
      value: role,
      label: roleLabel(role),
    })),
    managers: memberships.data
      .map((membership) => {
        const localUser = localUsersByClerkId.get(membership.publicUserData?.userId ?? "");
        const metadata = readOrganizationAccessMetadata(
          membership.publicMetadata as Record<string, unknown> | null | undefined,
        );
        const activeMemberships = localUser?.memberships.filter((row) => row.is_active) ?? [];
        const localRole = normalizeOrganizationRole(
          membership.role === "org:admin"
            ? "admin"
            : activeMemberships[0]?.role ?? localUser?.role ?? metadata.role,
        );
        const localPropertyIds = activeMemberships
          .map((row) => row.property_id)
          .filter((propertyId): propertyId is string => Boolean(propertyId));

        return {
          id: localUser?.id ?? membership.publicUserData?.userId ?? membership.id,
          clerkUserId: membership.publicUserData?.userId ?? null,
          email:
            localUser?.email ??
            membership.publicUserData?.identifier ??
            null,
          firstName:
            localUser?.first_name ?? membership.publicUserData?.firstName ?? null,
          lastName:
            localUser?.last_name ?? membership.publicUserData?.lastName ?? null,
          clerkRole: membership.role,
          permissionRole: normalizePermissionRole(localRole),
          role: localRole,
          propertyIds: localPropertyIds.length ? localPropertyIds : metadata.propertyIds,
          active: localUser?.is_active ?? metadata.active,
          canRevoke: membership.publicUserData?.userId !== access.userId,
        };
      }),
    pendingInvites: invitations.data.map((invitation) => {
      const metadata = readOrganizationAccessMetadata(
        invitation.publicMetadata as Record<string, unknown> | null | undefined,
      );
      return {
        id: invitation.id,
        email: invitation.emailAddress,
        role: metadata.role,
        permissionRole: metadata.permissionRole,
        propertyIds: metadata.propertyIds,
        active: metadata.active,
        createdAt: invitation.createdAt,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_team");
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  let body: InviteManagerBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const emailAddress =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(emailAddress)) {
    return Response.json({ error: "A valid email address is required." }, { status: 422 });
  }

  const { role, permissionRole, propertyIds } = normalizeManagerAccessInput({
    permissionRole: body.permissionRole,
    propertyIds: body.propertyIds,
  });
  const availableProperties = await prisma.properties.findMany({
    where: { organization_id: access.orgDbId, deleted_at: null },
    select: { id: true },
    orderBy: { created_at: "asc" },
  });
  const resolvedProperties = resolveManagerPropertyIds({
    requestedPropertyIds: propertyIds,
    availablePropertyIds: availableProperties.map((property) => property.id),
    role,
    permissionRole,
  });
  if (resolvedProperties.error) {
    return Response.json({ error: resolvedProperties.error }, { status: 422 });
  }

  const clerk = await clerkClient();
  const membershipMetadata = {
    role,
    permissionRole,
    propertyIds: resolvedProperties.propertyIds,
    active: true,
  };
  const existingUsers = await clerk.users.getUserList({ emailAddress: [emailAddress] });
  const existingUser = existingUsers.data[0] ?? null;

  if (existingUser) {
    const memberships = await clerk.users.getOrganizationMembershipList({
      userId: existingUser.id,
      limit: 100,
    });
    const membership = memberships.data.find(
      (candidate) => candidate.organization.id === access.orgId,
    );

    if (membership) {
      await clerk.organizations.updateOrganizationMembership({
        organizationId: access.orgId,
        userId: existingUser.id,
        role: role === "admin" ? "org:admin" : "org:member",
      });
      await clerk.organizations.updateOrganizationMembershipMetadata({
        organizationId: access.orgId,
        userId: existingUser.id,
        publicMetadata: membershipMetadata,
      });

      const localUser = await prisma.users.findUnique({
        where: { clerk_user_id: existingUser.id },
        select: { id: true },
      });
      if (localUser) {
        await prisma.users.update({
          where: { id: localUser.id },
          data: {
            role,
            is_active: true,
            updated_at: new Date(),
          },
        });
        await replacePropertyAssignments(localUser.id, resolvedProperties.propertyIds);
        await replaceMembershipAccess({
          userDbId: localUser.id,
          orgDbId: access.orgDbId,
          role,
          propertyIds: resolvedProperties.propertyIds,
          active: true,
        });
      }

      return Response.json({ memberUpdated: emailAddress });
    }
  }

  const existingInvites = await clerk.organizations.getOrganizationInvitationList({
    organizationId: access.orgId,
    status: ["pending"],
    limit: 100,
  });
  const pendingInvite = existingInvites.data.find(
    (invitation) => invitation.emailAddress.toLowerCase() === emailAddress,
  );
  if (pendingInvite) {
    await clerk.organizations.revokeOrganizationInvitation({
      organizationId: access.orgId,
      invitationId: pendingInvite.id,
    });
  }

  const redirectUrl = new URL("/signup", request.nextUrl.origin).toString();
  await clerk.organizations.createOrganizationInvitation({
    organizationId: access.orgId,
    emailAddress,
    role: role === "admin" ? "org:admin" : "org:member",
    redirectUrl,
    publicMetadata: membershipMetadata,
  });

  return Response.json({ invited: emailAddress }, { status: 201 });
}
