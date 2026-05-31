ALTER TABLE "renter"."leases"
ADD COLUMN IF NOT EXISTS "monthly_rent_credit" DECIMAL(10, 2);
