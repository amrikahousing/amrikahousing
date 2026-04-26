CREATE TABLE "public"."organization_payment_destinations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "plaid_item_id" UUID NOT NULL,
    "plaid_account_id" TEXT,
    "destination_account_label" TEXT NOT NULL,
    "bank_institution_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "plaid_funding_account_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_payment_destinations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_payment_destinations_organization_id_key"
ON "public"."organization_payment_destinations"("organization_id");

CREATE INDEX "idx_org_payment_destinations_item"
ON "public"."organization_payment_destinations"("plaid_item_id");

CREATE INDEX "idx_org_payment_destinations_active"
ON "public"."organization_payment_destinations"("is_active");

ALTER TABLE "public"."organization_payment_destinations"
ADD CONSTRAINT "organization_payment_destinations_organization_id_fkey"
FOREIGN KEY ("organization_id")
REFERENCES "public"."organizations"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;

ALTER TABLE "public"."organization_payment_destinations"
ADD CONSTRAINT "organization_payment_destinations_plaid_item_id_fkey"
FOREIGN KEY ("plaid_item_id")
REFERENCES "public"."plaid_items"("id")
ON DELETE CASCADE
ON UPDATE NO ACTION;
