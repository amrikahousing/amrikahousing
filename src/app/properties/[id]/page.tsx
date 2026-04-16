import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type Property = {
  id: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: string;
  bedrooms: number;
  bathrooms: string;
  sqft: number;
  description: string;
  status: string;
  imageUrl: string;
};

const properties: Property[] = [
  {
    id: 1,
    address: "Oak Terrace 2B",
    city: "Atlanta",
    state: "GA",
    zipCode: "30303",
    price: "2450.00",
    bedrooms: 2,
    bathrooms: "2.0",
    sqft: 1180,
    description: "Bright apartment near transit and daily errands.",
    status: "available",
    imageUrl: "https://placehold.co/1200x680/dbeafe/334155?text=Oak+Terrace",
  },
  {
    id: 2,
    address: "Maple Court 4A",
    city: "Decatur",
    state: "GA",
    zipCode: "30030",
    price: "3100.00",
    bedrooms: 3,
    bathrooms: "2.5",
    sqft: 1540,
    description: "Townhome with attached parking and a private patio.",
    status: "occupied",
    imageUrl: "https://placehold.co/1200x680/dcfce7/334155?text=Maple+Court",
  },
  {
    id: 3,
    address: "Cedar House",
    city: "Marietta",
    state: "GA",
    zipCode: "30060",
    price: "2800.00",
    bedrooms: 3,
    bathrooms: "2.0",
    sqft: 1425,
    description: "Single-family home with a fenced yard.",
    status: "maintenance",
    imageUrl: "https://placehold.co/1200x680/fef3c7/334155?text=Cedar+House",
  },
  {
    id: 4,
    address: "Pine Lofts 8C",
    city: "Sandy Springs",
    state: "GA",
    zipCode: "30328",
    price: "2200.00",
    bedrooms: 1,
    bathrooms: "1.0",
    sqft: 860,
    description: "Loft-style unit with skyline views.",
    status: "available",
    imageUrl: "https://placehold.co/1200x680/e0e7ff/334155?text=Pine+Lofts",
  },
];

export default async function PropertyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = properties.find((item) => item.id === Number(id));

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href="/properties"
          className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to Properties
        </Link>

        {property ? (
          <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="h-72 overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={property.imageUrl}
                alt={property.address}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="space-y-6 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    {property.address}
                  </h1>
                  <p className="mt-1 text-slate-500">
                    {property.city}, {property.state} {property.zipCode}
                  </p>
                </div>
                <span className="self-start rounded border border-slate-200 px-3 py-1 text-sm font-semibold capitalize text-slate-700">
                  {property.status}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Rent</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    ${Number(property.price).toLocaleString()}/mo
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Beds</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {property.bedrooms}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Baths</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {Number(property.bathrooms)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">Square feet</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {property.sqft.toLocaleString()}
                  </p>
                </div>
              </div>

              <section>
                <h2 className="text-lg font-semibold text-slate-900">
                  Description
                </h2>
                <p className="mt-2 text-slate-600">{property.description}</p>
              </section>
            </div>
          </article>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Property not found.
          </div>
        )}
      </div>
    </AppShell>
  );
}
