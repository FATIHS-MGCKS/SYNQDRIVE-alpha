-- Prompt 15: stamp when operative prediction was generated on health snapshots
ALTER TABLE tire_health_snapshots
  ADD COLUMN IF NOT EXISTS prediction_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tire_health_snapshots_setup_prediction_generated_idx
  ON tire_health_snapshots (tire_set_id, prediction_generated_at DESC)
  WHERE tire_set_id IS NOT NULL AND prediction_generated_at IS NOT NULL;
