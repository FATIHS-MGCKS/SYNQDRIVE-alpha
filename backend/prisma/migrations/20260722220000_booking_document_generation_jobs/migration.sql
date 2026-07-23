-- Booking document generation workflow jobs (Prompt 19/32)

CREATE TABLE IF NOT EXISTS "booking_document_generation_jobs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "bundle_id" TEXT,
  "job_type" TEXT NOT NULL,
  "document_type" TEXT,
  "handover_protocol_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "next_retry_at" TIMESTAMP(3),
  "last_attempt_at" TIMESTAMP(3),
  "bull_job_id" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "requested_by_user_id" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_document_generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_document_generation_jobs_org_idempotency_key"
  ON "booking_document_generation_jobs"("organization_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "booking_document_generation_jobs_org_booking_idx"
  ON "booking_document_generation_jobs"("organization_id", "booking_id");

CREATE INDEX IF NOT EXISTS "booking_document_generation_jobs_status_retry_idx"
  ON "booking_document_generation_jobs"("status", "next_retry_at");

ALTER TABLE "booking_document_generation_jobs"
  ADD CONSTRAINT "booking_document_generation_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_document_generation_jobs"
  ADD CONSTRAINT "booking_document_generation_jobs_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_document_generation_jobs"
  ADD CONSTRAINT "booking_document_generation_jobs_bundle_id_fkey"
  FOREIGN KEY ("bundle_id") REFERENCES "booking_document_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
