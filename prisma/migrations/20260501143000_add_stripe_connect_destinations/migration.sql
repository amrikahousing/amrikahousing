ALTER TABLE "public"."organizations"
ADD COLUMN "stripe_account_id" TEXT,
ADD COLUMN "stripe_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripe_payouts_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "organizations_stripe_account_id_key"
ON "public"."organizations"("stripe_account_id");

ALTER TABLE "public"."organization_payment_destinations"
ADD COLUMN "stripe_external_account_id" TEXT;
