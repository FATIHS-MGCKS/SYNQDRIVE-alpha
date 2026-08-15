-- CI-R3B historical predecessor repair slot 10
-- after: 20260617200000_hm_service_no_tracking_insight
-- before: 20260618180000_vehicle_damage_lifecycle

DO $$ BEGIN
    CREATE TYPE "DamageSeverity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR', 'CRITICAL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DamageType" AS ENUM ('SCRATCH', 'DENT', 'CRACK', 'BROKEN_PART', 'PAINT_DAMAGE', 'GLASS_DAMAGE', 'TIRE_DAMAGE', 'INTERIOR_DAMAGE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "vehicle_damage_images" (
        "id" TEXT NOT NULL,
"damage_id" TEXT NOT NULL,
"image_data" TEXT NOT NULL,
"caption" TEXT,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vehicle_damage_images_pkey" PRIMARY KEY ("id")
    );

CREATE TABLE IF NOT EXISTS "vehicle_damages" (
        "id" TEXT NOT NULL,
"vehicle_id" TEXT NOT NULL,
"damage_type" "DamageType" NOT NULL,
"severity" "DamageSeverity" NOT NULL DEFAULT 'MINOR'::"DamageSeverity",
"description" TEXT,
"location_x" DOUBLE PRECISION,
"location_y" DOUBLE PRECISION,
"location_label" TEXT,
"estimated_cost_cents" INTEGER,
"reported_by" TEXT,
"repaired_at" TIMESTAMP(3) WITHOUT TIME ZONE,
"created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT "vehicle_damages_pkey" PRIMARY KEY ("id")
    );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_damage_images_damage_id_fkey'
    ) THEN
        ALTER TABLE "vehicle_damage_images"
            ADD CONSTRAINT "vehicle_damage_images_damage_id_fkey"
            FOREIGN KEY ("damage_id") REFERENCES "vehicle_damages"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_damages_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "vehicle_damages"
            ADD CONSTRAINT "vehicle_damages_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "vehicle_damage_images_damage_id_idx" ON "vehicle_damage_images"("damage_id");

CREATE INDEX IF NOT EXISTS "vehicle_damages_damage_type_idx" ON "vehicle_damages"("damage_type");

CREATE INDEX IF NOT EXISTS "vehicle_damages_vehicle_id_idx" ON "vehicle_damages"("vehicle_id");
