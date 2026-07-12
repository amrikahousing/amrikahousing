import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", async () => (await import("./clerk-mock")).clerkServerMock());
vi.mock("@vercel/blob", async () => (await import("./blob-mock")).blobMock());

import { NextRequest } from "next/server";
import { GET as listDocuments } from "@/app/api/leases/[leaseId]/documents/route";
import { GET as downloadDocument } from "@/app/api/leases/[leaseId]/documents/[documentId]/route";
import { signInAsOrgAdmin, signOut } from "./clerk-mock";
import { ADMIN_A, DOC_B, DOC_CURRENT, DOC_OLD, LEASE_B, LEASE_DOCS, LEASE_RENEW, ORG_A } from "./fixtures";

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function routeContext<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

describe("GET /api/leases/[leaseId]/documents", () => {
  beforeEach(() => {
    signInAsOrgAdmin({ ...ADMIN_A, clerkOrgId: ORG_A.clerkOrgId });
  });

  it("rejects unauthenticated requests", async () => {
    signOut();
    const res = await listDocuments(
      request(`/api/leases/${LEASE_DOCS.id}/documents`),
      routeContext({ leaseId: LEASE_DOCS.id }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for a lease belonging to another organization", async () => {
    const res = await listDocuments(
      request(`/api/leases/${LEASE_B.id}/documents`),
      routeContext({ leaseId: LEASE_B.id }),
    );
    expect(res.status).toBe(404);
  });

  it("lists the document history newest-first with current flag and uploader name", async () => {
    const res = await listDocuments(
      request(`/api/leases/${LEASE_DOCS.id}/documents`),
      routeContext({ leaseId: LEASE_DOCS.id }),
    );
    expect(res.status).toBe(200);

    const { documents } = await res.json();
    expect(documents).toHaveLength(2);

    const [current, old] = documents;
    expect(current.id).toBe(DOC_CURRENT.id);
    expect(current.fileName).toBe(DOC_CURRENT.fileName);
    expect(current.kind).toBe("docuseal");
    expect(current.isCurrent).toBe(true);
    expect(current.uploadedBy).toBeNull();

    expect(old.id).toBe(DOC_OLD.id);
    expect(old.isCurrent).toBe(false);
    expect(old.uploadedBy).toBe(`${ADMIN_A.firstName} ${ADMIN_A.lastName}`);
  });
});

describe("GET /api/leases/[leaseId]/documents/[documentId]", () => {
  beforeEach(() => {
    signInAsOrgAdmin({ ...ADMIN_A, clerkOrgId: ORG_A.clerkOrgId });
  });

  it("streams the stored blob with inline disposition", async () => {
    const res = await downloadDocument(
      request(`/api/leases/${LEASE_DOCS.id}/documents/${DOC_CURRENT.id}`),
      routeContext({ leaseId: LEASE_DOCS.id, documentId: DOC_CURRENT.id }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      `inline; filename="${DOC_CURRENT.fileName}"`,
    );
    expect(await res.text()).toBe(`blob-bytes:${DOC_CURRENT.blobUrl}`);
  });

  it("returns 404 when the document does not belong to the given lease", async () => {
    const res = await downloadDocument(
      request(`/api/leases/${LEASE_RENEW.id}/documents/${DOC_CURRENT.id}`),
      routeContext({ leaseId: LEASE_RENEW.id, documentId: DOC_CURRENT.id }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for another organization's document", async () => {
    const res = await downloadDocument(
      request(`/api/leases/${LEASE_B.id}/documents/${DOC_B.id}`),
      routeContext({ leaseId: LEASE_B.id, documentId: DOC_B.id }),
    );
    expect(res.status).toBe(404);
  });
});
