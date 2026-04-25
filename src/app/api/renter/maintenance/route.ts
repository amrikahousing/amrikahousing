import { requireTenantAccess, isTenantAccessError } from "@/lib/renter-auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const requests = await prisma.maintenance_requests.findMany({
    where: { submitted_by_tenant: ctx.tenantId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      created_at: true,
      updated_at: true,
      scheduled_date: true,
      resolved_at: true,
      units: {
        select: {
          unit_number: true,
          properties: { select: { name: true, address: true } },
        },
      },
    },
  });

  return Response.json({ requests });
}

export async function POST(request: Request) {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { title, description, priority } = body as Record<string, unknown>;

  if (!title || typeof title !== "string" || !title.trim()) {
    return Response.json({ error: "Title is required." }, { status: 400 });
  }

  // Find the tenant's active lease to get the unit
  const leaseTenant = await prisma.lease_tenants.findFirst({
    where: { tenant_id: ctx.tenantId },
    include: { leases: { select: { unit_id: true, status: true } } },
  });

  if (!leaseTenant || leaseTenant.leases.status !== "active") {
    return Response.json(
      { error: "No active lease found. Cannot submit maintenance request." },
      { status: 400 },
    );
  }

  const validPriority = ["low", "normal", "high", "emergency"].includes(
    typeof priority === "string" ? priority : "",
  )
    ? (priority as string)
    : "normal";

  const req = await prisma.maintenance_requests.create({
    data: {
      organization_id: ctx.organizationId,
      unit_id: leaseTenant.leases.unit_id,
      submitted_by_tenant: ctx.tenantId,
      title: title.trim(),
      description:
        typeof description === "string" && description.trim()
          ? description.trim()
          : null,
      priority: validPriority,
      status: "open",
    },
    select: { id: true, title: true, priority: true, status: true, created_at: true },
  });

  return Response.json({ request: req }, { status: 201 });
}
