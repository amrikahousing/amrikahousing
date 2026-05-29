CREATE TABLE "public"."lease_template_clauses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lease_template_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "summary" TEXT,
    "risk_level" TEXT,
    "explanation" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'extracted',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_template_clauses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lease_template_clauses_template_order_key"
    ON "public"."lease_template_clauses"("lease_template_id", "sort_order");

CREATE INDEX "idx_lease_template_clauses_template"
    ON "public"."lease_template_clauses"("lease_template_id");

CREATE INDEX "idx_lease_template_clauses_org"
    ON "public"."lease_template_clauses"("organization_id");

CREATE INDEX "idx_lease_template_clauses_property"
    ON "public"."lease_template_clauses"("property_id");

CREATE INDEX "idx_lease_template_clauses_risk"
    ON "public"."lease_template_clauses"("risk_level");

ALTER TABLE "public"."lease_template_clauses"
    ADD CONSTRAINT "lease_template_clauses_lease_template_id_fkey"
    FOREIGN KEY ("lease_template_id") REFERENCES "public"."lease_templates"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."lease_template_clauses"
    ADD CONSTRAINT "lease_template_clauses_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."lease_template_clauses"
    ADD CONSTRAINT "lease_template_clauses_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
