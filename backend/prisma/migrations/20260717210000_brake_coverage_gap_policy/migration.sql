-- Brake coverage gap policy: expose raw coverage metrics (no rolling-gap leakage).

ALTER TABLE "brake_health_current"
  ADD COLUMN IF NOT EXISTS "under_coverage_km" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "over_coverage_km" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "coverage_ratio_raw" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "coverage_status" TEXT;
