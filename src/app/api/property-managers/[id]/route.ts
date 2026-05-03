import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import {
  normalizeManagerAccessInput,
  resolveManagerPropertyIds,
} from "@/lib/manager-access";
import {
  getOrgPermissionContext,
  requirePermission,
} from "@/lib/org-authorization";
import { replaceMembershipAccess, replacePropertyAssignments } from "@/lib/permissions";

type UpdateManagerBody = {
  permissionRole?: unknown;
  propertyIds?: unknown;
  active?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_team");
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const { id } = await params;
  const targetUser = await prisma.users.findFirst({
    where: {
      ...(id.startsWith("user_") ? { clerk_user_id: id } : { id }),
      organization_id: access.orgDbId,
      deleted_at: null,
    },
    select: {
      id: true,
      clerk_user_id: true,
    },
  });
  const targetClerkUserId = targetUser?.clerk_user_id ?? (id.startsWith("user_") ? id : null);
  if (!targetClerkUserId) {
    return Response.json({ error: "Manager not found." }, { status: 404 });
  }
  if (targetClerkUserId === access.userId) {
    return Response.json(
      { error: "You cannot change your own admin access here." },
      { status: 409 },
    );
  }

  let body: UpdateManagerBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
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

  const active = role === "admin" ? true : body.active !== false;
  const clerk = await clerkClient();
  await clerk.organizations.updateOrganizationMembership({
    organizationId: access.orgId,
    userId: targetClerkUserId,
    role: role === "admin" ? "org:admin" : "org:member",
  });
  await clerk.organizations.updateOrganizationMembershipMetadata({
    organizationId: access.orgId,
    userId: targetClerkUserId,
    publicMetadata: {
      role,
      permissionRole,
      propertyIds: resolvedProperties.propertyIds,
      active,
    },
  });

  if (targetUser) {
    await prisma.users.update({
      where: { id: targetUser.id },
      data: {
        role,
        is_active: active,
        updated_at: new Date(),
      },
    });
    await replacePropertyAssignments(targetUser.id, resolvedProperties.propertyIds);
    await replaceMembershipAccess({
      userDbId: targetUser.id,
      orgDbId: access.orgDbId,
      role,
      propertyIds: resolvedProperties.propertyIds,
      active,
    });
  }

  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getOrgPermissionContext();
  if ("error" in access) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  const permissionError = requirePermission(access, "manage_team");
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const { id } = await params;
  const targetUser = await prisma.users.findFirst({
    where: {
      ...(id.startsWith("user_") ? { clerk_user_id: id } : { id }),
      organization_id: access.orgDbId,
      deleted_at: null,
    },
    select: { id: true, clerk_user_id: true },
  });
  const targetClerkUserId = targetUser?.clerk_user_id ?? (id.startsWith("user_") ? id : null);
  if (!targetClerkUserId) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }
  if (targetClerkUserId === access.userId) {
    return Response.json(
      { error: "You cannot revoke your own admin access." },
      { status: 409 },
    );
  }

  const clerk = await clerkClient();
  await clerk.organizations.deleteOrganizationMembership({
    organizationId: access.orgId,
    userId: targetClerkUserId,
  });

  if (targetUser) {
    await prisma.$transaction([
      prisma.memberships.deleteMany({
        where: { user_id: targetUser.id, organization_id: access.orgDbId },
      }),
      prisma.property_assignments.deleteMany({
        where: { user_id: targetUser.id },
      }),
      prisma.users.update({
        where: { id: targetUser.id },
        data: {
          is_active: false,
          updated_at: new Date(),
        },
      }),
    ]);
  }

  return Response.json({ revoked: true });
}
