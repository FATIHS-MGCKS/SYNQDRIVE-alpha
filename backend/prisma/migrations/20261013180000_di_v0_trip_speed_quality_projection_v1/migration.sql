-- EXP-021 P2 internal trip speed quality projection (ops-only; runtime wiring OFF by default).

CREATE TABLE di_v0_trip_speed_quality_projections_v1 (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  shadow_run_id TEXT NOT NULL,
  pinned_snapshot_hash TEXT NOT NULL,
  boundary_fingerprint TEXT NOT NULL,
  qc_policy_version TEXT NOT NULL,
  projection_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  superseded_by_projection_id TEXT NULL,
  superseded_at TIMESTAMPTZ NULL,
  projection_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT di_v0_tsqp_v1_lifecycle_chk CHECK (lifecycle_status IN ('CURRENT', 'SUPERSEDED'))
);

CREATE UNIQUE INDEX di_v0_tsqp_v1_idempotency_uq
  ON di_v0_trip_speed_quality_projections_v1 (idempotency_key);

CREATE UNIQUE INDEX di_v0_tsqp_v1_current_scope_uq
  ON di_v0_trip_speed_quality_projections_v1 (organization_id, trip_id, qc_policy_version, projection_version)
  WHERE lifecycle_status = 'CURRENT';

CREATE INDEX di_v0_tsqp_v1_org_trip_idx
  ON di_v0_trip_speed_quality_projections_v1 (organization_id, trip_id);

CREATE INDEX di_v0_tsqp_v1_work_item_idx
  ON di_v0_trip_speed_quality_projections_v1 (work_item_id);

ALTER TABLE di_v0_trip_speed_quality_projections_v1
  ADD CONSTRAINT di_v0_tsqp_v1_org_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE di_v0_trip_speed_quality_projections_v1
  ADD CONSTRAINT di_v0_tsqp_v1_vehicle_fkey
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;

ALTER TABLE di_v0_trip_speed_quality_projections_v1
  ADD CONSTRAINT di_v0_tsqp_v1_trip_fkey
  FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id) ON DELETE CASCADE;
