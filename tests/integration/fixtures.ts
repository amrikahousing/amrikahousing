// Fixed-ID fixtures shared by global-setup.ts (which seeds them) and the
// integration specs (which reference them). IDs are stable so reruns against a
// kept branch (--keep-branch / TEST_DATABASE_URL) reset to the same state.

export const ORG_A = {
  id: "1a000000-0000-4000-8000-00000000000a",
  clerkOrgId: "org_integration_primary",
  name: "Integration Org A",
};

// Second org so cross-tenant isolation (404 on foreign leases) is exercised.
export const ORG_B = {
  id: "1b000000-0000-4000-8000-00000000000b",
  clerkOrgId: "org_integration_other",
  name: "Integration Org B",
};

export const ADMIN_A = {
  id: "2a000000-0000-4000-8000-000000000001",
  clerkUserId: "user_integration_admin",
  email: "integration-admin@amrika.test",
  firstName: "Integration",
  lastName: "Admin",
};

export const PROPERTY_A = {
  id: "3a000000-0000-4000-8000-000000000001",
  name: "Integration Towers",
};

export const PROPERTY_B = {
  id: "3b000000-0000-4000-8000-000000000001",
  name: "Foreign Plaza",
};

export const UNIT_DOCS = { id: "4a000000-0000-4000-8000-000000000001", unitNumber: "A-101" };
export const UNIT_RENEW = { id: "4a000000-0000-4000-8000-000000000002", unitNumber: "A-102" };
export const UNIT_ENDED = { id: "4a000000-0000-4000-8000-000000000003", unitNumber: "A-103" };
export const UNIT_PENDING = { id: "4a000000-0000-4000-8000-000000000004", unitNumber: "A-104" };
export const UNIT_B = { id: "4b000000-0000-4000-8000-000000000001", unitNumber: "B-101" };

export const TENANT_PRIMARY = {
  id: "5a000000-0000-4000-8000-000000000001",
  firstName: "Rita",
  lastName: "Renter",
  email: "rita.renter@amrika.test",
};
export const TENANT_SECONDARY = {
  id: "5a000000-0000-4000-8000-000000000002",
  firstName: "Sam",
  lastName: "Roommate",
  email: "sam.roommate@amrika.test",
};
export const TENANT_B = {
  id: "5b000000-0000-4000-8000-000000000001",
  firstName: "Frank",
  lastName: "Foreign",
  email: "frank.foreign@amrika.test",
};

// Active lease used by the document-history specs (read-only).
export const LEASE_DOCS = { id: "6a000000-0000-4000-8000-000000000001" };
// Active lease consumed by the renew happy-path spec (it ends this lease).
export const LEASE_RENEW = { id: "6a000000-0000-4000-8000-000000000002" };
export const LEASE_ENDED = { id: "6a000000-0000-4000-8000-000000000003" };
export const LEASE_PENDING = { id: "6a000000-0000-4000-8000-000000000004" };
export const LEASE_B = { id: "6b000000-0000-4000-8000-000000000001" };

export const DOC_OLD = {
  id: "7a000000-0000-4000-8000-000000000001",
  blobUrl: "https://blob.integration.test/seed/lease-docs-old.pdf",
  fileName: "original-lease.pdf",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};
export const DOC_CURRENT = {
  id: "7a000000-0000-4000-8000-000000000002",
  blobUrl: "https://blob.integration.test/seed/lease-docs-current.pdf",
  fileName: "amended-lease.pdf",
  createdAt: new Date("2026-02-01T00:00:00Z"),
};
export const DOC_B = {
  id: "7b000000-0000-4000-8000-000000000001",
  blobUrl: "https://blob.integration.test/seed/foreign-lease.pdf",
  fileName: "foreign-lease.pdf",
  createdAt: new Date("2026-01-15T00:00:00Z"),
};
