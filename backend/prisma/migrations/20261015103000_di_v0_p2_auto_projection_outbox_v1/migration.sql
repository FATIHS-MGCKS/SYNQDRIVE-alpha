-- EXP-021 P2 auto V2 projection outbox (durable post-S4 completion follow-up; OFF by default).

CREATE TABLE di_v0_trip_speed_quality_auto_projection_outbox_v1 (
  work_item_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  qc_policy_version TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_error_code TEXT NULL,
  last_error_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT di_v0_p2_auto_outbox_status_chk CHECK (
    status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'SKIPPED_INELIGIBLE')
  )
);

CREATE INDEX di_v0_p2_auto_outbox_claim_idx
  ON di_v0_trip_speed_quality_auto_projection_outbox_v1 (status, next_attempt_at, created_at);

CREATE INDEX di_v0_p2_auto_outbox_org_trip_idx
  ON di_v0_trip_speed_quality_auto_projection_outbox_v1 (organization_id, trip_id);
