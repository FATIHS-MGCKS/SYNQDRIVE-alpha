-- Prompt 21: persisted brake health alerts with dedupe + resolution lifecycle

CREATE TYPE "BrakeHealthAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TYPE "BrakeHealthAlertCategory" AS ENUM ('WEAR', 'SAFETY', 'DATA_QUALITY');

CREATE TYPE "BrakeHealthAlertResolutionReason" AS ENUM (
  'COMPONENT_REPLACED',
  'NEW_MEASUREMENT',
  'DTC_CLEARED',
  'EVIDENCE_RESOLVED',
  'SPEC_CONFIRMED',
  'COVERAGE_REPAIRED',
  'EVIDENCE_CLEARED',
  'SUPERSEDED'
);

CREATE TABLE brake_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  component_installation_id TEXT,
  alert_type TEXT NOT NULL,
  category "BrakeHealthAlertCategory" NOT NULL,
  reason_code TEXT NOT NULL,
  severity TEXT NOT NULL,
  axle TEXT,
  display_mode TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  model_snapshot_id UUID,
  status "BrakeHealthAlertStatus" NOT NULL DEFAULT 'OPEN',
  resolution_reason "BrakeHealthAlertResolutionReason",
  resolved_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_fingerprint TEXT,
  last_notified_fingerprint TEXT,
  template_params_json JSONB,
  CONSTRAINT brake_health_alerts_vehicle_fkey
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX brake_health_alerts_dedupe_open_uniq
  ON brake_health_alerts (dedupe_key)
  WHERE status = 'OPEN';

CREATE INDEX brake_health_alerts_org_status_idx
  ON brake_health_alerts (organization_id, status);

CREATE INDEX brake_health_alerts_vehicle_status_idx
  ON brake_health_alerts (vehicle_id, status);

CREATE INDEX brake_health_alerts_vehicle_category_idx
  ON brake_health_alerts (vehicle_id, category, status);
