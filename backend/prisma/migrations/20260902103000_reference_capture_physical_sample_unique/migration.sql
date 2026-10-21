-- Phase 3A.3.2: durable HF physical bucket idempotency per session.
-- PostgreSQL UNIQUE allows multiple NULL physical_sample_fingerprint rows (events/metadata).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "reference_capture_observations"
    WHERE "physical_sample_fingerprint" IS NOT NULL
    GROUP BY "session_id", "physical_sample_fingerprint"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'reference_capture_observations has duplicate (session_id, physical_sample_fingerprint) rows — remediate before applying unique constraint';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "refcap_obs_session_physical_fp_uq"
  ON "reference_capture_observations" ("session_id", "physical_sample_fingerprint");
