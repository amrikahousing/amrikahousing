import { get } from "@vercel/blob";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getBlobToken } from "@/lib/blob-token";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";

type RouteContext = { params: Promise<{ id: string; templateId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id, templateId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", id);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const template = await prisma.lease_templates.findFirst({
    where: { id: templateId, property_id: id },
    select: { blob_url: true, file_name: true, content_type: true },
  });
  if (!template) {
    return Response.json({ error: "Template not found." }, { status: 404 });
  }

  const blob = await get(template.blob_url, {
    access: "private",
    token: getBlobToken(),
    useCache: false,
  });
  if (!blob?.stream) {
    return Response.json({ error: "Template file unavailable." }, { status: 502 });
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";

  return new Response(blob.stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": template.content_type || "application/pdf",
      "Content-Disposition": `${disposition}; filename="${template.file_name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
