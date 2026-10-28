ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "engine_displacement_cc" INTEGER,
  ADD COLUMN IF NOT EXISTS "cylinder_count" INTEGER;
