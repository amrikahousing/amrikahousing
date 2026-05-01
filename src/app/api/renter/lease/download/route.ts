import { get } from "@vercel/blob";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveSharedUserIdentity } from "@/lib/renter-auth";

function blobToken() {
  return process.env.VERCEL_ENV === "production"
    ? process.env.BLOB_READ_WRITE_TOKEN
    : process.env.VERCEL_ENV === "preview"
      ? process.env.TEST_BLOB_READ_WRITE_TOKEN
      : process.env.DEV_BLOB_READ_WRITE_TOKEN;
}

function fileNameFromUrl(url: string) {
  const pathname = new URL(url).pathname;
  return pathname.split("/").pop() || "lease-agreement.pdf";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const identity = await resolveSharedUserIdentity(userId);
  if (!identity.email) {
    return Response.json({ error: "Lease not found." }, { status: 404 });
  }

  const tenant = await prisma.tenants.findFirst({
    where: {
      email: identity.email,
      deleted_at: null,
      ...(identity.sharedUser?.organization_id
        ? { organization_id: identity.sharedUser.organization_id }
        : {}),
    },
    select: {
      lease_tenants: {
        select: {
          leases: {
            select: {
              document_url: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const activeLease = tenant?.lease_tenants.find((row) => row.leases.status === "active")?.leases;
  const lease = activeLease ?? tenant?.lease_tenants[0]?.leases ?? null;
  if (!lease?.document_url) {
    return Response.json({ error: "No lease document is available." }, { status: 404 });
  }

  const blob = await get(lease.document_url, {
    access: "private",
    token: blobToken(),
    useCache: false,
  });

  if (!blob?.stream) {
    return Response.json({ error: "Lease document not found." }, { status: 404 });
  }

  return new Response(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType || "application/pdf",
      "Content-Disposition": `attachment; filename="${fileNameFromUrl(lease.document_url)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
