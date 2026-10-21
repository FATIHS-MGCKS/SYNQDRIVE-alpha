-- Phase 3A.1 correction — runner state, event watermark, retention index.

ALTER TABLE "reference_capture_sessions"
    ADD COLUMN "event_watermark_at" TIMESTAMP(3),
    ADD COLUMN "acquisition_state_json" JSONB,
    ADD COLUMN "readiness_json" JSONB,
    ADD COLUMN "runner_job_id" TEXT;

ALTER TABLE "reference_capture_observations"
    ADD COLUMN "provider_event_fingerprint" TEXT;

CREATE INDEX "reference_capture_observations_session_id_provider_event_fingerprint_idx"
    ON "reference_capture_observations"("session_id", "provider_event_fingerprint");

CREATE INDEX "reference_capture_observations_created_at_idx"
    ON "reference_capture_observations"("created_at");
