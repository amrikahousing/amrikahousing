ALTER TABLE "plaid_transactions"
  ADD COLUMN "merchant_name" text,
  ADD COLUMN "merchant_entity_id" text,
  ADD COLUMN "merchant_logo_url" text,
  ADD COLUMN "merchant_website" text,
  ADD COLUMN "category_icon_url" text,
  ADD COLUMN "counterparty_type" text;
