-- Didit customer verification foundation
-- Adds canonical verification checks, webhook audit table, and PROOF_OF_ADDRESS document type.
-- Idempotent where practical.

-- 1) Extend CustomerDocumentType
ALTER TYPE "CustomerDocumentType" ADD VALUE IF NOT EXISTS 'PROOF_OF_ADDRESS';

-- 2) New enums
DO $$ BEGIN
  CREATE TYPE "CustomerVerificationProvider" AS ENUM ('MANUAL', 'DIDIT', 'SYNQDRIVE_AI_UPLOAD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerVerificationCheckKind" AS ENUM ('ID_DOCUMENT', 'DRIVING_LICENSE', 'PROOF_OF_ADDRESS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerVerificationCheckStatus" AS ENUM (
    'NOT_STARTED',
    'PENDING',
    'IN_PROGRESS',
    'AWAITING_USER',
    'VERIFIED',
    'REQUIRES_REVIEW',
    'REJECTED',
    'EXPIRED',
    'KYC_EXPIRED',
    'ABANDONED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Customer verification checks (canonical provider decisions)
CREATE TABLE IF NOT EXISTS "customer_verification_checks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "booking_id" TEXT,
  "provider" "CustomerVerificationProvider" NOT NULL,
  "kind" "CustomerVerificationCheckKind" NOT NULL,
  "status" "CustomerVerificationCheckStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "provider_session_id" TEXT,
  "provider_workflow_id" TEXT,
  "provider_status" TEXT,
  "provider_url" TEXT,
  "vendor_data" TEXT,
  "extracted_json" JSONB,
  "decision_json" JSONB,
  "warnings" JSONB,
  "checked_by_user_id" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "retention_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_verification_checks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_verification_checks_provider_provider_session_id_key"
  ON "customer_verification_checks"("provider", "provider_session_id");

CREATE INDEX IF NOT EXISTS "customer_verification_checks_organization_id_customer_id_kind_status_idx"
  ON "customer_verification_checks"("organization_id", "customer_id", "kind", "status");

CREATE INDEX IF NOT EXISTS "customer_verification_checks_booking_id_idx"
  ON "customer_verification_checks"("booking_id");

DO $$ BEGIN
  ALTER TABLE "customer_verification_checks"
    ADD CONSTRAINT "customer_verification_checks_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_verification_checks"
    ADD CONSTRAINT "customer_verification_checks_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customer_verification_checks"
    ADD CONSTRAINT "customer_verification_checks_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Didit webhook idempotency / audit
CREATE TABLE IF NOT EXISTS "didit_webhook_events" (
  "id" TEXT NOT NULL,
  "event_id" TEXT,
  "session_id" TEXT,
  "event_type" TEXT,
  "provider_status" TEXT,
  "payload_hash" TEXT NOT NULL,
  "signature_valid" BOOLEAN NOT NULL DEFAULT false,
  "processed_at" TIMESTAMP(3),
  "raw_payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "didit_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "didit_webhook_events_payload_hash_key"
  ON "didit_webhook_events"("payload_hash");

CREATE UNIQUE INDEX IF NOT EXISTS "didit_webhook_events_event_id_key"
  ON "didit_webhook_events"("event_id");

CREATE INDEX IF NOT EXISTS "didit_webhook_events_session_id_idx"
  ON "didit_webhook_events"("session_id");
