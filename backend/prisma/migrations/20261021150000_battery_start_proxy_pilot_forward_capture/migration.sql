-- G5C-N16 P4H-R7 — Tiguan forward-capture pilot (provider budget + raw archive)

CREATE TABLE IF NOT EXISTS battery_start_proxy_pilot_global_budget (
  pilot_epoch TEXT PRIMARY KEY,
  total_attempts INTEGER NOT NULL DEFAULT 0,
  max_total_attempts INTEGER NOT NULL,
  kill_switch_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS battery_start_proxy_pilot_provider_requests (
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  pilot_epoch TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL,
  query_fingerprint CHAR(64) NOT NULL,
  reserved_at TIMESTAMPTZ NOT NULL,
  request_started_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  outcome_detail TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, vehicle_id, pilot_epoch, trip_id)
);

CREATE INDEX IF NOT EXISTS battery_start_proxy_pilot_provider_req_vehicle_idx
  ON battery_start_proxy_pilot_provider_requests (organization_id, vehicle_id);

CREATE TABLE IF NOT EXISTS battery_start_proxy_pilot_raw_archives (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  pilot_epoch TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  query_fingerprint CHAR(64) NOT NULL,
  integrity_sha256 CHAR(64) NOT NULL,
  archive_json JSONB NOT NULL,
  request_ledger_trip_id TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  retention_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT battery_start_proxy_pilot_raw_archives_epoch_trip_key
    UNIQUE (pilot_epoch, trip_id)
);

CREATE INDEX IF NOT EXISTS battery_start_proxy_pilot_raw_archives_vehicle_idx
  ON battery_start_proxy_pilot_raw_archives (organization_id, vehicle_id, captured_at DESC);

ALTER TABLE battery_start_proxy_pilot_provider_requests
  ADD CONSTRAINT battery_start_proxy_pilot_provider_requests_org_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE battery_start_proxy_pilot_provider_requests
  ADD CONSTRAINT battery_start_proxy_pilot_provider_requests_vehicle_fkey
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;

ALTER TABLE battery_start_proxy_pilot_raw_archives
  ADD CONSTRAINT battery_start_proxy_pilot_raw_archives_org_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE battery_start_proxy_pilot_raw_archives
  ADD CONSTRAINT battery_start_proxy_pilot_raw_archives_vehicle_fkey
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE;
