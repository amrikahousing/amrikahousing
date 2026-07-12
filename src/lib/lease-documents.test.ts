import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import {
  ALLOWED_LEASE_MIME,
  MAX_LEASE_FILE_BYTES,
  leaseFileExtension,
  recordLeaseDocument,
} from "@/lib/lease-documents";

// uploadLeaseDocumentBlob is intentionally not covered — it calls Vercel Blob.

describe("ALLOWED_LEASE_MIME", () => {
  it("accepts exactly the PDF and image types leases support", () => {
    expect(ALLOWED_LEASE_MIME.has("application/pdf")).toBe(true);
    expect(ALLOWED_LEASE_MIME.has("image/jpeg")).toBe(true);
    expect(ALLOWED_LEASE_MIME.has("image/jpg")).toBe(true);
    expect(ALLOWED_LEASE_MIME.has("image/png")).toBe(true);
    expect(ALLOWED_LEASE_MIME.size).toBe(4);
  });

  it("rejects other common upload types", () => {
    for (const mime of [
      "image/gif",
      "image/svg+xml",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/html",
      "",
    ]) {
      expect(ALLOWED_LEASE_MIME.has(mime), mime).toBe(false);
    }
  });

  it("is case-sensitive (uppercase MIME variants are not allowed)", () => {
    expect(ALLOWED_LEASE_MIME.has("APPLICATION/PDF")).toBe(false);
  });
});

describe("MAX_LEASE_FILE_BYTES", () => {
  it("caps lease uploads at 20 MiB", () => {
    expect(MAX_LEASE_FILE_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_LEASE_FILE_BYTES).toBe(20_971_520);
  });
});

describe("leaseFileExtension", () => {
  it("returns the lowercased extension of a normal file name", () => {
    expect(leaseFileExtension("lease.pdf")).toBe("pdf");
    expect(leaseFileExtension("SCAN.JPEG")).toBe("jpeg");
    expect(leaseFileExtension("photo.PnG")).toBe("png");
  });

  it("uses the last segment of multi-dot names", () => {
    expect(leaseFileExtension("2026.07.lease.final.pdf")).toBe("pdf");
    expect(leaseFileExtension("archive.tar.gz")).toBe("gz");
  });

  it("falls back to pdf when the extension is longer than 5 characters", () => {
    expect(leaseFileExtension("photo.jpeg.backup")).toBe("pdf");
    expect(leaseFileExtension("x.abcdef")).toBe("pdf");
  });

  it("keeps extensions of exactly 5 characters", () => {
    expect(leaseFileExtension("x.abcde")).toBe("abcde");
  });

  it("falls back to pdf for empty names and trailing dots", () => {
    expect(leaseFileExtension("")).toBe("pdf");
    expect(leaseFileExtension("lease.")).toBe("pdf");
  });

  it("treats a leading-dot name's suffix as the extension", () => {
    expect(leaseFileExtension(".env")).toBe("env");
  });

  // Current behavior: an extension-less name of 5 chars or fewer is returned
  // as-is (e.g. "scan" -> "scan"), because split(".").pop() yields the whole
  // name. Longer extension-less names fall back to "pdf".
  it("returns short extension-less names verbatim and long ones as pdf (current behavior)", () => {
    expect(leaseFileExtension("scan")).toBe("scan");
    expect(leaseFileExtension("document")).toBe("pdf");
  });
});

describe("recordLeaseDocument", () => {
  function makeTx() {
    const create = vi.fn(async (_args: unknown) => ({ id: "doc_1" }));
    const update = vi.fn(async (_args: unknown) => ({}));
    const tx = {
      lease_documents: { create },
      leases: { update },
    } as unknown as Prisma.TransactionClient;
    return { tx, create, update };
  }

  const input = {
    leaseId: "lease_1",
    blobUrl: "https://blob.example/lease.pdf",
    fileName: "lease.pdf",
    contentType: "application/pdf",
    kind: "uploaded" as const,
  };

  it("appends a history row and points the lease at the new blob", async () => {
    const { tx, create, update } = makeTx();

    const result = await recordLeaseDocument(tx, { ...input, uploadedBy: "user_9" });

    expect(result).toEqual({ id: "doc_1" });
    expect(create).toHaveBeenCalledWith({
      data: {
        lease_id: "lease_1",
        blob_url: "https://blob.example/lease.pdf",
        file_name: "lease.pdf",
        content_type: "application/pdf",
        kind: "uploaded",
        uploaded_by: "user_9",
      },
      select: { id: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "lease_1" },
      data: {
        document_url: "https://blob.example/lease.pdf",
        updated_at: expect.any(Date),
      },
    });
  });

  it("defaults uploaded_by to null when the uploader is omitted", async () => {
    const { tx, create } = makeTx();

    await recordLeaseDocument(tx, { ...input, kind: "docuseal" });

    const data = (create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.uploaded_by).toBeNull();
    expect(data.kind).toBe("docuseal");
  });
});
