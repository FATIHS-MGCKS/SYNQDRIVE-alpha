-- EXP-021 M7A road-assignment shadow comparison (post-S4 batch; default OFF).

CREATE TABLE di_v0_m7a_road_assignment_shadow_runs_v1 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  shadow_intent_key TEXT NOT NULL,
  shadow_bundle_version TEXT NOT NULL,
  pinned_snapshot_hash TEXT NOT NULL,
  combined_input_identity TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  shadow_status TEXT NOT NULL,
  summary_json JSONB NOT NULL,
  payload_gzip BYTEA NOT NULL,
  uncompressed_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT di_v0_m7a_road_assignment_shadow_runs_status_chk CHECK (shadow_status IN ('SUCCEEDED', 'FAILED'))
);

CREATE UNIQUE INDEX di_v0_m7a_road_assignment_shadow_runs_succeeded_intent_uq
  ON di_v0_m7a_road_assignment_shadow_runs_v1 (work_item_id, shadow_intent_key)
  WHERE shadow_status = 'SUCCEEDED';

CREATE UNIQUE INDEX di_v0_m7a_road_assignment_shadow_runs_exact_uq
  ON di_v0_m7a_road_assignment_shadow_runs_v1 (work_item_id, shadow_intent_key, content_fingerprint, shadow_status);

CREATE INDEX di_v0_m7a_road_assignment_shadow_runs_org_trip_idx
  ON di_v0_m7a_road_assignment_shadow_runs_v1 (organization_id, trip_id);

CREATE INDEX di_v0_m7a_road_assignment_shadow_runs_wi_intent_idx
  ON di_v0_m7a_road_assignment_shadow_runs_v1 (work_item_id, shadow_intent_key);

CREATE TABLE di_v0_m7a_road_assignment_shadow_outbox_v1 (
  outbox_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  work_item_id TEXT NOT NULL,
  shadow_intent_key TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  shadow_bundle_version TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  claim_token TEXT,
  claim_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT di_v0_m7a_road_assignment_shadow_outbox_status_chk CHECK (
    status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'SKIPPED_INELIGIBLE')
  )
);

CREATE UNIQUE INDEX di_v0_m7a_road_assignment_shadow_outbox_wi_intent_uq
  ON di_v0_m7a_road_assignment_shadow_outbox_v1 (work_item_id, shadow_intent_key);

CREATE INDEX di_v0_m7a_road_assignment_shadow_outbox_claim_idx
  ON di_v0_m7a_road_assignment_shadow_outbox_v1 (status, next_attempt_at, created_at);
