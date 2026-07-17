-- P43 — structured vehicle load components on driving impact rows

ALTER TABLE "trip_driving_impact"
  ADD COLUMN IF NOT EXISTS "load_components_json" JSONB;

ALTER TABLE "vehicle_driving_impact_current"
  ADD COLUMN IF NOT EXISTS "load_components_json" JSONB;
