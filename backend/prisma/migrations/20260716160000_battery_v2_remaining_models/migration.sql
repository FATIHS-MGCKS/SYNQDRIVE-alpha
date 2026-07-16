-- Battery Health V2 remaining models (P3–P5 — additive only).
-- See docs/architecture/battery-health-v2-prisma-plan.md §6–§12.

DO $$ BEGIN
    CREATE TYPE "BatteryReferenceCapacityType" AS ENUM (
        'GROSS_NOMINAL',
        'USABLE_NET',
        'WORKSHOP_MEASURED',
        'UNKNOWN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "battery_assessments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "scope" "BatteryEvidenceScope" NOT NULL,
    "type" "BatteryAssessmentType" NOT NULL,
    "score_value" DOUBLE PRECISION,
    "text_value" TEXT,
    "confidence" TEXT,
    "evidence_strength" "BatteryEvidenceStrength" NOT NULL,
    "data_quality" TEXT,
    "maturity" "BatteryAssessmentMaturity" NOT NULL,
    "model_version" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "input_summary" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "superseded_by_id" TEXT,
    "superseded_at" TIMESTAMP(3),
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "battery_assessments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "battery_assessments_idempotency_key"
    ON "battery_assessments"("vehicle_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "battery_assessments_organization_id_computed_at_idx"
    ON "battery_assessments"("organization_id", "computed_at" DESC);

CREATE INDEX IF NOT EXISTS "battery_assessments_vehicle_id_computed_at_idx"
    ON "battery_assessments"("vehicle_id", "computed_at" DESC);

CREATE INDEX IF NOT EXISTS "battery_assessments_vehicle_id_scope_type_idx"
    ON "battery_assessments"("vehicle_id", "scope", "type");

CREATE INDEX IF NOT EXISTS "battery_assessments_maturity_idx"
    ON "battery_assessments"("maturity");

CREATE INDEX IF NOT EXISTS "battery_assessments_superseded_by_id_idx"
    ON "battery_assessments"("superseded_by_id");

CREATE TABLE IF NOT EXISTS "battery_publications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "scope" "BatteryEvidenceScope" NOT NULL,
    "assessment_id" TEXT,
    "status" "SohPublicationState" NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "stale_at" TIMESTAMP(3),
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "battery_publications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "battery_publications_tenant_idempotency_key"
    ON "battery_publications"("organization_id", "vehicle_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "battery_publications_organization_id_published_at_idx"
    ON "battery_publications"("organization_id", "published_at" DESC);

CREATE INDEX IF NOT EXISTS "battery_publications_vehicle_id_scope_published_at_idx"
    ON "battery_publications"("vehicle_id", "scope", "published_at" DESC);

CREATE INDEX IF NOT EXISTS "battery_publications_assessment_id_idx"
    ON "battery_publications"("assessment_id");

CREATE INDEX IF NOT EXISTS "battery_publications_status_idx"
    ON "battery_publications"("status");

CREATE TABLE IF NOT EXISTS "vehicle_battery_capabilities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "signal_key" TEXT NOT NULL,
    "provider" TEXT,
    "status" "BatteryCapabilityStatus" NOT NULL,
    "measurement_type" "BatteryMeasurementType",
    "first_seen_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "source_timestamp" TIMESTAMP(3),
    "last_value" DOUBLE PRECISION,
    "metadata" JSONB,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicle_battery_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_battery_capabilities_signal_key"
    ON "vehicle_battery_capabilities"("vehicle_id", "signal_key");

CREATE INDEX IF NOT EXISTS "vehicle_battery_capabilities_organization_id_idx"
    ON "vehicle_battery_capabilities"("organization_id");

CREATE INDEX IF NOT EXISTS "vehicle_battery_capabilities_vehicle_id_status_idx"
    ON "vehicle_battery_capabilities"("vehicle_id", "status");

CREATE INDEX IF NOT EXISTS "vehicle_battery_capabilities_checked_at_idx"
    ON "vehicle_battery_capabilities"("checked_at");

CREATE TABLE IF NOT EXISTS "vehicle_battery_reference_capacities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "capacity_kwh" DOUBLE PRECISION NOT NULL,
    "capacity_type" "BatteryReferenceCapacityType" NOT NULL,
    "source" "BatteryReferenceCapacitySource" NOT NULL,
    "verification_status" "ReferenceCapacityVerificationStatus" NOT NULL,
    "verified_by_user_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "document_id" TEXT,
    "service_event_id" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "superseded_by_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_battery_reference_capacities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicle_battery_reference_capacities_organization_id_idx"
    ON "vehicle_battery_reference_capacities"("organization_id");

CREATE INDEX IF NOT EXISTS "vehicle_battery_reference_capacities_vehicle_id_effective_from_idx"
    ON "vehicle_battery_reference_capacities"("vehicle_id", "effective_from" DESC);

CREATE INDEX IF NOT EXISTS "vehicle_battery_reference_capacities_verification_status_idx"
    ON "vehicle_battery_reference_capacities"("verification_status");

CREATE INDEX IF NOT EXISTS "vehicle_battery_reference_capacities_is_active_idx"
    ON "vehicle_battery_reference_capacities"("is_active");

CREATE INDEX IF NOT EXISTS "vehicle_battery_reference_capacities_document_id_idx"
    ON "vehicle_battery_reference_capacities"("document_id");

CREATE INDEX IF NOT EXISTS "vehicle_battery_reference_capacities_superseded_by_id_idx"
    ON "vehicle_battery_reference_capacities"("superseded_by_id");

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_battery_reference_capacities_one_active_per_vehicle"
    ON "vehicle_battery_reference_capacities"("vehicle_id")
    WHERE "is_active" = true;

CREATE TABLE IF NOT EXISTS "hv_charge_sessions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "measurement_session_id" TEXT,
    "segment_fingerprint" TEXT NOT NULL,
    "dimo_segment_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DIMO_RECHARGE_SEGMENT',
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "start_soc_percent" DOUBLE PRECISION,
    "end_soc_percent" DOUBLE PRECISION,
    "start_energy_kwh" DOUBLE PRECISION,
    "end_energy_kwh" DOUBLE PRECISION,
    "energy_added_kwh" DOUBLE PRECISION,
    "delta_soc_percent" DOUBLE PRECISION,
    "is_ongoing" BOOLEAN NOT NULL DEFAULT false,
    "quality" "BatteryMeasurementQuality",
    "idempotency_key" TEXT NOT NULL,
    "provider_observed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hv_charge_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hv_charge_sessions_idempotency_key"
    ON "hv_charge_sessions"("vehicle_id", "idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "hv_charge_sessions_segment_fingerprint"
    ON "hv_charge_sessions"("vehicle_id", "segment_fingerprint");

CREATE INDEX IF NOT EXISTS "hv_charge_sessions_organization_id_start_at_idx"
    ON "hv_charge_sessions"("organization_id", "start_at" DESC);

CREATE INDEX IF NOT EXISTS "hv_charge_sessions_vehicle_id_start_at_idx"
    ON "hv_charge_sessions"("vehicle_id", "start_at" DESC);

CREATE INDEX IF NOT EXISTS "hv_charge_sessions_vehicle_id_is_ongoing_idx"
    ON "hv_charge_sessions"("vehicle_id", "is_ongoing");

CREATE INDEX IF NOT EXISTS "hv_charge_sessions_dimo_segment_id_idx"
    ON "hv_charge_sessions"("dimo_segment_id");

CREATE INDEX IF NOT EXISTS "hv_charge_sessions_measurement_session_id_idx"
    ON "hv_charge_sessions"("measurement_session_id");

CREATE TABLE IF NOT EXISTS "hv_capacity_observations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "charge_session_id" TEXT,
    "assessment_id" TEXT,
    "method" "HvCapacityMethod" NOT NULL,
    "estimated_capacity_kwh" DOUBLE PRECISION,
    "estimated_soh_pct" DOUBLE PRECISION,
    "reference_capacity_kwh" DOUBLE PRECISION,
    "delta_soc_percent" DOUBLE PRECISION,
    "delta_energy_kwh" DOUBLE PRECISION,
    "sample_stats" JSONB,
    "quality" "BatteryMeasurementQuality" NOT NULL DEFAULT 'SHADOW',
    "model_version" INTEGER NOT NULL DEFAULT 1,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hv_capacity_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hv_capacity_observations_idempotency_key"
    ON "hv_capacity_observations"("vehicle_id", "idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "hv_capacity_observations_dedup_key"
    ON "hv_capacity_observations"("vehicle_id", "method", "observed_at");

CREATE INDEX IF NOT EXISTS "hv_capacity_observations_organization_id_observed_at_idx"
    ON "hv_capacity_observations"("organization_id", "observed_at" DESC);

CREATE INDEX IF NOT EXISTS "hv_capacity_observations_vehicle_id_observed_at_idx"
    ON "hv_capacity_observations"("vehicle_id", "observed_at" DESC);

CREATE INDEX IF NOT EXISTS "hv_capacity_observations_charge_session_id_idx"
    ON "hv_capacity_observations"("charge_session_id");

CREATE INDEX IF NOT EXISTS "hv_capacity_observations_assessment_id_idx"
    ON "hv_capacity_observations"("assessment_id");

CREATE INDEX IF NOT EXISTS "hv_capacity_observations_method_quality_idx"
    ON "hv_capacity_observations"("method", "quality");

ALTER TABLE "battery_evidence" ADD COLUMN IF NOT EXISTS "measurement_id" TEXT;
CREATE INDEX IF NOT EXISTS "battery_evidence_measurement_id_idx"
    ON "battery_evidence"("measurement_id");

-- Foreign keys (idempotent)
DO $$ BEGIN
    ALTER TABLE "battery_assessments"
        ADD CONSTRAINT "battery_assessments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "battery_assessments"
        ADD CONSTRAINT "battery_assessments_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "battery_assessments"
        ADD CONSTRAINT "battery_assessments_superseded_by_id_fkey"
        FOREIGN KEY ("superseded_by_id") REFERENCES "battery_assessments"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "battery_publications"
        ADD CONSTRAINT "battery_publications_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "battery_publications"
        ADD CONSTRAINT "battery_publications_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "battery_publications"
        ADD CONSTRAINT "battery_publications_assessment_id_fkey"
        FOREIGN KEY ("assessment_id") REFERENCES "battery_assessments"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_battery_capabilities"
        ADD CONSTRAINT "vehicle_battery_capabilities_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_battery_capabilities"
        ADD CONSTRAINT "vehicle_battery_capabilities_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_battery_reference_capacities"
        ADD CONSTRAINT "vehicle_battery_reference_capacities_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_battery_reference_capacities"
        ADD CONSTRAINT "vehicle_battery_reference_capacities_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_battery_reference_capacities"
        ADD CONSTRAINT "vehicle_battery_reference_capacities_verified_by_user_id_fkey"
        FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_battery_reference_capacities"
        ADD CONSTRAINT "vehicle_battery_reference_capacities_document_id_fkey"
        FOREIGN KEY ("document_id") REFERENCES "vehicle_document_extractions"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_battery_reference_capacities"
        ADD CONSTRAINT "vehicle_battery_reference_capacities_service_event_id_fkey"
        FOREIGN KEY ("service_event_id") REFERENCES "vehicle_service_events"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "vehicle_battery_reference_capacities"
        ADD CONSTRAINT "vehicle_battery_reference_capacities_superseded_by_id_fkey"
        FOREIGN KEY ("superseded_by_id") REFERENCES "vehicle_battery_reference_capacities"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "hv_charge_sessions"
        ADD CONSTRAINT "hv_charge_sessions_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "hv_charge_sessions"
        ADD CONSTRAINT "hv_charge_sessions_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "hv_charge_sessions"
        ADD CONSTRAINT "hv_charge_sessions_measurement_session_id_fkey"
        FOREIGN KEY ("measurement_session_id") REFERENCES "battery_measurement_sessions"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "hv_capacity_observations"
        ADD CONSTRAINT "hv_capacity_observations_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "hv_capacity_observations"
        ADD CONSTRAINT "hv_capacity_observations_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "hv_capacity_observations"
        ADD CONSTRAINT "hv_capacity_observations_charge_session_id_fkey"
        FOREIGN KEY ("charge_session_id") REFERENCES "hv_charge_sessions"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "hv_capacity_observations"
        ADD CONSTRAINT "hv_capacity_observations_assessment_id_fkey"
        FOREIGN KEY ("assessment_id") REFERENCES "battery_assessments"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "battery_evidence"
        ADD CONSTRAINT "battery_evidence_measurement_id_fkey"
        FOREIGN KEY ("measurement_id") REFERENCES "battery_measurements"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
