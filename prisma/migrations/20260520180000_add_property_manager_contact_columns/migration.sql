ALTER TABLE "public"."properties"
  ADD COLUMN IF NOT EXISTS "property_manager_email" TEXT,
  ADD COLUMN IF NOT EXISTS "property_manager_phone" TEXT;
