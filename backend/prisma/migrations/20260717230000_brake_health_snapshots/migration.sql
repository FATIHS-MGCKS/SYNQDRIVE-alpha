-- Prompt 18: versioned immutable brake health prediction snapshots
CREATE TABLE IF NOT EXISTS brake_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL,
  model_version TEXT NOT NULL,
  model_config_hash TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  component_installation_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  anchor_evidence_summary JSONB,
  modeled_distance_km DOUBLE PRECISION,
  observed_distance_km DOUBLE PRECISION,
  neutral_gap_distance_km DOUBLE PRECISION,
  coverage_ratio DOUBLE PRECISION,
  modeling_source TEXT,
  front_pad_estimate_mm DOUBLE PRECISION,
  rear_pad_estimate_mm DOUBLE PRECISION,
  front_disc_estimate_mm DOUBLE PRECISION,
  rear_disc_estimate_mm DOUBLE PRECISION,
  condition TEXT,
  confidence JSONB,
  remaining_range JSONB,
  alerts_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brake_health_snapshots_vehicle_generated_idx
  ON brake_health_snapshots (vehicle_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS brake_health_snapshots_vehicle_model_fingerprint_idx
  ON brake_health_snapshots (vehicle_id, model_version, input_fingerprint);

CREATE UNIQUE INDEX IF NOT EXISTS brake_health_snapshots_vehicle_model_fingerprint_uniq
  ON brake_health_snapshots (vehicle_id, model_version, input_fingerprint)
  WHERE vehicle_id IS NOT NULL
    AND model_version IS NOT NULL
    AND input_fingerprint IS NOT NULL;

ALTER TABLE brake_evidence
  ADD COLUMN IF NOT EXISTS prediction_snapshot_id UUID
    REFERENCES brake_health_snapshots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS brake_evidence_prediction_snapshot_idx
  ON brake_evidence (prediction_snapshot_id)
  WHERE prediction_snapshot_id IS NOT NULL;
