ALTER TABLE "public"."users"
  DROP CONSTRAINT IF EXISTS "users_role_check";

UPDATE "public"."users"
SET "role" = CASE
  WHEN "role" = 'accounting_manager' THEN 'accountant'
  WHEN "role" = 'renter' THEN 'tenant'
  WHEN "role" = 'operations_manager' THEN 'property_manager'
  WHEN "role" = 'leasing_manager' THEN 'property_manager'
  ELSE "role"
END
WHERE "role" IN (
  'accounting_manager',
  'renter',
  'operations_manager',
  'leasing_manager'
);

ALTER TABLE "public"."users"
  ADD CONSTRAINT "users_role_check"
  CHECK (
    "role" IN (
      'admin',
      'property_manager',
      'accountant',
      'owner',
      'tenant',
      'maintenance_staff'
    )
  );

CREATE TABLE IF NOT EXISTS "public"."memberships" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "property_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "memberships_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "memberships_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "memberships_role_check"
    CHECK (
      "role" IN (
        'admin',
        'property_manager',
        'accountant',
        'owner',
        'tenant',
        'maintenance_staff'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_org_role_property_key"
  ON "public"."memberships" (
    "user_id",
    "organization_id",
    "role",
    COALESCE("property_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS "idx_memberships_user"
  ON "public"."memberships"("user_id");

CREATE INDEX IF NOT EXISTS "idx_memberships_org"
  ON "public"."memberships"("organization_id");

CREATE INDEX IF NOT EXISTS "idx_memberships_property"
  ON "public"."memberships"("property_id");

CREATE INDEX IF NOT EXISTS "idx_memberships_role"
  ON "public"."memberships"("role");

INSERT INTO "public"."memberships" (
  "user_id",
  "organization_id",
  "role",
  "property_id",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  u."id",
  u."organization_id",
  CASE
    WHEN u."role" = 'accounting_manager' THEN 'accountant'
    WHEN u."role" = 'renter' THEN 'tenant'
    WHEN u."role" = 'operations_manager' THEN 'property_manager'
    WHEN u."role" = 'leasing_manager' THEN 'property_manager'
    ELSE u."role"
  END,
  pa."property_id",
  u."is_active",
  now(),
  now()
FROM "public"."users" u
LEFT JOIN "public"."property_assignments" pa
  ON pa."user_id" = u."id"
WHERE u."organization_id" IS NOT NULL
  AND u."deleted_at" IS NULL
  AND CASE
    WHEN u."role" = 'accounting_manager' THEN 'accountant'
    WHEN u."role" = 'renter' THEN 'tenant'
    WHEN u."role" = 'operations_manager' THEN 'property_manager'
    WHEN u."role" = 'leasing_manager' THEN 'property_manager'
    ELSE u."role"
  END IN (
    'admin',
    'property_manager',
    'accountant',
    'owner',
    'tenant',
    'maintenance_staff'
  )
ON CONFLICT DO NOTHING;
