ALTER TABLE "vehicle_driving_impact_current"
ADD COLUMN IF NOT EXISTS "rolling_window_json" JSONB;
