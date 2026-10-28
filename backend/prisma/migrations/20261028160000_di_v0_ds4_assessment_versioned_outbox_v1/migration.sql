-- Version-aware DS4 assessment outbox (Fable final remediation).

ALTER TABLE di_v0_ds4_assessment_outbox_v1
  ADD COLUMN IF NOT EXISTS assessment_version TEXT;

UPDATE di_v0_ds4_assessment_outbox_v1
SET assessment_version = 'DS4_TRIP_ASSESSMENT_V1'
WHERE assessment_version IS NULL;

ALTER TABLE di_v0_ds4_assessment_outbox_v1
  ALTER COLUMN assessment_version SET NOT NULL;

DROP INDEX IF EXISTS di_v0_ds4_assessment_outbox_source_run_uq;
DROP INDEX IF EXISTS di_v0_ds4_assessment_outbox_run_uq;

CREATE UNIQUE INDEX di_v0_ds4_assessment_outbox_run_version_uq
  ON di_v0_ds4_assessment_outbox_v1 (source_motion_run_id, assessment_version);
