ALTER TABLE "renter"."renter_payment_methods"
ADD COLUMN "payment_type" TEXT NOT NULL DEFAULT 'card',
ADD COLUMN "bank_name" TEXT,
ADD COLUMN "bank_account_type" TEXT,
ALTER COLUMN "brand" DROP NOT NULL,
ALTER COLUMN "exp_month" DROP NOT NULL,
ALTER COLUMN "exp_year" DROP NOT NULL;
