-- Driving Intelligence V2 P13 — vehicle_driving_capabilities (additive table only).

CREATE TABLE "vehicle_driving_capabilities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "hardware_profile" "HardwareType" NOT NULL,
    "provider_source" TEXT NOT NULL,
    "signal_name" TEXT,
    "detector_name" TEXT,
    "capability_key" TEXT NOT NULL,
    "capability_status" "DrivingCapabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL,
    "effective_cadence_ms" INTEGER,
    "p95_cadence_ms" INTEGER,
    "coverage" DOUBLE PRECISION,
    "native_event_available" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "capability_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_driving_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_driving_capabilities_org_vehicle_provider_key_key"
    ON "vehicle_driving_capabilities"("organization_id", "vehicle_id", "provider_source", "capability_key");

CREATE INDEX "vehicle_driving_capabilities_organization_id_idx"
    ON "vehicle_driving_capabilities"("organization_id");

CREATE INDEX "vehicle_driving_capabilities_vehicle_id_capability_status_idx"
    ON "vehicle_driving_capabilities"("vehicle_id", "capability_status");

CREATE INDEX "vehicle_driving_capabilities_vehicle_id_checked_at_idx"
    ON "vehicle_driving_capabilities"("vehicle_id", "checked_at");

CREATE INDEX "vehicle_driving_capabilities_provider_source_capability_key_idx"
    ON "vehicle_driving_capabilities"("provider_source", "capability_key");

ALTER TABLE "vehicle_driving_capabilities"
    ADD CONSTRAINT "vehicle_driving_capabilities_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_driving_capabilities"
    ADD CONSTRAINT "vehicle_driving_capabilities_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
