-- CI-R3B historical predecessor repair slot 12
-- after: 20260716180000_battery_capability_lifecycle
-- before: 20260716180000_tire_evidence_ground_truth_provenance

CREATE TABLE IF NOT EXISTS "tire_health_snapshots" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"vehicle_id" TEXT NOT NULL,
"tire_id" TEXT,
"tire_set_id" TEXT,
"snapshot_date" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
"odometer_km" DOUBLE PRECISION,
"estimated_tread_mm" DOUBLE PRECISION,
"estimated_wear_percent" DOUBLE PRECISION,
"estimated_remaining_km" INTEGER,
"city_share_percent" DOUBLE PRECISION,
"highway_share_percent" DOUBLE PRECISION,
"rural_share_percent" DOUBLE PRECISION,
"confidence_score" DOUBLE PRECISION,
"wear_rate_mm_per_1000km" DOUBLE PRECISION,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tire_health_snapshots_pkey" PRIMARY KEY ("id")
    );

CREATE TABLE IF NOT EXISTS "tire_wear_data_points" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"vehicle_id" TEXT NOT NULL,
"tire_set_id" TEXT,
"axle" TEXT NOT NULL,
"distance_km" DOUBLE PRECISION NOT NULL,
"predicted_tread_mm" DOUBLE PRECISION NOT NULL,
"actual_tread_mm" DOUBLE PRECISION NOT NULL,
"initial_tread_mm" DOUBLE PRECISION NOT NULL,
"climate_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"road_surface_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"road_type_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"driving_style_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"regen_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
"curb_weight_kg" DOUBLE PRECISION,
"tire_width_mm" INTEGER,
"tire_season" TEXT,
"residual_error" DOUBLE PRECISION,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "tire_wear_data_points_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tire_health_snapshots_tire_id_fkey'
    ) THEN
        ALTER TABLE "tire_health_snapshots"
            ADD CONSTRAINT "tire_health_snapshots_tire_id_fkey"
            FOREIGN KEY ("tire_id") REFERENCES "tires"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tire_health_snapshots_tire_set_id_fkey'
    ) THEN
        ALTER TABLE "tire_health_snapshots"
            ADD CONSTRAINT "tire_health_snapshots_tire_set_id_fkey"
            FOREIGN KEY ("tire_set_id") REFERENCES "vehicle_tire_setups"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tire_health_snapshots_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "tire_health_snapshots"
            ADD CONSTRAINT "tire_health_snapshots_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tire_wear_data_points_tire_set_id_fkey'
    ) THEN
        ALTER TABLE "tire_wear_data_points"
            ADD CONSTRAINT "tire_wear_data_points_tire_set_id_fkey"
            FOREIGN KEY ("tire_set_id") REFERENCES "vehicle_tire_setups"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tire_wear_data_points_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "tire_wear_data_points"
            ADD CONSTRAINT "tire_wear_data_points_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tire_health_snapshots_tire_id_snapshot_date_idx" ON "tire_health_snapshots"("tire_id", "snapshot_date");

CREATE INDEX IF NOT EXISTS "tire_health_snapshots_tire_set_id_idx" ON "tire_health_snapshots"("tire_set_id");

CREATE INDEX IF NOT EXISTS "tire_health_snapshots_vehicle_id_snapshot_date_idx" ON "tire_health_snapshots"("vehicle_id", "snapshot_date");

CREATE INDEX IF NOT EXISTS "tire_wear_data_points_organization_id_idx" ON "tire_wear_data_points"("organization_id");

CREATE INDEX IF NOT EXISTS "tire_wear_data_points_tire_set_id_idx" ON "tire_wear_data_points"("tire_set_id");

CREATE INDEX IF NOT EXISTS "tire_wear_data_points_vehicle_id_idx" ON "tire_wear_data_points"("vehicle_id");
