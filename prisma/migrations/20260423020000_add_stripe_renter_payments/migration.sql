CREATE TABLE "renter"."renter_payment_methods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "organization_id" UUID NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "stripe_payment_method_id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" CHAR(4) NOT NULL,
    "exp_month" INTEGER NOT NULL,
    "exp_year" INTEGER NOT NULL,
    "billing_name" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "renter_payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "renter"."renter_payment_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "organization_id" UUID NOT NULL,
    "stripe_customer_id" TEXT,
    "default_payment_method_id" UUID,
    "autopay_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renter_payment_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "renter"."payment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "organization_id" UUID NOT NULL,
    "renter_payment_method_id" UUID,
    "stripe_payment_intent_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'requires_payment_method',
    "failure_code" TEXT,
    "failure_message" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "renter_payment_methods_stripe_payment_method_id_key"
ON "renter"."renter_payment_methods"("stripe_payment_method_id");

CREATE INDEX "idx_renter_payment_methods_deleted_at"
ON "renter"."renter_payment_methods"("deleted_at")
WHERE "deleted_at" IS NULL;

CREATE INDEX "idx_renter_payment_methods_org"
ON "renter"."renter_payment_methods"("organization_id");

CREATE INDEX "idx_renter_payment_methods_tenant"
ON "renter"."renter_payment_methods"("tenant_id");

CREATE INDEX "idx_renter_payment_methods_user"
ON "renter"."renter_payment_methods"("user_id");

CREATE UNIQUE INDEX "renter_payment_settings_tenant_id_key"
ON "renter"."renter_payment_settings"("tenant_id");

CREATE UNIQUE INDEX "renter_payment_settings_stripe_customer_id_key"
ON "renter"."renter_payment_settings"("stripe_customer_id");

CREATE INDEX "idx_renter_payment_settings_org"
ON "renter"."renter_payment_settings"("organization_id");

CREATE INDEX "idx_renter_payment_settings_user"
ON "renter"."renter_payment_settings"("user_id");

CREATE UNIQUE INDEX "payment_attempts_stripe_payment_intent_id_key"
ON "renter"."payment_attempts"("stripe_payment_intent_id");

CREATE UNIQUE INDEX "payment_attempts_idempotency_key_key"
ON "renter"."payment_attempts"("idempotency_key");

CREATE INDEX "idx_payment_attempts_org"
ON "renter"."payment_attempts"("organization_id");

CREATE INDEX "idx_payment_attempts_payment"
ON "renter"."payment_attempts"("payment_id");

CREATE INDEX "idx_payment_attempts_method"
ON "renter"."payment_attempts"("renter_payment_method_id");

CREATE INDEX "idx_payment_attempts_status"
ON "renter"."payment_attempts"("status");

CREATE INDEX "idx_payment_attempts_tenant"
ON "renter"."payment_attempts"("tenant_id");

CREATE INDEX "idx_payment_attempts_user"
ON "renter"."payment_attempts"("user_id");

ALTER TABLE "renter"."renter_payment_methods"
ADD CONSTRAINT "renter_payment_methods_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "renter"."tenants"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "renter"."renter_payment_methods"
ADD CONSTRAINT "renter_payment_methods_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "renter"."renter_payment_methods"
ADD CONSTRAINT "renter_payment_methods_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "renter"."renter_payment_settings"
ADD CONSTRAINT "renter_payment_settings_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "renter"."tenants"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "renter"."renter_payment_settings"
ADD CONSTRAINT "renter_payment_settings_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "renter"."renter_payment_settings"
ADD CONSTRAINT "renter_payment_settings_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "renter"."renter_payment_settings"
ADD CONSTRAINT "renter_payment_settings_default_payment_method_id_fkey"
FOREIGN KEY ("default_payment_method_id") REFERENCES "renter"."renter_payment_methods"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "renter"."payment_attempts"
ADD CONSTRAINT "payment_attempts_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "renter"."payments"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "renter"."payment_attempts"
ADD CONSTRAINT "payment_attempts_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "renter"."tenants"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "renter"."payment_attempts"
ADD CONSTRAINT "payment_attempts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "renter"."payment_attempts"
ADD CONSTRAINT "payment_attempts_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "renter"."payment_attempts"
ADD CONSTRAINT "payment_attempts_renter_payment_method_id_fkey"
FOREIGN KEY ("renter_payment_method_id") REFERENCES "renter"."renter_payment_methods"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;
