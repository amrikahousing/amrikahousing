// Vitest globalSetup for the integration suite. Runs once before all test
// files: wipes any prior fixture data (scoped strictly to the two fixture
// orgs) and reseeds a known state. The suite is pointed at an ephemeral Neon
// branch by scripts/test-integration.mjs — never at a shared database.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  ORG_A,
  ORG_B,
  ADMIN_A,
  PROPERTY_A,
  PROPERTY_B,
  UNIT_DOCS,
  UNIT_RENEW,
  UNIT_ENDED,
  UNIT_PENDING,
  UNIT_B,
  TENANT_PRIMARY,
  TENANT_SECONDARY,
  TENANT_B,
  LEASE_DOCS,
  LEASE_RENEW,
  LEASE_ENDED,
  LEASE_PENDING,
  LEASE_B,
  DOC_OLD,
  DOC_CURRENT,
  DOC_B,
} from "./fixtures";

const FIXTURE_ORG_CLERK_IDS = [ORG_A.clerkOrgId, ORG_B.clerkOrgId];

export default async function setup() {
  if (process.env.INTEGRATION_TEST !== "1") {
    throw new Error(
      "Integration tests must run via `npm run test:integration` so they target an ephemeral database.",
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    // Reset fixture orgs from any previous run. Payments and leases first
    // (their FKs block the cascades), then the orgs cascade the rest
    // (properties → units, users, tenants, memberships).
    const inFixtureOrgs = { clerk_org_id: { in: FIXTURE_ORG_CLERK_IDS } };
    await prisma.payments.deleteMany({
      where: { leases: { units: { properties: { organizations: inFixtureOrgs } } } },
    });
    await prisma.leases.deleteMany({
      where: { units: { properties: { organizations: inFixtureOrgs } } },
    });
    await prisma.organizations.deleteMany({ where: inFixtureOrgs });

    await prisma.organizations.create({
      data: { id: ORG_A.id, clerk_org_id: ORG_A.clerkOrgId, name: ORG_A.name },
    });
    await prisma.organizations.create({
      data: { id: ORG_B.id, clerk_org_id: ORG_B.clerkOrgId, name: ORG_B.name },
    });

    // Seed the admin in the exact state requireOrgAccess()/
    // syncClerkMembershipAccess() converge to, so authenticated requests in
    // the suite exercise the read path without racing sync writes.
    await prisma.users.create({
      data: {
        id: ADMIN_A.id,
        clerk_user_id: ADMIN_A.clerkUserId,
        organization_id: ORG_A.id,
        email: ADMIN_A.email,
        first_name: ADMIN_A.firstName,
        last_name: ADMIN_A.lastName,
        role: "admin",
        is_active: true,
      },
    });
    await prisma.memberships.create({
      data: {
        user_id: ADMIN_A.id,
        organization_id: ORG_A.id,
        role: "admin",
        property_id: null,
        is_active: true,
      },
    });

    await prisma.properties.create({
      data: {
        id: PROPERTY_A.id,
        organization_id: ORG_A.id,
        name: PROPERTY_A.name,
        address: "1 Integration Way",
        city: "Testville",
        state: "MA",
        zip: "02100",
        units: {
          create: [
            { id: UNIT_DOCS.id, unit_number: UNIT_DOCS.unitNumber, status: "occupied" },
            { id: UNIT_RENEW.id, unit_number: UNIT_RENEW.unitNumber, status: "occupied" },
            { id: UNIT_ENDED.id, unit_number: UNIT_ENDED.unitNumber, status: "vacant" },
            { id: UNIT_PENDING.id, unit_number: UNIT_PENDING.unitNumber, status: "vacant" },
          ],
        },
      },
    });
    await prisma.properties.create({
      data: {
        id: PROPERTY_B.id,
        organization_id: ORG_B.id,
        name: PROPERTY_B.name,
        address: "2 Foreign Ave",
        city: "Otherton",
        state: "NY",
        zip: "10001",
        units: {
          create: [{ id: UNIT_B.id, unit_number: UNIT_B.unitNumber, status: "occupied" }],
        },
      },
    });

    await prisma.tenants.createMany({
      data: [
        {
          id: TENANT_PRIMARY.id,
          organization_id: ORG_A.id,
          first_name: TENANT_PRIMARY.firstName,
          last_name: TENANT_PRIMARY.lastName,
          email: TENANT_PRIMARY.email,
        },
        {
          id: TENANT_SECONDARY.id,
          organization_id: ORG_A.id,
          first_name: TENANT_SECONDARY.firstName,
          last_name: TENANT_SECONDARY.lastName,
          email: TENANT_SECONDARY.email,
        },
        {
          id: TENANT_B.id,
          organization_id: ORG_B.id,
          first_name: TENANT_B.firstName,
          last_name: TENANT_B.lastName,
          email: TENANT_B.email,
        },
      ],
    });

    await prisma.leases.createMany({
      data: [
        {
          id: LEASE_DOCS.id,
          unit_id: UNIT_DOCS.id,
          start_date: new Date("2025-08-01"),
          end_date: new Date("2026-07-31"),
          rent_amount: 1800,
          status: "active",
          document_url: DOC_CURRENT.blobUrl,
        },
        {
          id: LEASE_RENEW.id,
          unit_id: UNIT_RENEW.id,
          start_date: new Date("2025-08-01"),
          end_date: new Date("2026-07-31"),
          rent_amount: 1900,
          status: "active",
        },
        {
          id: LEASE_ENDED.id,
          unit_id: UNIT_ENDED.id,
          start_date: new Date("2024-08-01"),
          end_date: new Date("2025-07-31"),
          rent_amount: 1700,
          status: "ended",
        },
        {
          id: LEASE_PENDING.id,
          unit_id: UNIT_PENDING.id,
          start_date: new Date("2026-08-01"),
          end_date: new Date("2027-07-31"),
          rent_amount: 2100,
          status: "pending_signature",
        },
        {
          id: LEASE_B.id,
          unit_id: UNIT_B.id,
          start_date: new Date("2025-08-01"),
          end_date: new Date("2026-07-31"),
          rent_amount: 2500,
          status: "active",
        },
      ],
    });

    await prisma.lease_tenants.createMany({
      data: [
        { lease_id: LEASE_DOCS.id, tenant_id: TENANT_PRIMARY.id, is_primary: true },
        { lease_id: LEASE_RENEW.id, tenant_id: TENANT_PRIMARY.id, is_primary: true },
        { lease_id: LEASE_RENEW.id, tenant_id: TENANT_SECONDARY.id, is_primary: false },
        { lease_id: LEASE_ENDED.id, tenant_id: TENANT_PRIMARY.id, is_primary: true },
        { lease_id: LEASE_PENDING.id, tenant_id: TENANT_PRIMARY.id, is_primary: true },
        { lease_id: LEASE_B.id, tenant_id: TENANT_B.id, is_primary: true },
      ],
    });

    await prisma.lease_documents.createMany({
      data: [
        {
          id: DOC_OLD.id,
          lease_id: LEASE_DOCS.id,
          blob_url: DOC_OLD.blobUrl,
          file_name: DOC_OLD.fileName,
          content_type: "application/pdf",
          kind: "uploaded",
          uploaded_by: ADMIN_A.id,
          created_at: DOC_OLD.createdAt,
        },
        {
          id: DOC_CURRENT.id,
          lease_id: LEASE_DOCS.id,
          blob_url: DOC_CURRENT.blobUrl,
          file_name: DOC_CURRENT.fileName,
          content_type: "application/pdf",
          kind: "docuseal",
          uploaded_by: null,
          created_at: DOC_CURRENT.createdAt,
        },
        {
          id: DOC_B.id,
          lease_id: LEASE_B.id,
          blob_url: DOC_B.blobUrl,
          file_name: DOC_B.fileName,
          content_type: "application/pdf",
          kind: "uploaded",
          uploaded_by: null,
          created_at: DOC_B.createdAt,
        },
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
}
