-- CI-R3B historical predecessor repair slot 3
-- after: 20260413183000_brake_health_canonical_refactor
-- before: 20260413220000_battery_evidence_unique_dedup

DO $$ BEGIN
    CREATE TYPE "DocumentExtractionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DocumentExtractionType" AS ENUM ('SERVICE', 'OIL_CHANGE', 'TIRE', 'BRAKE', 'BATTERY', 'VEHICLE_CONDITION', 'TUV_REPORT', 'BOKRAFT_REPORT', 'INVOICE', 'ACCIDENT', 'DAMAGE', 'FINE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "vehicle_document_extractions" (
        "id" TEXT NOT NULL,
"vehicle_id" TEXT NOT NULL,
"organization_id" TEXT,
"document_type" "DocumentExtractionType" NOT NULL,
"status" "DocumentExtractionStatus" NOT NULL DEFAULT 'PENDING'::"DocumentExtractionStatus",
"source_file_name" TEXT,
"source_file_url" TEXT,
"extracted_data" JSONB,
"confirmed_data" JSONB,
"applied_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"service_event_id" TEXT,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "vehicle_document_extractions_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_document_extractions_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "vehicle_document_extractions"
            ADD CONSTRAINT "vehicle_document_extractions_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_vehicle_id_idx" ON "vehicle_document_extractions"("vehicle_id");

CREATE INDEX IF NOT EXISTS "vehicle_document_extractions_status_idx" ON "vehicle_document_extractions"("status");

DO $$ BEGIN
    CREATE TYPE "BatteryEvidenceScope" AS ENUM ('LV', 'HV');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryEvidenceSourceType" AS ENUM ('PROVIDER_REPORTED', 'TELEMETRY_DERIVED', 'MODEL_DERIVED', 'MANUAL_REPORT', 'DOCUMENT_CONFIRMED', 'WORKSHOP_MEASUREMENT', 'HM_SUPPLEMENTARY');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryEvidenceValueType" AS ENUM ('SOH_PERCENT', 'SOC_PERCENT', 'RANGE_KM', 'VOLTAGE_V', 'RESTING_VOLTAGE_V', 'CRANKING_VOLTAGE_V', 'CHARGING_VOLTAGE_V', 'BATTERY_TEMPERATURE_C', 'CHARGING_POWER_KW', 'ADDED_ENERGY_KWH', 'CURRENT_ENERGY_KWH', 'CURRENT_VOLTAGE_V', 'GROSS_CAPACITY_KWH');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "battery_evidence" (
        "id" TEXT NOT NULL,
"vehicle_id" TEXT NOT NULL,
"scope" "BatteryEvidenceScope" NOT NULL,
"source_type" "BatteryEvidenceSourceType" NOT NULL,
"value_type" "BatteryEvidenceValueType" NOT NULL,
"numeric_value" DOUBLE PRECISION NOT NULL,
"unit" TEXT,
"observed_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
"provider" TEXT,
"confidence" TEXT,
"quality" TEXT,
"document_extraction_id" TEXT,
"service_event_id" TEXT,
"metadata_json" JSONB,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "battery_evidence_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'battery_evidence_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "battery_evidence"
            ADD CONSTRAINT "battery_evidence_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'battery_evidence_service_event_id_fkey'
    ) THEN
        ALTER TABLE "battery_evidence"
            ADD CONSTRAINT "battery_evidence_service_event_id_fkey"
            FOREIGN KEY ("service_event_id") REFERENCES "vehicle_service_events"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "battery_evidence_vehicle_id_scope_value_type_observed_at_idx" ON "battery_evidence"("vehicle_id", "scope", "value_type", "observed_at");

CREATE INDEX IF NOT EXISTS "battery_evidence_source_type_observed_at_idx" ON "battery_evidence"("source_type", "observed_at");

CREATE INDEX IF NOT EXISTS "battery_evidence_document_extraction_id_idx" ON "battery_evidence"("document_extraction_id");

CREATE INDEX IF NOT EXISTS "battery_evidence_service_event_id_idx" ON "battery_evidence"("service_event_id");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'battery_evidence_document_extraction_id_fkey'
    ) THEN
        ALTER TABLE "battery_evidence"
            ADD CONSTRAINT "battery_evidence_document_extraction_id_fkey"
            FOREIGN KEY ("document_extraction_id") REFERENCES "vehicle_document_extractions"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
