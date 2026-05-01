ALTER TABLE "renter"."leases"
ADD COLUMN IF NOT EXISTS "document_url" TEXT;
