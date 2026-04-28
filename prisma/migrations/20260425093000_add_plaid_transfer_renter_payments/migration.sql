ALTER TABLE "renter"."renter_payment_methods"
  ADD COLUMN "payment_provider" text NOT NULL DEFAULT 'stripe',
  ADD COLUMN "plaid_access_token" text,
  ADD COLUMN "plaid_item_id" text,
  ADD COLUMN "plaid_account_id" text,
  ADD COLUMN "plaid_institution_id" text,
  ADD COLUMN "plaid_link_session_id" text,
  ADD COLUMN "plaid_transfer_eligible" boolean NOT NULL DEFAULT false;

ALTER TABLE "renter"."renter_payment_methods"
  ALTER COLUMN "stripe_customer_id" DROP NOT NULL,
  ALTER COLUMN "stripe_payment_method_id" DROP NOT NULL,
  ALTER COLUMN "last4" TYPE text;

ALTER TABLE "renter"."payment_attempts"
  ADD COLUMN "payment_provider" text NOT NULL DEFAULT 'stripe',
  ADD COLUMN "plaid_authorization_id" text,
  ADD COLUMN "plaid_transfer_id" text,
  ADD COLUMN "plaid_last_event_id" bigint,
  ADD COLUMN "consent_text" text,
  ADD COLUMN "consent_accepted_at" timestamptz(6),
  ADD COLUMN "consent_ip_address" text,
  ADD COLUMN "consent_user_agent" text;

ALTER TABLE "renter"."payment_attempts"
  ALTER COLUMN "stripe_payment_intent_id" DROP NOT NULL;

CREATE UNIQUE INDEX "payment_attempts_plaid_authorization_id_key"
  ON "renter"."payment_attempts"("plaid_authorization_id");

CREATE UNIQUE INDEX "payment_attempts_plaid_transfer_id_key"
  ON "renter"."payment_attempts"("plaid_transfer_id");
