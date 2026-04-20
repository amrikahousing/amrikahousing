CREATE TABLE "plaid_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "organization_id" uuid NOT NULL,
    "item_id" text NOT NULL,
    "access_token" text NOT NULL,
    "institution_id" text,
    "institution_name" text,
    "status" text NOT NULL DEFAULT 'connected',
    "transactions_cursor" text,
    "created_by" text,
    "created_at" timestamptz(6) NOT NULL DEFAULT now(),
    "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
    CONSTRAINT "plaid_items_organization_id_fkey"
      FOREIGN KEY ("organization_id")
      REFERENCES "organizations"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "plaid_items_item_id_key" ON "plaid_items"("item_id");
CREATE INDEX "idx_plaid_items_org" ON "plaid_items"("organization_id");
