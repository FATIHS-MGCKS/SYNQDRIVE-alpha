-- Customer Module Overhaul
-- Risk assessment, documents, eligibility, timeline, normalized fields, archive.
-- Idempotent; existing LOW risk customers remain LOW; new defaults use NOT_ASSESSED.
-- NOT_ASSESSED enum value is added in 20260615115900_customer_risk_not_assessed_enum.

-- 1) New enums
DO $$ BEGIN
  CREATE TYPE "CustomerRiskSource" AS ENUM ('NONE', 'MANUAL', 'SYSTEM', 'AI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerDocumentType" AS ENUM ('ID_FRONT', 'ID_BACK', 'LICENSE_FRONT', 'LICENSE_BACK', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerDocumentStatus" AS ENUM ('UPLOADED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerTimelineEventType" AS ENUM (
    'CREATED', 'UPDATED', 'STATUS_CHANGED', 'RISK_CHANGED',
    'DOCUMENT_UPLOADED', 'DOCUMENT_VERIFIED', 'DOCUMENT_REJECTED',
    'BOOKING_CREATED', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'BOOKING_NO_SHOW',
    'PICKUP_COMPLETED', 'RETURN_COMPLETED', 'INVOICE_CREATED', 'PAYMENT_RECEIVED',
    'FINE_CREATED', 'DAMAGE_REPORTED', 'TASK_CREATED', 'NOTE_ADDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Customer extensions
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tax_id" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "risk_source" "CustomerRiskSource" NOT NULL DEFAULT 'NONE';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "risk_reason" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "risk_updated_at" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "risk_updated_by_user_id" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "id_verification_status" "CustomerVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "license_verification_status" "CustomerVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email_normalized" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phone_normalized" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "license_number_normalized" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "id_number_normalized" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "full_name_normalized" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "archived_by_user_id" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "archive_reason" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "pii_anonymized_at" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "pii_anonymized_by_user_id" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "retention_until" TIMESTAMP(3);

-- Default for NEW rows only (existing LOW rows unchanged)
ALTER TABLE "customers" ALTER COLUMN "risk_level" SET DEFAULT 'NOT_ASSESSED';

CREATE INDEX IF NOT EXISTS "customers_organization_id_email_normalized_idx" ON "customers"("organization_id", "email_normalized");
CREATE INDEX IF NOT EXISTS "customers_organization_id_phone_normalized_idx" ON "customers"("organization_id", "phone_normalized");
CREATE INDEX IF NOT EXISTS "customers_organization_id_license_number_normalized_idx" ON "customers"("organization_id", "license_number_normalized");
CREATE INDEX IF NOT EXISTS "customers_organization_id_id_number_normalized_idx" ON "customers"("organization_id", "id_number_normalized");
CREATE INDEX IF NOT EXISTS "customers_organization_id_full_name_normalized_idx" ON "customers"("organization_id", "full_name_normalized");

-- Backfill verification status from legacy booleans
UPDATE "customers"
SET "id_verification_status" = 'VERIFIED'
WHERE "id_verified" = true AND "id_verification_status" = 'NOT_SUBMITTED';

UPDATE "customers"
SET "license_verification_status" = 'VERIFIED'
WHERE "license_verified" = true AND "license_verification_status" = 'NOT_SUBMITTED';

UPDATE "customers"
SET "id_verification_status" = 'PENDING_REVIEW'
WHERE "id_verification_status" = 'NOT_SUBMITTED'
  AND ("id_front_url" IS NOT NULL OR "id_back_url" IS NOT NULL);

UPDATE "customers"
SET "license_verification_status" = 'PENDING_REVIEW'
WHERE "license_verification_status" = 'NOT_SUBMITTED'
  AND ("license_front_url" IS NOT NULL OR "license_back_url" IS NOT NULL);

-- 4) Customer documents
CREATE TABLE IF NOT EXISTS "customer_documents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "type" "CustomerDocumentType" NOT NULL,
  "status" "CustomerDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "file_key" TEXT NOT NULL,
  "original_file_name" TEXT,
  "mime_type" TEXT,
  "size_bytes" INTEGER,
  "extracted_json" JSONB,
  "uploaded_by_user_id" TEXT,
  "reviewed_by_user_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "rejected_reason" TEXT,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_documents_organization_id_idx" ON "customer_documents"("organization_id");
CREATE INDEX IF NOT EXISTS "customer_documents_customer_id_idx" ON "customer_documents"("customer_id");
CREATE INDEX IF NOT EXISTS "customer_documents_type_idx" ON "customer_documents"("type");
CREATE INDEX IF NOT EXISTS "customer_documents_status_idx" ON "customer_documents"("status");

DO $$ BEGIN
  ALTER TABLE "customer_documents"
    ADD CONSTRAINT "customer_documents_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_documents"
    ADD CONSTRAINT "customer_documents_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) Customer timeline
CREATE TABLE IF NOT EXISTS "customer_timeline_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "type" "CustomerTimelineEventType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_timeline_events_organization_id_idx" ON "customer_timeline_events"("organization_id");
CREATE INDEX IF NOT EXISTS "customer_timeline_events_customer_id_idx" ON "customer_timeline_events"("customer_id");
CREATE INDEX IF NOT EXISTS "customer_timeline_events_created_at_idx" ON "customer_timeline_events"("created_at");

DO $$ BEGIN
  ALTER TABLE "customer_timeline_events"
    ADD CONSTRAINT "customer_timeline_events_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_timeline_events"
    ADD CONSTRAINT "customer_timeline_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6) Eligibility policy (one per org)
CREATE TABLE IF NOT EXISTS "customer_eligibility_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "require_verified_id_for_confirmed_booking" BOOLEAN NOT NULL DEFAULT false,
  "require_verified_license_for_confirmed_booking" BOOLEAN NOT NULL DEFAULT false,
  "require_verified_id_for_pickup" BOOLEAN NOT NULL DEFAULT true,
  "require_verified_license_for_pickup" BOOLEAN NOT NULL DEFAULT true,
  "block_expired_license" BOOLEAN NOT NULL DEFAULT true,
  "block_expired_id" BOOLEAN NOT NULL DEFAULT true,
  "warn_license_expiring_within_days" INTEGER NOT NULL DEFAULT 30,
  "warn_id_expiring_within_days" INTEGER NOT NULL DEFAULT 30,
  "block_high_risk_customer" BOOLEAN NOT NULL DEFAULT false,
  "block_open_overdue_invoices" BOOLEAN NOT NULL DEFAULT false,
  "block_open_fines" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_eligibility_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_eligibility_policies_organization_id_key" ON "customer_eligibility_policies"("organization_id");

DO $$ BEGIN
  ALTER TABLE "customer_eligibility_policies"
    ADD CONSTRAINT "customer_eligibility_policies_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
