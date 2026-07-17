-- Tire trip usage attribution integration (Prompt 10) — additive only.

ALTER TYPE "TireEventType" ADD VALUE IF NOT EXISTS 'TRIP_USAGE_ATTRIBUTED';

ALTER TABLE "vehicle_trips"
  ADD COLUMN IF NOT EXISTS "tire_usage_attribution_status" TEXT,
  ADD COLUMN IF NOT EXISTS "tire_usage_processed_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "vehicle_trips_tire_usage_attribution_status_idx"
  ON "vehicle_trips"("tire_usage_attribution_status");
