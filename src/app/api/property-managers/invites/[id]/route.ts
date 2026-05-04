import { clerkClient } from "@clerk/nextjs/server";
import {
  getOrgPermissionContext,
  requirePermission,
} from "@/lib/org-authorization";

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
  const clerk = await clerkClient();
  await clerk.organizations.revokeOrganizationInvitation({
    organizationId: access.orgId,
    invitationId: id,
  });

  return Response.json({ revoked: true });
}
