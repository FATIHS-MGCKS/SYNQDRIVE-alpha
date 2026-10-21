-- PR #1290 smoke gate: faithful pre-migration subset for vehicle_data_source_links.
-- Derived from repository migrations:
--   20260311224040_init (organizations, vehicles, dimo_vehicles + DimoConnectionStatus enum)
--   20260408120000_high_mobility_phase1 (high_mobility_vehicles, vehicle_data_source_links)
--   20260412030000_platform_hardening_phase1 (vehicle_id FK)
--   20260412040000_audit_consent_provenance (provider, consent_id, linked_by_user_id, last_verified_at)
-- Plus Production-equivalent FK source_reference_id -> high_mobility_vehicles(id).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE "DimoConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vin TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX vehicles_organization_id_idx ON vehicles(organization_id);

CREATE TABLE dimo_vehicles (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  token_id INTEGER UNIQUE,
  vin TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  fuel_type TEXT,
  odometer_km DOUBLE PRECISION,
  last_signal TIMESTAMPTZ,
  connection_status "DimoConnectionStatus" NOT NULL DEFAULT 'PENDING',
  raw_json JSONB,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dimo_vehicles_vin_idx ON dimo_vehicles(vin);
CREATE INDEX dimo_vehicles_connection_status_idx ON dimo_vehicles(connection_status);

CREATE TABLE high_mobility_vehicles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vin TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT high_mobility_vehicles_organization_id_vin_key UNIQUE (organization_id, vin)
);

CREATE INDEX high_mobility_vehicles_organization_id_idx ON high_mobility_vehicles(organization_id);

CREATE TABLE vehicle_data_source_links (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_subtype TEXT,
  source_reference_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  metadata JSONB,
  provider TEXT NOT NULL DEFAULT 'UNKNOWN',
  consent_id TEXT,
  linked_by_user_id TEXT,
  last_verified_at TIMESTAMPTZ,
  CONSTRAINT vehicle_data_source_links_source_reference_id_fkey
    FOREIGN KEY (source_reference_id) REFERENCES high_mobility_vehicles(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX uq_data_source_link_active
  ON vehicle_data_source_links(vehicle_id, source_type, source_subtype, is_active);
CREATE INDEX idx_data_source_links_vehicle ON vehicle_data_source_links(vehicle_id);
CREATE INDEX idx_data_source_links_type ON vehicle_data_source_links(source_type);
CREATE INDEX idx_data_source_links_ref ON vehicle_data_source_links(source_reference_id);
CREATE INDEX vdsl_provider_idx ON vehicle_data_source_links(provider);
CREATE INDEX vdsl_consent_id_idx ON vehicle_data_source_links(consent_id);
