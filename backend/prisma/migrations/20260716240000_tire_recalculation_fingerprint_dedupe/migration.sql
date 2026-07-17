-- Prompt 14: idempotent tire health snapshots per setup + model + input fingerprint
CREATE UNIQUE INDEX IF NOT EXISTS tire_health_snapshots_setup_model_fingerprint_uniq
  ON tire_health_snapshots (tire_set_id, model_version, input_fingerprint)
  WHERE tire_set_id IS NOT NULL
    AND model_version IS NOT NULL
    AND input_fingerprint IS NOT NULL;
