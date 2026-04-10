-- AddColumn: Enrichment status tracking fields on vehicle_trips
-- These support the canonical trip enrichment pipeline unification.

ALTER TABLE "vehicle_trips"
  ADD COLUMN IF NOT EXISTS "behavior_enrichment_status"      TEXT,
  ADD COLUMN IF NOT EXISTS "behavior_enrichment_attempts"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "behavior_enrichment_error"       TEXT,
  ADD COLUMN IF NOT EXISTS "behavior_enrichment_started_at"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "driving_impact_computed_at"      TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "vehicle_trips_behavior_enrichment_status_idx"
  ON "vehicle_trips" ("behavior_enrichment_status");
