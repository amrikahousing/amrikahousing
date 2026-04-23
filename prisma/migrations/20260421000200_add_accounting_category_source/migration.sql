ALTER TABLE "accounting_transaction_categories"
  ADD COLUMN IF NOT EXISTS "category_source" text NOT NULL DEFAULT 'manual';

UPDATE "accounting_transaction_categories"
SET "category_source" = 'vendor_rule'
WHERE "category_source" = 'manual';
