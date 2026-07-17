-- Battery Health V2 immutable measurements (P2 — additive only).
-- See docs/architecture/battery-health-v2-prisma-plan.md §5.

CREATE TABLE IF NOT EXISTS "battery_measurements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "session_id" TEXT,
    "scope" "BatteryEvidenceScope" NOT NULL,
    "type" "BatteryMeasurementType" NOT NULL,
    "numeric_value" DOUBLE PRECISION,
    "text_value" TEXT,
    "unit" TEXT,
    "quality" "BatteryMeasurementQuality" NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider_timestamp" TIMESTAMP(3),
    "provider_source" TEXT,
    "signal_name" TEXT,
    "context" JSONB,
    "provenance" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "superseded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battery_measurements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "battery_measurements_tenant_idempotency_key"
    ON "battery_measurements"("organization_id", "vehicle_id", "idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "battery_measurements_dedup_key"
    ON "battery_measurements"("vehicle_id", "type", "observed_at");

CREATE INDEX IF NOT EXISTS "battery_measurements_organization_id_observed_at_idx"
    ON "battery_measurements"("organization_id", "observed_at" DESC);

CREATE INDEX IF NOT EXISTS "battery_measurements_vehicle_id_observed_at_idx"
    ON "battery_measurements"("vehicle_id", "observed_at" DESC);

CREATE INDEX IF NOT EXISTS "battery_measurements_vehicle_id_scope_type_idx"
    ON "battery_measurements"("vehicle_id", "scope", "type");

CREATE INDEX IF NOT EXISTS "battery_measurements_session_id_idx"
    ON "battery_measurements"("session_id");

CREATE INDEX IF NOT EXISTS "battery_measurements_quality_idx"
    ON "battery_measurements"("quality");

CREATE INDEX IF NOT EXISTS "battery_measurements_superseded_by_id_idx"
    ON "battery_measurements"("superseded_by_id");

DO $$ BEGIN
    ALTER TABLE "battery_measurements"
        ADD CONSTRAINT "battery_measurements_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "battery_measurements"
        ADD CONSTRAINT "battery_measurements_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "battery_measurements"
        ADD CONSTRAINT "battery_measurements_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "battery_measurement_sessions"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "battery_measurements"
        ADD CONSTRAINT "battery_measurements_superseded_by_id_fkey"
        FOREIGN KEY ("superseded_by_id") REFERENCES "battery_measurements"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
