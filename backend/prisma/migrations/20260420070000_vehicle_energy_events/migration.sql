-- ── Vehicle Energy Events (Refuel + Recharge) ──
-- Backed by DIMO's native RefuelDetector / RechargeDetector via the
-- segments(mechanism: refuel|recharge) GraphQL query. Each event is
-- persisted as a first-class row so the Trips-Tab timeline can interleave
-- refuel / recharge cards chronologically between trips.

-- Enums
DO $$ BEGIN
  CREATE TYPE "EnergyEventKind" AS ENUM ('REFUEL', 'RECHARGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "EnergyEventConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS "vehicle_energy_events" (
  "id"                    TEXT PRIMARY KEY,
  "vehicle_id"            TEXT NOT NULL,
  "dimo_segment_id"       TEXT NOT NULL,
  "kind"                  "EnergyEventKind" NOT NULL,
  "detection_mechanism"   TEXT NOT NULL,
  "start_time"            TIMESTAMP(3) NOT NULL,
  "end_time"              TIMESTAMP(3) NOT NULL,
  "duration_seconds"      INTEGER NOT NULL,
  "start_latitude"        DOUBLE PRECISION,
  "start_longitude"       DOUBLE PRECISION,
  "end_latitude"          DOUBLE PRECISION,
  "end_longitude"         DOUBLE PRECISION,
  "fuel_delta_liters"     DOUBLE PRECISION,
  "fuel_delta_percent"    DOUBLE PRECISION,
  "soc_delta_percent"     DOUBLE PRECISION,
  "energy_delta_kwh"      DOUBLE PRECISION,
  "odometer_start_km"     DOUBLE PRECISION,
  "odometer_end_km"       DOUBLE PRECISION,
  "confidence"            "EnergyEventConfidence" NOT NULL DEFAULT 'MEDIUM',
  "raw_detection_meta"    JSONB,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Constraints & indexes
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_energy_events_dimo_segment_id_key"
  ON "vehicle_energy_events" ("dimo_segment_id");

CREATE INDEX IF NOT EXISTS "vehicle_energy_events_vehicle_id_idx"
  ON "vehicle_energy_events" ("vehicle_id");

CREATE INDEX IF NOT EXISTS "vehicle_energy_events_vehicle_id_start_time_idx"
  ON "vehicle_energy_events" ("vehicle_id", "start_time");

CREATE INDEX IF NOT EXISTS "vehicle_energy_events_kind_idx"
  ON "vehicle_energy_events" ("kind");

-- FK
DO $$ BEGIN
  ALTER TABLE "vehicle_energy_events"
    ADD CONSTRAINT "vehicle_energy_events_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
