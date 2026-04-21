ALTER TABLE "accounting_transaction_categories"
  ADD COLUMN IF NOT EXISTS "updated_by" text;

UPDATE "accounting_transaction_categories"
SET "updated_by" = "created_by"
WHERE "updated_by" IS NULL;
