# Phase 3A.1 correction 2 — STARTING state + pending cycle job tracking.

ALTER TYPE "ReferenceCaptureSessionStatus" ADD VALUE 'STARTING';

ALTER TABLE "reference_capture_sessions"
    ADD COLUMN IF NOT EXISTS "pending_cycle_job_id" TEXT;

CREATE INDEX IF NOT EXISTS "reference_capture_sessions_pending_cycle_job_id_idx"
    ON "reference_capture_sessions"("pending_cycle_job_id");

ALTER TABLE "reference_capture_observations"
    ADD COLUMN IF NOT EXISTS "physical_sample_fingerprint" TEXT;

CREATE INDEX IF NOT EXISTS "reference_capture_observations_session_id_physical_sample_fingerprint_idx"
    ON "reference_capture_observations"("session_id", "physical_sample_fingerprint");
