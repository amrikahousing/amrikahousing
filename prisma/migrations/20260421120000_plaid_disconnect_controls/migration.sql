ALTER TABLE "plaid_items"
  ADD COLUMN "sync_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN "last_synced_at" timestamptz(6),
  ADD COLUMN "disconnected_at" timestamptz(6),
  ADD COLUMN "hidden_at" timestamptz(6);

ALTER TABLE "plaid_transactions"
  ADD COLUMN "source" text NOT NULL DEFAULT 'plaid',
  ADD COLUMN "connection_id" text;

CREATE INDEX "idx_plaid_transactions_connection_id" ON "plaid_transactions"("connection_id");

CREATE TABLE "plaid_item_audit_logs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "plaid_item_id" uuid,
  "action" text NOT NULL,
  "actor_id" text,
  "metadata" jsonb,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "plaid_item_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plaid_item_audit_logs_org_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE INDEX "idx_plaid_item_audit_logs_org" ON "plaid_item_audit_logs"("organization_id");
CREATE INDEX "idx_plaid_item_audit_logs_item" ON "plaid_item_audit_logs"("plaid_item_id");
CREATE INDEX "idx_plaid_item_audit_logs_action" ON "plaid_item_audit_logs"("action");

CREATE TABLE "plaid_data_deletion_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "plaid_item_id" uuid NOT NULL,
  "requested_by" text,
  "status" text NOT NULL DEFAULT 'pending',
  "notes" text,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "processed_at" timestamptz(6),
  CONSTRAINT "plaid_data_deletion_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plaid_data_deletion_requests_org_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE INDEX "idx_plaid_deletion_requests_org" ON "plaid_data_deletion_requests"("organization_id");
CREATE INDEX "idx_plaid_deletion_requests_item" ON "plaid_data_deletion_requests"("plaid_item_id");
CREATE INDEX "idx_plaid_deletion_requests_status" ON "plaid_data_deletion_requests"("status");
