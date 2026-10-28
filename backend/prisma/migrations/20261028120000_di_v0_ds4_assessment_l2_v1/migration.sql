-- DS4 Assessment L2 + Driving Impact V2 (PR-A) — additive, non-productive by default.

CREATE TABLE di_v0_ds4_trip_assessment_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  assessment_version TEXT NOT NULL,
  source_motion_run_id TEXT NOT NULL,
  pinned_snapshot_hash TEXT NOT NULL,
  combined_input_identity TEXT NOT NULL,
  event_row_contract TEXT,
  speed_authority TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  assessment_status TEXT NOT NULL,
  evidence_quality TEXT,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  completeness_json JSONB NOT NULL,
  event_summaries_json JSONB NOT NULL,
  processing_error_json JSONB,
  source_motion_run_created_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT di_v0_ds4_trip_assessment_status_chk CHECK (
    assessment_status IN (
      'RATED',
      'UNRATED_COUNTS_ONLY',
      'INSUFFICIENT_EVIDENCE',
      'UNSUPPORTED',
      'PENDING',
      'FAILED'
    )
  ),
  CONSTRAINT di_v0_ds4_trip_assessment_speed_authority_chk CHECK (
    speed_authority IN ('C4_ONLY', 'C5_1_PREFERRED')
  )
);

CREATE UNIQUE INDEX di_v0_ds4_trip_assessment_idempotency_uq
  ON di_v0_ds4_trip_assessment_v1 (trip_id, assessment_version, input_fingerprint);

CREATE INDEX di_v0_ds4_trip_assessment_org_trip_idx
  ON di_v0_ds4_trip_assessment_v1 (organization_id, trip_id);

CREATE INDEX di_v0_ds4_trip_assessment_vehicle_computed_idx
  ON di_v0_ds4_trip_assessment_v1 (vehicle_id, computed_at DESC);

CREATE TABLE di_v0_ds4_trip_driving_impact_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  assessment_id UUID NOT NULL UNIQUE REFERENCES di_v0_ds4_trip_assessment_v1 (id) ON DELETE CASCADE,
  score_authority TEXT NOT NULL DEFAULT 'DS4',
  model_version TEXT NOT NULL,
  operational_load_index DOUBLE PRECISION,
  score_publication_status TEXT NOT NULL,
  publication_reason TEXT,
  evidence_completeness_json JSONB NOT NULL,
  operational_load_json JSONB NOT NULL,
  source_assessment_fingerprint TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT di_v0_ds4_trip_impact_v2_score_authority_chk CHECK (score_authority = 'DS4'),
  CONSTRAINT di_v0_ds4_trip_impact_v2_model_version_chk CHECK (model_version = 'DS4_IMPACT_V2_0')
);

CREATE UNIQUE INDEX di_v0_ds4_trip_impact_v2_idempotency_uq
  ON di_v0_ds4_trip_driving_impact_v2 (trip_id, model_version, source_assessment_fingerprint);

CREATE INDEX di_v0_ds4_trip_impact_v2_org_trip_idx
  ON di_v0_ds4_trip_driving_impact_v2 (organization_id, trip_id);

CREATE TABLE di_v0_ds4_assessment_outbox_v1 (
  outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_motion_run_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  claim_token TEXT,
  claim_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT di_v0_ds4_assessment_outbox_status_chk CHECK (
    status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'SKIPPED_INELIGIBLE')
  )
);

CREATE UNIQUE INDEX di_v0_ds4_assessment_outbox_run_uq
  ON di_v0_ds4_assessment_outbox_v1 (source_motion_run_id, input_fingerprint);

CREATE INDEX di_v0_ds4_assessment_outbox_claim_idx
  ON di_v0_ds4_assessment_outbox_v1 (status, next_attempt_at, created_at);
