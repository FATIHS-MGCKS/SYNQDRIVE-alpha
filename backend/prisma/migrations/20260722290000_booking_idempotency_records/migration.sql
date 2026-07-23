-- Booking idempotency ledger (Prompt 12) + status command request fingerprints.

ALTER TABLE "booking_status_commands"
  ADD COLUMN "request_fingerprint" TEXT;

CREATE TYPE "BookingIdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TYPE "BookingIdempotencyOperation" AS ENUM (
  'BOOKING_CREATE',
  'BOOKING_UPDATE_SCHEDULE',
  'BOOKING_UPDATE_VEHICLE',
  'BOOKING_DOCUMENT_GENERATE',
  'BOOKING_DOCUMENT_EMAIL',
  'BOOKING_INVOICE_BOOTSTRAP'
);

CREATE TABLE "booking_idempotency_records" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "actor_scope" TEXT NOT NULL,
  "operation" "BookingIdempotencyOperation" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "resource_id" TEXT,
  "request_fingerprint" TEXT NOT NULL,
  "status" "BookingIdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
  "result_reference" TEXT,
  "result_payload" JSONB,
  "error_code" TEXT,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "booking_idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_idempotency_records_scope_key"
  ON "booking_idempotency_records"("organization_id", "actor_scope", "operation", "idempotency_key");

CREATE INDEX "booking_idempotency_records_org_resource_idx"
  ON "booking_idempotency_records"("organization_id", "resource_id");

CREATE INDEX "booking_idempotency_records_expires_at_idx"
  ON "booking_idempotency_records"("expires_at");

ALTER TABLE "booking_idempotency_records"
  ADD CONSTRAINT "booking_idempotency_records_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
