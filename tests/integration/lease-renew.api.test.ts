import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", async () => (await import("./clerk-mock")).clerkServerMock());
vi.mock("@vercel/blob", async () => (await import("./blob-mock")).blobMock());

import { NextRequest } from "next/server";
import { POST as renewLease } from "@/app/api/leases/[leaseId]/renew/route";
import { prisma } from "@/lib/db";
import { signInAsOrgAdmin, signOut } from "./clerk-mock";
import {
  ADMIN_A,
  LEASE_B,
  LEASE_ENDED,
  LEASE_PENDING,
  LEASE_RENEW,
  ORG_A,
  TENANT_PRIMARY,
  TENANT_SECONDARY,
  UNIT_RENEW,
} from "./fixtures";

const NEW_TERM = {
  startDate: "2026-08-01",
  endDate: "2027-07-31",
  rentAmount: "2000",
  securityDeposit: "2500",
  monthlyRentCredit: "100",
};

function renewalForm(
  overrides: Partial<Record<keyof typeof NEW_TERM, string | null>> = {},
  file: File | null = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "renewal.pdf", {
    type: "application/pdf",
  }),
) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ ...NEW_TERM, ...overrides })) {
    if (value !== null) form.set(key, value);
  }
  if (file) form.set("leaseFile", file);
  return form;
}

function renewRequest(leaseId: string, form: FormData) {
  return renewLease(
    new NextRequest(`http://localhost/api/leases/${leaseId}/renew`, {
      method: "POST",
      body: form,
    }),
    { params: Promise.resolve({ leaseId }) },
  );
}

describe("POST /api/leases/[leaseId]/renew", () => {
  beforeEach(() => {
    signInAsOrgAdmin({ ...ADMIN_A, clerkOrgId: ORG_A.clerkOrgId });
  });

  it("rejects unauthenticated requests", async () => {
    signOut();
    const res = await renewRequest(LEASE_RENEW.id, renewalForm());
    expect(res.status).toBe(401);
  });

  it("returns 404 for a lease belonging to another organization", async () => {
    const res = await renewRequest(LEASE_B.id, renewalForm());
    expect(res.status).toBe(404);
  });

  it("returns 409 while the lease is out for e-signature", async () => {
    const res = await renewRequest(LEASE_PENDING.id, renewalForm());
    expect(res.status).toBe(409);
    const { error } = await res.json();
    expect(error).toMatch(/e-signature/);
  });

  it("returns 409 for a lease that is not active", async () => {
    const res = await renewRequest(LEASE_ENDED.id, renewalForm());
    expect(res.status).toBe(409);
    const { error } = await res.json();
    expect(error).toMatch(/active lease/);
  });

  it("requires the signed lease document", async () => {
    const res = await renewRequest(LEASE_RENEW.id, renewalForm({}, null));
    expect(res.status).toBe(422);
  });

  it("rejects non-document file types", async () => {
    const file = new File(["not a lease"], "renewal.txt", { type: "text/plain" });
    const res = await renewRequest(LEASE_RENEW.id, renewalForm({}, file));
    expect(res.status).toBe(422);
  });

  it("rejects an end date on or before the start date", async () => {
    const res = await renewRequest(LEASE_RENEW.id, renewalForm({ endDate: "2026-08-01" }));
    expect(res.status).toBe(422);
  });

  it("rejects a missing or non-positive rent amount", async () => {
    const res = await renewRequest(LEASE_RENEW.id, renewalForm({ rentAmount: "0" }));
    expect(res.status).toBe(422);
  });

  it("retires the old lease and creates the renewal atomically", async () => {
    const res = await renewRequest(LEASE_RENEW.id, renewalForm());
    expect(res.status).toBe(201);
    const { newLeaseId, oldLeaseId } = await res.json();
    expect(oldLeaseId).toBe(LEASE_RENEW.id);
    expect(newLeaseId).toBeTruthy();

    const oldLease = await prisma.leases.findUniqueOrThrow({ where: { id: LEASE_RENEW.id } });
    expect(oldLease.status).toBe("ended");

    const newLease = await prisma.leases.findUniqueOrThrow({ where: { id: newLeaseId } });
    expect(newLease.status).toBe("active");
    expect(newLease.unit_id).toBe(UNIT_RENEW.id);
    expect(Number(newLease.rent_amount)).toBe(2000);
    expect(Number(newLease.security_deposit)).toBe(2500);
    expect(Number(newLease.monthly_rent_credit)).toBe(100);
    expect(newLease.start_date.toISOString().slice(0, 10)).toBe(NEW_TERM.startDate);
    expect(newLease.end_date?.toISOString().slice(0, 10)).toBe(NEW_TERM.endDate);

    // All tenants carry over, keeping the same primary.
    const tenants = await prisma.lease_tenants.findMany({ where: { lease_id: newLeaseId } });
    expect(tenants).toHaveLength(2);
    expect(tenants.find((t) => t.is_primary)?.tenant_id).toBe(TENANT_PRIMARY.id);
    expect(tenants.find((t) => !t.is_primary)?.tenant_id).toBe(TENANT_SECONDARY.id);

    // The uploaded document is recorded in history and set as current.
    const documents = await prisma.lease_documents.findMany({ where: { lease_id: newLeaseId } });
    expect(documents).toHaveLength(1);
    expect(documents[0].kind).toBe("uploaded");
    expect(documents[0].file_name).toBe("renewal.pdf");
    expect(documents[0].uploaded_by).toBe(ADMIN_A.id);
    expect(newLease.document_url).toBe(documents[0].blob_url);
    expect(newLease.document_url).toMatch(/^https:\/\/blob\.integration\.test\/leases\//);

    // Twelve monthly payments: month 1 at full rent, the credit from month 2.
    const payments = await prisma.payments.findMany({
      where: { lease_id: newLeaseId },
      orderBy: { due_date: "asc" },
    });
    expect(payments).toHaveLength(12);
    expect(payments[0].due_date?.toISOString().slice(0, 10)).toBe(NEW_TERM.startDate);
    expect(Number(payments[0].amount)).toBe(2000);
    for (const payment of payments.slice(1)) {
      expect(Number(payment.amount)).toBe(1900);
      expect(payment.status).toBe("pending");
      expect(payment.tenant_id).toBe(TENANT_PRIMARY.id);
    }

    const unit = await prisma.units.findUniqueOrThrow({ where: { id: UNIT_RENEW.id } });
    expect(unit.status).toBe("occupied");
  });

  it("returns 409 when renewing a lease that was already renewed", async () => {
    const res = await renewRequest(LEASE_RENEW.id, renewalForm());
    expect(res.status).toBe(409);
  });
});
