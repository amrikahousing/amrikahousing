CREATE TABLE "plaid_institutions" (
  "institution_id" text NOT NULL,
  "name" text NOT NULL,
  "logo_url" text,
  "source" text NOT NULL DEFAULT 'plaid',
  "last_fetched_at" timestamptz(6) NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "plaid_institutions_pkey" PRIMARY KEY ("institution_id")
);

INSERT INTO "plaid_institutions" (
  "institution_id",
  "name",
  "source",
  "last_fetched_at"
)
SELECT DISTINCT ON ("institution_id")
  "institution_id",
  COALESCE(NULLIF("institution_name", ''), "institution_id"),
  'plaid',
  now()
FROM "plaid_items"
WHERE "institution_id" IS NOT NULL;

CREATE INDEX "idx_plaid_items_institution"
  ON "plaid_items"("institution_id");

ALTER TABLE "plaid_items"
  ADD CONSTRAINT "plaid_items_institution_id_fkey"
  FOREIGN KEY ("institution_id")
  REFERENCES "plaid_institutions"("institution_id")
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
