import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { extractLeaseSchema } from "@/lib/fill-lease";
import { syncLeaseTemplateClauses } from "@/lib/lease-template-clauses";
import { syncStateSpecificLeaseClauses } from "@/lib/lease-state-clauses";
import {
  getOrgPermissionContext,
  requirePropertyPermission,
} from "@/lib/org-authorization";

type RouteContext = { params: Promise<{ id: string }> };

type GeneratedReviewData = {
  acceptedStateSuggestions?: boolean;
  generatedTags?: string[];
  stateLawNotes?: Array<{ area?: string; note?: string; risk?: string }>;
};

function buildTokenizedTemplateContent(schema: Awaited<ReturnType<typeof extractLeaseSchema>>, reviewData?: object | null) {
  const review = reviewData as GeneratedReviewData | null | undefined;
  const clauseText = schema.clauses
    .sort((a, b) => a.order - b.order)
    .map((clause, index) => `${index + 1}. ${clause.title}\n${clause.body}`)
    .join("\n\n");
  const tags = (review?.generatedTags ?? []).length
    ? `\n\nRequired tags\n${review!.generatedTags!.join("\n")}`
    : "";
  const stateUpdates = review?.acceptedStateSuggestions && review.stateLawNotes?.length
    ? `\n\nAccepted state-specific updates\n${review.stateLawNotes
        .map((note) => `- ${note.area ?? "State law"}: ${note.note ?? ""}`)
        .join("\n")}`
    : "";

  return `${clauseText}${stateUpdates}${tags}`.trim();
}

function templateJson(template: {
  id: string;
  name: string;
  file_name: string;
  content_type: string;
  blob_url: string;
  is_active: boolean;
  created_at: Date;
}) {
  return {
    id: template.id,
    name: template.name,
    fileName: template.file_name,
    contentType: template.content_type,
    blobUrl: template.blob_url,
    isActive: template.is_active,
    createdAt: template.created_at.toISOString(),
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    return await handlePost(request, context);
  } catch (err) {
    console.error("[lease-confirm] Unhandled error:", err);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}

async function handlePost(request: NextRequest, context: RouteContext) {
  const ctx = await getOrgPermissionContext();
  if ("error" in ctx) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id: propertyId } = await context.params;
  const permissionError = requirePropertyPermission(ctx, "manage_properties", propertyId);
  if (permissionError) {
    return Response.json({ error: permissionError.error }, { status: permissionError.status });
  }

  const property = await prisma.properties.findFirst({
    where: { id: propertyId, organization_id: ctx.orgDbId, deleted_at: null },
    select: { id: true, name: true, address: true, city: true, state: true, zip: true },
  });
  if (!property) {
    return Response.json({ error: "Property not found." }, { status: 404 });
  }

  const utilityLabels: Record<string, string> = {
    electricity: "Electricity", heat: "Heat", gas: "Gas", water: "Water",
    sewer: "Sewer / Septic", trash: "Trash", internet: "Internet",
    cable: "Cable / Satellite", phone: "Phone", laundry: "Laundry",
    parking: "Parking", lawnCare: "Lawn Care", snowRemoval: "Snow Removal",
    hoa: "HOA / Condo Fee",
  };

  type WorkflowTerms = {
    leaseType?: string;
    leaseTerm?: string;
    lateFeeType?: "flat" | "pct";
    lateFeeFlat?: string;
    lateFeePct?: string;
    lateFeeGraceDays?: string;
    earlyTerminationFee?: string;
    earlyTerminationMonths?: string;
    petFeeAmount?: string;
    utilities?: Record<string, "tenant" | "landlord" | "na">;
  };
  let body: {
    blobUrl?: string;
    contentType?: string;
    fileName?: string;
    name?: string;
    reviewData?: object;
    workflowTerms?: WorkflowTerms;
    organizationName?: string;
    landlordSignatory?: string;
    propertyManagerName?: string;
    propertyManagerEmail?: string;
    propertyManagerPhone?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { blobUrl, contentType, fileName, name, reviewData, workflowTerms } = body;
  if (!blobUrl || !contentType || !fileName || !name) {
    return Response.json({ error: "Missing required fields." }, { status: 422 });
  }

  const template = await prisma.$transaction(async (tx) => {
    await tx.lease_templates.updateMany({
      where: { organization_id: ctx.orgDbId, property_id: propertyId, is_active: true },
      data: { is_active: false, updated_at: new Date() },
    });

    return tx.lease_templates.create({
      data: {
        organization_id: ctx.orgDbId,
        property_id: propertyId,
        name,
        file_name: fileName,
        content_type: contentType,
        blob_url: blobUrl,
        is_active: true,
        created_by: ctx.userDbId,
        ...(reviewData ? { review_data: reviewData } : {}),
      },
      select: {
        id: true,
        name: true,
        file_name: true,
        content_type: true,
        blob_url: true,
        is_active: true,
        created_at: true,
      },
    });
  });

  // Extract schema so fill requests are always instant
  try {
    const schema = await extractLeaseSchema(blobUrl);

    // Bake in property-level fields from the selected property
    schema.propertyName = property.name;
    schema.propertyAddress = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
    schema.propertyStreet = property.address;
    schema.propertyCity = property.city;
    schema.propertyState = property.state;
    schema.propertyZip = property.zip;

    // Merge form-entered party values (overrides AI extraction)
    if (body.organizationName) schema.landlordName = body.organizationName;
    if (body.landlordSignatory) schema.landlordSignatory = body.landlordSignatory;
    if (body.propertyManagerName) schema.propertyManagerName = body.propertyManagerName;
    if (body.propertyManagerEmail) schema.propertyManagerEmail = body.propertyManagerEmail;
    if (body.propertyManagerPhone) schema.propertyManagerPhone = body.propertyManagerPhone;

    // Merge user-edited terms from the workflow (overrides AI extraction)
    if (workflowTerms) {
      const t = workflowTerms;
      if (t.lateFeeGraceDays !== undefined && t.lateFeeGraceDays !== "") schema.lateFeeGraceDays = t.lateFeeGraceDays;
      if (t.lateFeeType === "flat") {
        if (t.lateFeeFlat !== undefined && t.lateFeeFlat !== "") schema.lateFeeAmount = t.lateFeeFlat;
        schema.lateFeePct = "0";
      } else if (t.lateFeeType === "pct") {
        if (t.lateFeePct !== undefined && t.lateFeePct !== "") schema.lateFeePct = t.lateFeePct;
        schema.lateFeeAmount = "0";
      }
      if (t.earlyTerminationFee !== undefined && t.earlyTerminationFee !== "") schema.earlyTerminationFee = t.earlyTerminationFee;
      if (t.earlyTerminationMonths !== undefined && t.earlyTerminationMonths !== "") schema.earlyTerminationMonths = t.earlyTerminationMonths;
      if (t.petFeeAmount !== undefined && t.petFeeAmount !== "") schema.petFeeAmount = t.petFeeAmount;
      if (t.utilities && Object.keys(t.utilities).length > 0) {
        schema.tenantPaidUtilities = Object.entries(t.utilities)
          .filter(([, v]) => v === "tenant")
          .map(([id]) => utilityLabels[id] ?? id)
          .join(", ");
      }
    }

    const tokenizedContent = buildTokenizedTemplateContent(schema, reviewData);
    await prisma.lease_templates.update({
      where: { id: template.id },
      data: {
        lease_schema: schema as object,
        tokenized_content: tokenizedContent || null,
        updated_at: new Date(),
      },
    });
    await syncLeaseTemplateClauses({
      templateId: template.id,
      organizationId: ctx.orgDbId,
      propertyId,
      schema,
      reviewData,
    });
    await syncStateSpecificLeaseClauses({
      organizationId: ctx.orgDbId,
      propertyState: property.state,
      reviewData,
    });
  } catch (err) {
    console.error("[lease-confirm] schema extraction failed:", err);
    if (reviewData) {
      await syncLeaseTemplateClauses({
        templateId: template.id,
        organizationId: ctx.orgDbId,
        propertyId,
        reviewData,
      }).catch((syncErr) => console.error("[lease-confirm] clause sync failed:", syncErr));
    }
  }

  return Response.json({ template: templateJson(template) }, { status: 201 });
}
