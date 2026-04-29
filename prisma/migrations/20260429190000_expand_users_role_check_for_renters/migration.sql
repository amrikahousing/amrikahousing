ALTER TABLE "public"."users"
  DROP CONSTRAINT IF EXISTS "users_role_check";

ALTER TABLE "public"."users"
  ADD CONSTRAINT "users_role_check"
  CHECK (
    "role" IN (
      'property_manager',
      'operations_manager',
      'leasing_manager',
      'accounting_manager',
      'renter',
      'tenant'
    )
  );
