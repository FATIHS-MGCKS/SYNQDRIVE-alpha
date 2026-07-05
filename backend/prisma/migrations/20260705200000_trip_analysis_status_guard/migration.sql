-- Idempotent guard for post-trip analysis columns (safe on re-apply / partial deploys)

ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "trip_analysis_status" TEXT;
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "analysis_queued_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "analysis_started_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "analysis_partial_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "analysis_completed_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "analysis_failed_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "analysis_failed_reason" TEXT;
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "analysis_latency_ms" INTEGER;
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "analysis_stages_json" JSONB;

-- UI-facing readiness columns (may pre-exist on older schemas)
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "quality_status" TEXT;
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "behavior_summary_status" TEXT;
ALTER TABLE "vehicle_trips" ADD COLUMN IF NOT EXISTS "driving_impact_status" TEXT;

CREATE INDEX IF NOT EXISTS "vehicle_trips_trip_analysis_status_idx"
  ON "vehicle_trips"("trip_analysis_status");
