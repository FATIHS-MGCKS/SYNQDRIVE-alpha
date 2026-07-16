-- P43 — structured vehicle load components on driving impact rows

ALTER TABLE "TripDrivingImpact"
  ADD COLUMN IF NOT EXISTS "load_components_json" JSONB;

ALTER TABLE "VehicleDrivingImpactCurrent"
  ADD COLUMN IF NOT EXISTS "load_components_json" JSONB;
