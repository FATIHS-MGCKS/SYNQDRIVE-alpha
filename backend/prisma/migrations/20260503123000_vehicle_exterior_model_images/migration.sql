-- V4.7.50 + V4.7.58 — Vehicle exterior images (per-vehicle overrides) and
-- reusable model-level templates. Written idempotently because the
-- VehicleExteriorView enum and the base vehicle_exterior_images table were
-- never created by any prior migration in this database (the original feature
-- was schema-pushed in another environment), which is why this migration
-- previously failed referencing a missing type.

-- 1) Enum used by both tables.
DO $$ BEGIN
  CREATE TYPE "VehicleExteriorView" AS ENUM ('FRONT', 'LEFT', 'RIGHT', 'REAR', 'ROOF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Per-vehicle exterior images (override layer).
CREATE TABLE IF NOT EXISTS "vehicle_exterior_images" (
  "id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "view" "VehicleExteriorView" NOT NULL,
  "image_data" TEXT NOT NULL,
  "caption" TEXT,
  "uploaded_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vehicle_exterior_images_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vehicle_exterior_images_vehicle_id_idx"
  ON "vehicle_exterior_images"("vehicle_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_exterior_images_vehicle_id_view_key"
  ON "vehicle_exterior_images"("vehicle_id", "view");

-- 3) Reusable model-level templates (fallback layer).
CREATE TABLE IF NOT EXISTS "vehicle_exterior_model_images" (
  "id" TEXT NOT NULL,
  "model_key" TEXT NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "view" "VehicleExteriorView" NOT NULL,
  "image_data" TEXT NOT NULL,
  "caption" TEXT,
  "source_vehicle_id" TEXT,
  "uploaded_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vehicle_exterior_model_images_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "vehicle_exterior_model_images_model_key_idx"
  ON "vehicle_exterior_model_images"("model_key");
CREATE INDEX IF NOT EXISTS "vehicle_exterior_model_images_make_model_idx"
  ON "vehicle_exterior_model_images"("make", "model");
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_exterior_model_images_model_key_view_key"
  ON "vehicle_exterior_model_images"("model_key", "view");

-- 4) FK from per-vehicle images to vehicles (guarded).
DO $$ BEGIN
  ALTER TABLE "vehicle_exterior_images"
    ADD CONSTRAINT "vehicle_exterior_images_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
