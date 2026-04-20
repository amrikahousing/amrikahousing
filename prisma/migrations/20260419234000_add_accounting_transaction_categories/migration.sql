CREATE TABLE IF NOT EXISTS "accounting_transaction_categories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "transaction_id" text NOT NULL,
    "source" text NOT NULL,
    "category" text NOT NULL,
    "created_by" text,
    "created_at" timestamptz(6) NOT NULL DEFAULT now(),
    "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "accounting_transaction_categories_organization_id_fkey"
      FOREIGN KEY ("organization_id")
      REFERENCES "organizations"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_transaction_categories_org_source_transaction_key"
  ON "accounting_transaction_categories"("organization_id", "source", "transaction_id");

CREATE INDEX IF NOT EXISTS "idx_accounting_transaction_categories_category"
  ON "accounting_transaction_categories"("category");

CREATE INDEX IF NOT EXISTS "idx_accounting_transaction_categories_org"
  ON "accounting_transaction_categories"("organization_id");
