-- CI-R3B historical predecessor repair slot 2
-- after: 20260412040000_audit_consent_provenance
-- before: 20260413183000_brake_health_canonical_refactor

CREATE TABLE IF NOT EXISTS "brake_health_current" (
        "vehicle_id" TEXT NOT NULL,
"organization_id" TEXT,
"is_initialized" BOOLEAN NOT NULL DEFAULT FALSE,
"anchor_service_date" TIMESTAMP(3) WITHOUT TIME ZONE,
"anchor_odometer_km" DOUBLE PRECISION,
"front_pad_anchor_mm" DOUBLE PRECISION,
"front_pad_estimated_mm" DOUBLE PRECISION,
"front_pad_health_pct" DOUBLE PRECISION,
"front_pad_remaining_km" DOUBLE PRECISION,
"front_pad_wear_rate_mm_per_km" DOUBLE PRECISION,
"front_pad_k_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"rear_pad_anchor_mm" DOUBLE PRECISION,
"rear_pad_estimated_mm" DOUBLE PRECISION,
"rear_pad_health_pct" DOUBLE PRECISION,
"rear_pad_remaining_km" DOUBLE PRECISION,
"rear_pad_wear_rate_mm_per_km" DOUBLE PRECISION,
"rear_pad_k_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"front_disc_anchor_mm" DOUBLE PRECISION,
"front_disc_estimated_mm" DOUBLE PRECISION,
"front_disc_health_pct" DOUBLE PRECISION,
"front_disc_remaining_km" DOUBLE PRECISION,
"front_disc_wear_rate_mm_per_km" DOUBLE PRECISION,
"front_disc_k_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"rear_disc_anchor_mm" DOUBLE PRECISION,
"rear_disc_estimated_mm" DOUBLE PRECISION,
"rear_disc_health_pct" DOUBLE PRECISION,
"rear_disc_remaining_km" DOUBLE PRECISION,
"rear_disc_wear_rate_mm_per_km" DOUBLE PRECISION,
"rear_disc_k_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"pads_health_pct" DOUBLE PRECISION,
"pads_remaining_km" DOUBLE PRECISION,
"discs_health_pct" DOUBLE PRECISION,
"discs_remaining_km" DOUBLE PRECISION,
"confidence_score" DOUBLE PRECISION,
"confidence_label" TEXT,
"has_alert" BOOLEAN NOT NULL DEFAULT FALSE,
"distance_since_anchor_km" DOUBLE PRECISION,
"calibration_count" INTEGER NOT NULL DEFAULT 0,
"model_version" TEXT NOT NULL DEFAULT '1.0.0',
"last_recalculated_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "brake_health_current_pkey" PRIMARY KEY ("vehicle_id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'brake_health_current_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "brake_health_current"
            ADD CONSTRAINT "brake_health_current_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "brake_health_current_organization_id_vehicle_id_idx" ON "brake_health_current"("organization_id", "vehicle_id");
