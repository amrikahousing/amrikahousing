CREATE TABLE IF NOT EXISTS "manual_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "date" date NOT NULL,
  "description" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "is_income" boolean NOT NULL DEFAULT false,
  "category" text NOT NULL DEFAULT 'Uncategorized',
  "account_label" text NOT NULL DEFAULT 'Manual',
  "notes" text,
  "reference" text,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamptz(6),
  CONSTRAINT "manual_transactions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_manual_transactions_org"
  ON "manual_transactions" ("organization_id");

CREATE INDEX IF NOT EXISTS "idx_manual_transactions_date"
  ON "manual_transactions" ("date");

CREATE INDEX IF NOT EXISTS "idx_manual_transactions_deleted_at"
  ON "manual_transactions" ("deleted_at");
