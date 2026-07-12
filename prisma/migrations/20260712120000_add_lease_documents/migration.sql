-- Append-only history of signed lease documents. leases.document_url stays the
-- "current document" pointer; every write to it must also insert a row here.
CREATE TABLE IF NOT EXISTS "renter"."lease_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lease_id" uuid NOT NULL REFERENCES "renter"."leases"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  "blob_url" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'uploaded',
  "uploaded_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lease_documents_kind_check" CHECK ("kind" IN ('uploaded', 'docuseal'))
);

CREATE INDEX IF NOT EXISTS "idx_lease_documents_lease" ON "renter"."lease_documents" ("lease_id");

-- Backfill: one history row per lease that already has a document.
INSERT INTO "renter"."lease_documents" ("lease_id", "blob_url", "file_name", "content_type", "kind")
SELECT
  "id",
  "document_url",
  split_part("document_url", '/', -1),
  CASE
    WHEN "document_url" ILIKE '%.png' THEN 'image/png'
    WHEN "document_url" ILIKE '%.jpg' OR "document_url" ILIKE '%.jpeg' THEN 'image/jpeg'
    ELSE 'application/pdf'
  END,
  CASE WHEN "document_url" LIKE '%docuseal-completed%' THEN 'docuseal' ELSE 'uploaded' END
FROM "renter"."leases"
WHERE "document_url" IS NOT NULL;

-- Broaden the lease status check: the app writes 'pending_signature' and 'error'
-- (e-sign flow), which the original constraint predates, and renewals introduce
-- 'ended' for superseded leases.
ALTER TABLE "renter"."leases"
  DROP CONSTRAINT IF EXISTS "leases_status_check";

ALTER TABLE "renter"."leases"
  ADD CONSTRAINT "leases_status_check"
  CHECK (
    "status" IN (
      'pending',
      'active',
      'expired',
      'terminated',
      'pending_signature',
      'error',
      'ended'
    )
  );
