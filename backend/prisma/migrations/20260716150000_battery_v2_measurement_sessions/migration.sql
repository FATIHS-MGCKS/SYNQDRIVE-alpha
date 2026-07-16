-- Battery Health V2 measurement sessions (P1 — additive only).
-- See docs/architecture/battery-health-v2-prisma-plan.md §4.

-- Extend session type enum (additive — keep existing values).
ALTER TYPE "BatteryMeasurementSessionType" ADD VALUE IF NOT EXISTS 'ICE_START_PROXY';
ALTER TYPE "BatteryMeasurementSessionType" ADD VALUE IF NOT EXISTS 'PHEV_ICE_START';
ALTER TYPE "BatteryMeasurementSessionType" ADD VALUE IF NOT EXISTS 'EV_WAKE';
ALTER TYPE "BatteryMeasurementSessionType" ADD VALUE IF NOT EXISTS 'HV_CHARGE';
ALTER TYPE "BatteryMeasurementSessionType" ADD VALUE IF NOT EXISTS 'WORKSHOP_TEST';
ALTER TYPE "BatteryMeasurementSessionType" ADD VALUE IF NOT EXISTS 'DOCUMENT_MEASUREMENT';
ALTER TYPE "BatteryMeasurementSessionType" ADD VALUE IF NOT EXISTS 'MANUAL_CONFIRMED';

CREATE TABLE IF NOT EXISTS "battery_measurement_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "scope" "BatteryEvidenceScope" NOT NULL,
    "type" "BatteryMeasurementSessionType" NOT NULL,
    "status" "BatteryMeasurementSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "drive_profile" "BatteryDriveProfile" NOT NULL DEFAULT 'UNKNOWN',
    "chemistry" "BatteryChemistry" NOT NULL DEFAULT 'UNKNOWN',
    "started_at" TIMESTAMP(3) NOT NULL,
    "target_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "quality" "BatteryMeasurementQuality" NOT NULL DEFAULT 'SHADOW',
    "provider_source" TEXT,
    "source_entity_type" TEXT,
    "source_entity_id" TEXT,
    "trip_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "metadata" JSONB,
    "model_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "battery_measurement_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "battery_measurement_sessions_idempotency_key"
    ON "battery_measurement_sessions"("vehicle_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "battery_measurement_sessions_organization_id_started_at_idx"
    ON "battery_measurement_sessions"("organization_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "battery_measurement_sessions_vehicle_id_started_at_idx"
    ON "battery_measurement_sessions"("vehicle_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "battery_measurement_sessions_vehicle_id_status_idx"
    ON "battery_measurement_sessions"("vehicle_id", "status");

CREATE INDEX IF NOT EXISTS "battery_measurement_sessions_vehicle_id_type_idx"
    ON "battery_measurement_sessions"("vehicle_id", "type");

CREATE INDEX IF NOT EXISTS "battery_measurement_sessions_vehicle_id_scope_type_idx"
    ON "battery_measurement_sessions"("vehicle_id", "scope", "type");

CREATE INDEX IF NOT EXISTS "battery_measurement_sessions_trip_id_idx"
    ON "battery_measurement_sessions"("trip_id");

DO $$ BEGIN
    ALTER TABLE "battery_measurement_sessions"
        ADD CONSTRAINT "battery_measurement_sessions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "battery_measurement_sessions"
        ADD CONSTRAINT "battery_measurement_sessions_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "battery_measurement_sessions"
        ADD CONSTRAINT "battery_measurement_sessions_trip_id_fkey"
        FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
