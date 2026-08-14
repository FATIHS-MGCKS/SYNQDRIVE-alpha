-- CI-R3B historical predecessor repair slot 6
-- after: 20260421120000_add_pickup_overdue_insight_type
-- before: 20260422010000_vehicle_current_safety_score

CREATE TABLE IF NOT EXISTS "vehicle_driving_impact_current" (
        "vehicle_id" TEXT NOT NULL,
"organization_id" TEXT,
"window_days" INTEGER NOT NULL DEFAULT 30,
"window_started_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"window_ended_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"distance_km_window" DOUBLE PRECISION,
"city_share_pct" DOUBLE PRECISION,
"highway_share_pct" DOUBLE PRECISION,
"country_road_share_pct" DOUBLE PRECISION,
"hard_accel_per_100km" DOUBLE PRECISION,
"extreme_accel_per_100km" DOUBLE PRECISION,
"hard_brake_per_100km" DOUBLE PRECISION,
"extreme_brake_per_100km" DOUBLE PRECISION,
"full_braking_per_100km" DOUBLE PRECISION,
"kickdown_per_100km" DOUBLE PRECISION,
"launch_like_per_100km" DOUBLE PRECISION,
"brakes_per_100km" DOUBLE PRECISION,
"stop_density" DOUBLE PRECISION,
"high_speed_brake_share" DOUBLE PRECISION,
"mean_brake_energy_per_km" DOUBLE PRECISION,
"p95_negative_decel" DOUBLE PRECISION,
"longitudinal_stress_score" DOUBLE PRECISION,
"braking_stress_score" DOUBLE PRECISION,
"stop_go_stress_score" DOUBLE PRECISION,
"high_speed_stress_score" DOUBLE PRECISION,
"thermal_brake_stress_score" DOUBLE PRECISION,
"driving_style_score" DOUBLE PRECISION,
"model_version" TEXT NOT NULL,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "vehicle_driving_impact_current_pkey" PRIMARY KEY ("vehicle_id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_driving_impact_current_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "vehicle_driving_impact_current"
            ADD CONSTRAINT "vehicle_driving_impact_current_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "vehicle_driving_impact_current_organization_id_vehicle_id_idx" ON "vehicle_driving_impact_current"("organization_id", "vehicle_id");
