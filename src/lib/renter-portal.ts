import { prisma } from "./db";

export type RenterSupportContact = {
  organizationName: string | null;
  organizationEmail: string | null;
  organizationPhone: string | null;
  managerName: string | null;
  managerEmail: string | null;
};

function fullName(firstName: string | null, lastName: string | null) {
  const value = [firstName, lastName].filter(Boolean).join(" ").trim();
  return value || null;
}

export async function getRenterSupportContact(
  organizationId: string | null | undefined,
): Promise<RenterSupportContact> {
  if (!organizationId) {
    return {
      organizationName: null,
      organizationEmail: null,
      organizationPhone: null,
      managerName: null,
      managerEmail: null,
    };
  }

  const [organization, manager] = await Promise.all([
    prisma.organizations.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        email: true,
        phone: true,
      },
    }),
    prisma.users.findFirst({
      where: {
        organization_id: organizationId,
        deleted_at: null,
        is_active: true,
      },
      orderBy: [{ role: "asc" }, { created_at: "asc" }],
      select: {
        first_name: true,
        last_name: true,
        email: true,
      },
    }),
  ]);

  return {
    organizationName: organization?.name ?? null,
    organizationEmail: organization?.email ?? null,
    organizationPhone: organization?.phone ?? null,
    managerName: fullName(manager?.first_name ?? null, manager?.last_name ?? null),
    managerEmail: manager?.email ?? organization?.email ?? null,
  };
}
