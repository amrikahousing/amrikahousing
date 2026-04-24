import { requireTenantAccess, isTenantAccessError } from "@/lib/renter-auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const tenant = await prisma.tenants.findUnique({
    where: { id: ctx.tenantId },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      phone: true,
      lease_tenants: {
        select: {
          is_primary: true,
          leases: {
            select: {
              id: true,
              start_date: true,
              end_date: true,
              rent_amount: true,
              security_deposit: true,
              status: true,
              units: {
                select: {
                  id: true,
                  unit_number: true,
                  bedrooms: true,
                  bathrooms: true,
                  square_feet: true,
                  properties: {
                    select: {
                      id: true,
                      name: true,
                      address: true,
                      city: true,
                      state: true,
                      zip: true,
                    },
                  },
                },
              },
              payments: {
                orderBy: { due_date: "desc" },
                take: 12,
                select: {
                  id: true,
                  amount: true,
                  type: true,
                  status: true,
                  due_date: true,
                  paid_at: true,
                  payment_method: true,
                  notes: true,
                },
              },
            },
          },
        },
      },
      maintenance_requests: {
        where: { organizations: { id: ctx.organizationId } },
        orderBy: { created_at: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          description: true,
          priority: true,
          status: true,
          created_at: true,
          scheduled_date: true,
          units: {
            select: {
              unit_number: true,
              properties: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return Response.json({ tenant });
}
