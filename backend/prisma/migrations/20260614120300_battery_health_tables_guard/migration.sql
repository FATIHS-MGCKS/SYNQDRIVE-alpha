-- Battery health tables guard migration.
-- Idempotent (IF NOT EXISTS) so partially-migrated databases can safely apply
-- the canonical battery publication / evidence schema from schema.prisma.

DO $$ BEGIN
    CREATE TYPE "SohPublicationState" AS ENUM ('INITIAL_CALIBRATION', 'STABILIZING', 'STABLE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryEvidenceScope" AS ENUM ('LV', 'HV');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryEvidenceSourceType" AS ENUM (
        'PROVIDER_REPORTED',
        'TELEMETRY_DERIVED',
        'MODEL_DERIVED',
        'MANUAL_REPORT',
        'DOCUMENT_CONFIRMED',
        'WORKSHOP_MEASUREMENT',
        'HM_SUPPLEMENTARY'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryEvidenceValueType" AS ENUM (
        'SOH_PERCENT',
        'SOC_PERCENT',
        'RANGE_KM',
        'VOLTAGE_V',
        'RESTING_VOLTAGE_V',
        'CRANKING_VOLTAGE_V',
        'CHARGING_VOLTAGE_V',
        'BATTERY_TEMPERATURE_C',
        'CHARGING_POWER_KW',
        'ADDED_ENERGY_KWH',
        'CURRENT_ENERGY_KWH',
        'CURRENT_VOLTAGE_V',
        'GROSS_CAPACITY_KWH'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "battery_health_snapshots" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "voltage_v" DOUBLE PRECISION NOT NULL,
    "soh_percent" DOUBLE PRECISION,
    "resting_voltage" DOUBLE PRECISION,
    "cranking_voltage" DOUBLE PRECISION,
    "charging_voltage" DOUBLE PRECISION,
    "engine_running" BOOLEAN NOT NULL DEFAULT false,
    "temperature_c" DOUBLE PRECISION,
    "estimated_cca" INTEGER,
    "raw_payload" JSONB,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "battery_health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "battery_health_snapshots_vehicle_id_idx" ON "battery_health_snapshots"("vehicle_id");
CREATE INDEX IF NOT EXISTS "battery_health_snapshots_recorded_at_idx" ON "battery_health_snapshots"("recorded_at");

CREATE TABLE IF NOT EXISTS "battery_features" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "rest_window_started_at" TIMESTAMP(3),
    "rest_60m_captured_at" TIMESTAMP(3),
    "rest_6h_captured_at" TIMESTAMP(3),
    "v_off_60m" DOUBLE PRECISION,
    "v_off_6h" DOUBLE PRECISION,
    "delta_v_rest" DOUBLE PRECISION,
    "crank_trip_id" TEXT,
    "crank_at" TIMESTAMP(3),
    "v_pre_crank" DOUBLE PRECISION,
    "v_min_crank" DOUBLE PRECISION,
    "crank_drop" DOUBLE PRECISION,
    "v_recovery_5s" DOUBLE PRECISION,
    "v_recovery_30s" DOUBLE PRECISION,
    "estimated_soc_pct" DOUBLE PRECISION,
    "estimated_soh_pct" DOUBLE PRECISION,
    "confidence" TEXT,
    "badge" TEXT,
    "scored_at" TIMESTAMP(3),
    "raw_soh_pct" DOUBLE PRECISION,
    "stabilized_soh_pct" DOUBLE PRECISION,
    "published_soh_pct" DOUBLE PRECISION,
    "publication_state" "SohPublicationState" NOT NULL DEFAULT 'INITIAL_CALIBRATION',
    "maturity_confidence" TEXT,
    "qualified_event_count" INTEGER NOT NULL DEFAULT 0,
    "rest_observation_count" INTEGER NOT NULL DEFAULT 0,
    "crank_observation_count" INTEGER NOT NULL DEFAULT 0,
    "first_usable_measurement_at" TIMESTAMP(3),
    "last_published_at" TIMESTAMP(3),
    "outlier_suppressed_count" INTEGER NOT NULL DEFAULT 0,
    "ewma_alpha" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "battery_features_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "battery_features_vehicle_id_key" ON "battery_features"("vehicle_id");
CREATE INDEX IF NOT EXISTS "battery_features_vehicle_id_idx" ON "battery_features"("vehicle_id");

CREATE TABLE IF NOT EXISTS "hv_battery_health_snapshots" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "soc_percent" DOUBLE PRECISION NOT NULL,
    "energy_used_kwh" DOUBLE PRECISION,
    "estimated_capacity_kwh" DOUBLE PRECISION,
    "soh_percent" DOUBLE PRECISION,
    "range_km" DOUBLE PRECISION,
    "charging_power_kw" DOUBLE PRECISION,
    "is_charging" BOOLEAN NOT NULL DEFAULT false,
    "odometer_km" DOUBLE PRECISION,
    "temperature_c" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hv_battery_health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hv_battery_health_snapshots_vehicle_id_idx" ON "hv_battery_health_snapshots"("vehicle_id");
CREATE INDEX IF NOT EXISTS "hv_battery_health_snapshots_recorded_at_idx" ON "hv_battery_health_snapshots"("recorded_at");

CREATE TABLE IF NOT EXISTS "hv_battery_health_current" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "raw_soh_pct" DOUBLE PRECISION,
    "stabilized_soh_pct" DOUBLE PRECISION,
    "published_soh_pct" DOUBLE PRECISION,
    "publication_state" "SohPublicationState" NOT NULL DEFAULT 'INITIAL_CALIBRATION',
    "publication_method" TEXT,
    "maturity_confidence" TEXT,
    "signal_confidence" TEXT,
    "valid_estimate_count" INTEGER NOT NULL DEFAULT 0,
    "first_usable_measurement_at" TIMESTAMP(3),
    "last_published_at" TIMESTAMP(3),
    "outlier_suppressed_count" INTEGER NOT NULL DEFAULT 0,
    "ewma_alpha" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hv_battery_health_current_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hv_battery_health_current_vehicle_id_key" ON "hv_battery_health_current"("vehicle_id");
CREATE INDEX IF NOT EXISTS "hv_battery_health_current_vehicle_id_idx" ON "hv_battery_health_current"("vehicle_id");

CREATE TABLE IF NOT EXISTS "battery_evidence" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "scope" "BatteryEvidenceScope" NOT NULL,
    "source_type" "BatteryEvidenceSourceType" NOT NULL,
    "value_type" "BatteryEvidenceValueType" NOT NULL,
    "numeric_value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "provider" TEXT,
    "confidence" TEXT,
    "quality" TEXT,
    "document_extraction_id" TEXT,
    "service_event_id" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "battery_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "battery_evidence_dedup_key"
    ON "battery_evidence"("vehicle_id", "scope", "value_type", "source_type", "observed_at");
CREATE INDEX IF NOT EXISTS "battery_evidence_vehicle_id_scope_value_type_observed_at_idx"
    ON "battery_evidence"("vehicle_id", "scope", "value_type", "observed_at");
CREATE INDEX IF NOT EXISTS "battery_evidence_source_type_observed_at_idx"
    ON "battery_evidence"("source_type", "observed_at");
CREATE INDEX IF NOT EXISTS "battery_evidence_document_extraction_id_idx"
    ON "battery_evidence"("document_extraction_id");
CREATE INDEX IF NOT EXISTS "battery_evidence_service_event_id_idx"
    ON "battery_evidence"("service_event_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'battery_health_snapshots_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "battery_health_snapshots"
            ADD CONSTRAINT "battery_health_snapshots_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'battery_features_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "battery_features"
            ADD CONSTRAINT "battery_features_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'hv_battery_health_snapshots_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "hv_battery_health_snapshots"
            ADD CONSTRAINT "hv_battery_health_snapshots_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'hv_battery_health_current_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "hv_battery_health_current"
            ADD CONSTRAINT "hv_battery_health_current_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'battery_evidence_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "battery_evidence"
            ADD CONSTRAINT "battery_evidence_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
