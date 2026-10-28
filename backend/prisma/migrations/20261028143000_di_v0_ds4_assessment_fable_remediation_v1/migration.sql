-- Fable remediation: nullable speed authority, terminal outbox failures, one outbox row per motion run.

ALTER TABLE di_v0_ds4_trip_assessment_v1
  DROP CONSTRAINT IF EXISTS di_v0_ds4_trip_assessment_speed_authority_chk;

ALTER TABLE di_v0_ds4_trip_assessment_v1
  ALTER COLUMN speed_authority DROP NOT NULL;

ALTER TABLE di_v0_ds4_trip_assessment_v1
  ADD CONSTRAINT di_v0_ds4_trip_assessment_speed_authority_chk CHECK (
    speed_authority IS NULL OR speed_authority IN ('C4_ONLY', 'C5_1_PREFERRED')
  );

ALTER TABLE di_v0_ds4_assessment_outbox_v1
  DROP CONSTRAINT IF EXISTS di_v0_ds4_assessment_outbox_status_chk;

ALTER TABLE di_v0_ds4_assessment_outbox_v1
  ADD CONSTRAINT di_v0_ds4_assessment_outbox_status_chk CHECK (
    status IN (
      'PENDING',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED_RETRYABLE',
      'FAILED_TERMINAL',
      'SKIPPED_INELIGIBLE'
    )
  );

DROP INDEX IF EXISTS di_v0_ds4_assessment_outbox_run_uq;

CREATE UNIQUE INDEX di_v0_ds4_assessment_outbox_source_run_uq
  ON di_v0_ds4_assessment_outbox_v1 (source_motion_run_id);

CREATE INDEX di_v0_ds4_trip_assessment_trip_source_created_idx
  ON di_v0_ds4_trip_assessment_v1 (trip_id, source_motion_run_created_at DESC, computed_at DESC);
