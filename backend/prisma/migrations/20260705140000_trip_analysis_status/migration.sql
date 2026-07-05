-- Canonical post-trip analysis status (separate from trip lifecycle COMPLETED)

ALTER TABLE "vehicle_trips" ADD COLUMN "trip_analysis_status" TEXT;
ALTER TABLE "vehicle_trips" ADD COLUMN "analysis_queued_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN "analysis_started_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN "analysis_partial_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN "analysis_completed_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN "analysis_failed_at" TIMESTAMP(3);
ALTER TABLE "vehicle_trips" ADD COLUMN "analysis_failed_reason" TEXT;
ALTER TABLE "vehicle_trips" ADD COLUMN "analysis_latency_ms" INTEGER;
ALTER TABLE "vehicle_trips" ADD COLUMN "analysis_stages_json" JSONB;

CREATE INDEX "vehicle_trips_trip_analysis_status_idx" ON "vehicle_trips"("trip_analysis_status");
