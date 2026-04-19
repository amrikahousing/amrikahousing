import { requireOrgAccess, isAccessError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSupportedPropertyType } from "@/lib/property-types";

type UnitInput = {
  unit_number: string;
  bedrooms?: number;
  bathrooms?: number;
  square_feet?: number;
  rent_amount?: number;
  status?: string;
};

type PropertyInput = {
  name: string;
  type: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description?: string;
  units: UnitInput[];
};

export async function POST(request: Request) {
  const ctx = await requireOrgAccess();
  if (isAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: PropertyInput;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, type, address, city, state, zip, description, units } = body;

  if (!name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });
  if (!address?.trim()) return Response.json({ error: "Address is required" }, { status: 400 });
  if (!city?.trim()) return Response.json({ error: "City is required" }, { status: 400 });
  if (!state?.trim()) return Response.json({ error: "State is required" }, { status: 400 });
  if (!zip?.trim()) return Response.json({ error: "Zip is required" }, { status: 400 });
  if (!isSupportedPropertyType(type)) {
    return Response.json({ error: "Type must be multi-family" }, { status: 400 });
  }

  const property = await prisma.properties.create({
    data: {
      organization_id: ctx.orgDbId,
      name: name.trim(),
      type,
      address: address.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase(),
      zip: zip.trim(),
      description: description?.trim() || null,
    },
  });

  const unitData = (units ?? []).slice(0, 50).map((u) => ({
    property_id: property.id,
    unit_number: u.unit_number || "1",
    bedrooms: u.bedrooms ?? 0,
    bathrooms: u.bathrooms ?? 0,
    square_feet: u.square_feet ?? null,
    rent_amount: u.rent_amount ?? null,
    status: ["vacant", "occupied", "maintenance"].includes(u.status ?? "") ? u.status! : "vacant",
  }));

  if (unitData.length === 0) {
    unitData.push({ property_id: property.id, unit_number: "1", bedrooms: 0, bathrooms: 0, square_feet: null, rent_amount: null, status: "vacant" });
  }

  await prisma.units.createMany({ data: unitData });

  return Response.json({ propertyId: property.id }, { status: 201 });
}
