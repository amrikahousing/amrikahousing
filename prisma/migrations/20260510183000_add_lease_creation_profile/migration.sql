CREATE SCHEMA IF NOT EXISTS "lease";

ALTER TABLE "public"."properties"
  ADD COLUMN IF NOT EXISTS "landlord_name" TEXT,
  ADD COLUMN IF NOT EXISTS "property_manager_name" TEXT,
  ADD COLUMN IF NOT EXISTS "includes_electricity" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "includes_laundry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "has_pet_fee" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "includes_parking" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "includes_internet" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "lease"."lease_state_specific_clauses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "state" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "risk" TEXT NOT NULL DEFAULT 'info',
  "source" TEXT NOT NULL DEFAULT 'ai_review',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lease_state_specific_clauses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lease_state_specific_clauses_org_state_area_key"
  ON "lease"."lease_state_specific_clauses"("organization_id", "state", "area");

CREATE INDEX IF NOT EXISTS "idx_lease_state_clauses_org"
  ON "lease"."lease_state_specific_clauses"("organization_id");

CREATE INDEX IF NOT EXISTS "idx_lease_state_clauses_state"
  ON "lease"."lease_state_specific_clauses"("state");

CREATE INDEX IF NOT EXISTS "idx_lease_state_clauses_risk"
  ON "lease"."lease_state_specific_clauses"("risk");
