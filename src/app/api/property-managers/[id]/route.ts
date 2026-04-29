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
import { replacePropertyAssignments } from "@/lib/permissions";

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
      id,
      organization_id: access.orgDbId,
      deleted_at: null,
    },
    select: {
      id: true,
      clerk_user_id: true,
    },
  });
  if (!targetUser) {
    return Response.json({ error: "Manager not found." }, { status: 404 });
  }

  let body: UpdateManagerBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { permissionRole, propertyIds } = normalizeManagerAccessInput({
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
  });
  if (resolvedProperties.error) {
    return Response.json({ error: resolvedProperties.error }, { status: 422 });
  }

  const active = body.active !== false;
  const clerk = await clerkClient();
  await clerk.organizations.updateOrganizationMembershipMetadata({
    organizationId: access.orgId,
    userId: targetUser.clerk_user_id,
    publicMetadata: {
      permissionRole,
      propertyIds: resolvedProperties.propertyIds,
      active,
    },
  });

  await prisma.users.update({
    where: { id: targetUser.id },
    data: {
      role: permissionRole,
      is_active: active,
      updated_at: new Date(),
    },
  });
  await replacePropertyAssignments(targetUser.id, resolvedProperties.propertyIds);

  return Response.json({ ok: true });
}
