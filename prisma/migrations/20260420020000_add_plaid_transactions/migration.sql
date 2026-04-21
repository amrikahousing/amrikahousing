CREATE TABLE "plaid_transactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "plaid_item_id" uuid NOT NULL,
    "organization_id" uuid NOT NULL,
    "plaid_transaction_id" text NOT NULL,
    "account_id" text NOT NULL,
    "account_name" text,
    "date" date,
    "description" text NOT NULL DEFAULT '',
    "amount" decimal(12, 2) NOT NULL DEFAULT 0,
    "is_income" boolean NOT NULL DEFAULT false,
    "category" text NOT NULL DEFAULT 'uncategorized',
    "created_at" timestamptz(6) NOT NULL DEFAULT now(),
    "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "plaid_transactions_item_fkey"
      FOREIGN KEY ("plaid_item_id")
      REFERENCES "plaid_items"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION,
    CONSTRAINT "plaid_transactions_org_fkey"
      FOREIGN KEY ("organization_id")
      REFERENCES "organizations"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "plaid_transactions_item_transaction_key"
  ON "plaid_transactions"("plaid_item_id", "plaid_transaction_id");
CREATE INDEX "idx_plaid_transactions_org" ON "plaid_transactions"("organization_id");
CREATE INDEX "idx_plaid_transactions_item" ON "plaid_transactions"("plaid_item_id");
CREATE INDEX "idx_plaid_transactions_date" ON "plaid_transactions"("date");
