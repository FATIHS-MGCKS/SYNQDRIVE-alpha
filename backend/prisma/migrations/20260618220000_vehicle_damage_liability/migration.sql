-- Vehicle damage liability tracking for rental handover workflows
CREATE TYPE "DamageLiabilityStatus" AS ENUM (
  'NOT_APPLICABLE',
  'NEEDS_REVIEW',
  'CUSTOMER_RESPONSIBLE',
  'COMPANY_RESPONSIBLE',
  'INSURANCE_CLAIM',
  'DISPUTED'
);

ALTER TABLE "vehicle_damages"
  ADD COLUMN "liability_status" "DamageLiabilityStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "liability_note" TEXT;
