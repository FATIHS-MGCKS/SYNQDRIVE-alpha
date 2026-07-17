-- Prompt 19: structured brake safety evidence from DTCs
CREATE TYPE brake_dtc_category AS ENUM (
  'BRAKE_SYSTEM',
  'ABS',
  'ESC',
  'PARKING_BRAKE',
  'BRAKE_SENSOR',
  'BRAKE_FLUID',
  'COMMUNICATION_RELATED',
  'NOT_BRAKE_RELATED'
);

CREATE TYPE brake_dtc_freshness AS ENUM (
  'FRESH',
  'STALE',
  'UNKNOWN'
);

ALTER TABLE brake_evidence
  ADD COLUMN IF NOT EXISTS vehicle_dtc_event_id TEXT,
  ADD COLUMN IF NOT EXISTS dtc_code TEXT,
  ADD COLUMN IF NOT EXISTS dtc_category brake_dtc_category,
  ADD COLUMN IF NOT EXISTS dtc_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS dtc_first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dtc_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dtc_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_provider TEXT,
  ADD COLUMN IF NOT EXISTS source_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dtc_freshness brake_dtc_freshness,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS dtc_review_required BOOLEAN;

ALTER TABLE brake_evidence
  ADD CONSTRAINT brake_evidence_vehicle_dtc_event_id_fkey
  FOREIGN KEY (vehicle_dtc_event_id) REFERENCES vehicle_dtc_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS brake_evidence_vehicle_dtc_active_idx
  ON brake_evidence (vehicle_id, dtc_code, dtc_active)
  WHERE source = 'DTC_SIGNAL';

CREATE INDEX IF NOT EXISTS brake_evidence_vehicle_dedupe_key_idx
  ON brake_evidence (vehicle_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brake_evidence_vehicle_dedupe_key_uniq
  ON brake_evidence (vehicle_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
