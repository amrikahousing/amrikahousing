import { prisma } from "@/lib/db";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";
import { isSupportedPropertyType } from "@/lib/property-types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PropertyUpdateInput = {
  name?: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  description?: string;
};

async function findScopedProperty(propertyId: string, organizationId: string) {
  return prisma.properties.findFirst({
    where: {
      id: propertyId,
      organization_id: organizationId,
      deleted_at: null,
    },
    select: { id: true },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }
  const property = await findScopedProperty(id, ctx.orgDbId);
  if (!property) {
    return Response.json({ error: "Property not found." }, { status: 404 });
  }

  let body: PropertyUpdateInput;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = body.name?.trim();
  const type = body.type?.trim();
  const address = body.address?.trim();
  const city = body.city?.trim();
  const state = body.state?.trim().toUpperCase();
  const zip = body.zip?.trim();

  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
  if (!address) return Response.json({ error: "Address is required." }, { status: 400 });
  if (!city) return Response.json({ error: "City is required." }, { status: 400 });
  if (!state) return Response.json({ error: "State is required." }, { status: 400 });
  if (!zip) return Response.json({ error: "Zip is required." }, { status: 400 });
  if (!isSupportedPropertyType(type)) {
    return Response.json({ error: "Type must be multi-family." }, { status: 400 });
  }

  const updatedProperty = await prisma.properties.update({
    where: { id },
    data: {
      name,
      type,
      address,
      city,
      state,
      zip,
      description: body.description?.trim() || null,
      updated_at: new Date(),
    },
    select: {
      id: true,
      name: true,
      type: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      description: true,
    },
  });

  return Response.json({ property: updatedProperty });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }
  const property = await findScopedProperty(id, ctx.orgDbId);
  if (!property) {
    return Response.json({ error: "Property not found." }, { status: 404 });
  }

  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.units.updateMany({
      where: { property_id: id, deleted_at: null },
      data: { deleted_at: deletedAt, updated_at: deletedAt },
    }),
    prisma.properties.update({
      where: { id },
      data: {
        deleted_at: deletedAt,
        updated_at: deletedAt,
        is_active: false,
      },
    }),
  ]);

  return Response.json({ ok: true });
}
