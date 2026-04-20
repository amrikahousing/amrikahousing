CREATE TABLE IF NOT EXISTS "accounting_vendor_category_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "vendor_key" text NOT NULL,
  "vendor_name" text NOT NULL,
  "category" text NOT NULL,
  "bank" text NOT NULL DEFAULT '',
  "account" text NOT NULL DEFAULT '',
  "rule_source" text NOT NULL DEFAULT 'ai',
  "confidence" double precision,
  "reason" text,
  "created_by" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_vendor_category_rules_organization_id_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_vendor_rules_org_vendor_context_key"
  ON "accounting_vendor_category_rules" (
    "organization_id",
    "vendor_key",
    "bank",
    "account"
  );

CREATE INDEX IF NOT EXISTS "idx_accounting_vendor_rules_org"
  ON "accounting_vendor_category_rules"("organization_id");

CREATE INDEX IF NOT EXISTS "idx_accounting_vendor_rules_vendor"
  ON "accounting_vendor_category_rules"("vendor_key");

CREATE INDEX IF NOT EXISTS "idx_accounting_vendor_rules_category"
  ON "accounting_vendor_category_rules"("category");
