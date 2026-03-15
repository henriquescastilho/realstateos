ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "closing_day" integer DEFAULT 27;
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "due_date_day" integer DEFAULT 1;
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "payout_day" integer DEFAULT 4;
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "admin_fee_percent" numeric(5, 2) DEFAULT '10.00';
ALTER TABLE "lease_contracts" ADD COLUMN IF NOT EXISTS "admin_fee_minimum" numeric(12, 2) DEFAULT '180.00';
