export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LeaseWorkspaceClient } from "@/components/LeaseWorkspaceClient";
import { prisma } from "@/lib/db";
import {
  getOrgPermissionContext,
  propertyScopeWhere,
  requirePermission,
} from "@/lib/org-authorization";

export default async function LeasesPage() {
  const { userId } = await auth();
  if (!userId) redirect("/login");

  const access = await getOrgPermissionContext();
  if ("error" in access) redirect("/dashboard");

  const viewError = requirePermission(access, "view_properties");
  if (viewError) redirect("/dashboard");

  const [properties, stateClauses] = await Promise.all([
    prisma.properties.findMany({
      where: propertyScopeWhere(access),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        landlord_name: true,
        landlord_signatory: true,
        property_manager_name: true,
        property_manager_email: true,
        property_manager_phone: true,
        includes_electricity: true,
        includes_laundry: true,
        has_pet_fee: true,
        includes_parking: true,
        includes_internet: true,
        lease_templates: {
          orderBy: [{ is_active: "desc" }, { created_at: "desc" }],
          select: {
            id: true,
            name: true,
            file_name: true,
            content_type: true,
            blob_url: true,
            lease_schema: true,
            is_active: true,
            created_at: true,
            review_data: true,
            lease_template_clauses: {
              orderBy: { sort_order: "asc" },
              select: {
                id: true,
                title: true,
                body: true,
                summary: true,
                risk_level: true,
                explanation: true,
                source: true,
              },
            },
          },
        },
        units: {
          where: { deleted_at: null },
          orderBy: { unit_number: "asc" },
          select: {
            id: true,
            unit_number: true,
            status: true,
            rent_amount: true,
            leases: {
              where: { deleted_at: null },
              select: {
                status: true,
                start_date: true,
                end_date: true,
                lease_tenants: {
                  select: {
                    tenants: {
                      select: {
                        first_name: true,
                        last_name: true,
                        email: true,
                      },
                    },
                  },
                },
                lease_signature_requests: {
                  select: {
                    status: true,
                    sent_at: true,
                    completed_at: true,
                    last_synced_at: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.lease_state_specific_clauses.findMany({
      where: { organization_id: access.orgDbId },
      orderBy: [{ state: "asc" }, { risk: "desc" }, { area: "asc" }],
    }),
  ]);

  return (
    <LeaseWorkspaceClient
      canManageTemplates={access.permissions.manage_properties}
      properties={properties.map((property) => ({
        id: property.id,
        name: property.name,
        state: property.state,
        address: `${property.address}, ${property.city}, ${property.state} ${property.zip}`,
        leaseProfile: {
          landlordName: property.landlord_name ?? "",
          landlordSignatory: property.landlord_signatory ?? "",
          propertyManagerName: property.property_manager_name ?? "",
          propertyManagerEmail: property.property_manager_email ?? "",
          propertyManagerPhone: property.property_manager_phone ?? "",
          includesElectricity: property.includes_electricity,
          includesLaundry: property.includes_laundry,
          hasPetFee: property.has_pet_fee,
          includesParking: property.includes_parking,
          includesInternet: property.includes_internet,
        },
        stateClauses: stateClauses
          .filter((clause) => clause.state === property.state)
          .map((clause) => ({
            id: clause.id,
            area: clause.area,
            note: clause.note,
            risk: clause.risk,
          })),
        templates: property.lease_templates.map((template) => ({
          id: template.id,
          name: template.name,
          fileName: template.file_name,
          contentType: template.content_type,
          blobUrl: template.blob_url,
          leaseSchema: template.lease_schema,
          isActive: template.is_active,
          createdAt: template.created_at.toISOString(),
          reviewData: template.review_data,
          clauseCount: template.lease_template_clauses.length,
          clauses: template.lease_template_clauses.map((clause) => ({
            id: clause.id,
            title: clause.title,
            body: clause.body,
            summary: clause.summary,
            riskLevel: clause.risk_level,
            explanation: clause.explanation,
            source: clause.source,
          })),
        })),
        units: property.units.map((unit) => {
          const lease = unit.leases;
          const tenant = lease?.lease_tenants?.tenants;
          const signature = lease?.lease_signature_requests[0] ?? null;
          return {
            id: unit.id,
            unitNumber: unit.unit_number,
            unitStatus: unit.status,
            rentAmount: unit.rent_amount === null ? null : Number(unit.rent_amount),
            leaseStatus: lease?.status ?? null,
            leaseStart: lease?.start_date?.toISOString() ?? null,
            leaseEnd: lease?.end_date?.toISOString() ?? null,
            tenantName: tenant ? `${tenant.first_name} ${tenant.last_name}` : null,
            tenantEmail: tenant?.email ?? null,
            signatureStatus: signature?.status ?? null,
            signatureSentAt: signature?.sent_at?.toISOString() ?? null,
            signatureCompletedAt: signature?.completed_at?.toISOString() ?? null,
          };
        }),
      }))}
    />
  );
}
