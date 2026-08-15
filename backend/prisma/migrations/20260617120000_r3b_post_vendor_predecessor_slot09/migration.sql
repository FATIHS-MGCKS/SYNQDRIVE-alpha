-- CI-R3B historical predecessor repair slot 9
-- after: 20260617120000_pricing_tariffs
-- before: 20260617120000_tire_identity_mounted_dismounted

DO $$ BEGIN
    CREATE TYPE "TireHealthStatus" AS ENUM ('EXCELLENT', 'GOOD', 'MODERATE', 'POOR', 'REPLACE_NOW');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "TirePosition" AS ENUM ('FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "TireSeason" AS ENUM ('SUMMER', 'WINTER', 'ALL_SEASON', 'TRACK', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "tires" (
        "id" TEXT NOT NULL,
"organization_id" TEXT NOT NULL,
"vehicle_id" TEXT NOT NULL,
"tire_set_id" TEXT,
"brand" TEXT,
"tire_model" TEXT,
"width" INTEGER,
"aspect_ratio" INTEGER,
"rim_diameter" INTEGER,
"load_index" TEXT,
"speed_index" TEXT,
"season_type" "TireSeason" NOT NULL DEFAULT 'ALL_SEASON'::"TireSeason",
"runflat" BOOLEAN NOT NULL DEFAULT false,
"reinforced" BOOLEAN NOT NULL DEFAULT false,
"dot_code" TEXT,
"production_week" INTEGER,
"production_year" INTEGER,
"installed_position" "TirePosition" NOT NULL,
"current_position" "TirePosition" NOT NULL,
"initial_tread_depth_mm" DOUBLE PRECISION NOT NULL,
"legal_min_tread_mm" DOUBLE PRECISION NOT NULL DEFAULT 1.6,
"target_replace_tread_mm" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
"estimated_tread_mm" DOUBLE PRECISION,
"estimated_wear_percent" DOUBLE PRECISION,
"estimated_remaining_km" INTEGER,
"wear_rate_mm_per_1000km" DOUBLE PRECISION,
"health_status" "TireHealthStatus" NOT NULL DEFAULT 'EXCELLENT'::"TireHealthStatus",
"confidence_score" DOUBLE PRECISION,
"confidence_label" TEXT,
"total_km_on_tire" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
"city_km" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
"highway_km" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
"rural_km" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
"harsh_accel_events" INTEGER NOT NULL DEFAULT 0,
"harsh_brake_events" INTEGER NOT NULL DEFAULT 0,
"high_lateral_events" INTEGER NOT NULL DEFAULT 0,
"burnout_events" INTEGER NOT NULL DEFAULT 0,
"last_recalculated_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"active" BOOLEAN NOT NULL DEFAULT true,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "tires_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tires_tire_set_id_fkey'
    ) THEN
        ALTER TABLE "tires"
            ADD CONSTRAINT "tires_tire_set_id_fkey"
            FOREIGN KEY ("tire_set_id") REFERENCES "vehicle_tire_setups"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tires_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "tires"
            ADD CONSTRAINT "tires_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tires_organization_id_vehicle_id_idx" ON "tires"("organization_id", "vehicle_id");

CREATE INDEX IF NOT EXISTS "tires_tire_set_id_idx" ON "tires"("tire_set_id");

CREATE INDEX IF NOT EXISTS "tires_vehicle_id_active_idx" ON "tires"("vehicle_id", "active");
