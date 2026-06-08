export const maxDuration = 120;

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  extractLeaseSchema,
  generateLease,
  extractErrorMessage,
  type ExtractedLeaseSchema,
} from "@/lib/fill-lease";
import { getOrgPermissionContext, requirePropertyPermission } from "@/lib/org-authorization";
import { z } from "zod";

const bodySchema = z.object({
  templateId: z.string(),
  propertyId: z.string(),
  propertyName: z.string(),
  propertyAddress: z.string(),
  unitNumber: z.string(),
  primaryTenant: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
  }),
  additionalTenants: z.array(
    z.object({ firstName: z.string(), lastName: z.string(), email: z.string() }),
  ).default([]),
  startDate: z.string(),
  endDate: z.string(),
  rentAmount: z.string(),
  securityDeposit: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const permissionError = requirePropertyPermission(ctx, "manage_properties", body.propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  try {
    const [template, propertyProfile] = await Promise.all([
      prisma.lease_templates.findFirst({
        where: { id: body.templateId, property_id: body.propertyId },
        select: { id: true, blob_url: true, lease_schema: true },
      }),
      prisma.properties.findUnique({
        where: { id: body.propertyId },
        select: { landlord_name: true, landlord_signatory: true, property_manager_name: true },
      }),
    ]);
    if (!template) {
      return Response.json({ error: "Template not found." }, { status: 404 });
    }

    // Use cached schema or extract now (first request for this template)
    let schema: ExtractedLeaseSchema;
    if (template.lease_schema) {
      schema = template.lease_schema as unknown as ExtractedLeaseSchema;
    } else {
      schema = await extractLeaseSchema(template.blob_url);
      await prisma.lease_templates.update({
        where: { id: template.id },
        data: { lease_schema: schema as object, updated_at: new Date() },
      });
    }

    const [org, assignedManager] = await Promise.all([
      prisma.organizations.findUnique({
        where: { id: ctx.orgDbId },
        select: { name: true, phone: true },
      }),
      // Prefer a dedicated property manager membership for this property; fall back to the logged-in admin.
      prisma.memberships.findFirst({
        where: {
          organization_id: ctx.orgDbId,
          property_id: body.propertyId,
          role: "property_manager",
          is_active: true,
        },
        select: { users: { select: { first_name: true, last_name: true, email: true } } },
      }),
    ]);

    const managerUser = assignedManager?.users ?? (
      ctx.userDbId
        ? await prisma.users.findUnique({
            where: { id: ctx.userDbId },
            select: { first_name: true, last_name: true, email: true },
          })
        : null
    );
    const managerName = [managerUser?.first_name, managerUser?.last_name].filter(Boolean).join(" ") || undefined;

    const docxBuffer = await generateLease(schema, {
      primaryTenant: body.primaryTenant,
      additionalTenants: body.additionalTenants,
      propertyName: body.propertyName,
      propertyAddress: body.propertyAddress,
      unitNumber: body.unitNumber,
      startDate: body.startDate,
      endDate: body.endDate,
      rentAmount: body.rentAmount,
      securityDeposit: body.securityDeposit,
      // Property-level landlord name takes priority over the org-level name
      organizationName: propertyProfile?.landlord_name || org?.name || undefined,
      // Property-level signatory takes priority over schema default
      landlordSignatory: propertyProfile?.landlord_signatory || schema.landlordSignatory,
      propertyManagerName: propertyProfile?.property_manager_name || managerName,
      propertyManagerEmail: managerUser?.email,
      propertyManagerPhone: org?.phone ?? undefined,
      earlyTerminationFee: schema.earlyTerminationFee,
      earlyTerminationMonths: schema.earlyTerminationMonths,
      guestStayLimit: schema.guestStayLimit,
      condemnationNoticeDays: schema.condemnationNoticeDays,
      includedAppliances: schema.includedAppliances,
      lateFeeAmount: schema.lateFeeAmount,
      lateFeeGraceDays: schema.lateFeeGraceDays,
      lateFeePct: schema.lateFeePct,
      petFeeAmount: schema.petFeeAmount,
      tenantPaidUtilities: schema.tenantPaidUtilities,
    }, template.blob_url);

    // Return the filled DOCX itself. The client renders these exact bytes with a
    // layout-preserving renderer (docx-preview), so the preview matches the downloaded
    // document — including tables, merged cells, and headers/footers that mammoth's HTML
    // conversion would otherwise drop or mangle.
    return Response.json({
      fileBase64: docxBuffer.toString("base64"),
      format: "docx",
    });
  } catch (err) {
    console.error("[fill-template]", err);
    const message = extractErrorMessage(err) || "Failed to generate lease.";
    return Response.json({ error: message }, { status: 500 });
  }
}
