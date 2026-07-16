-- Driving Intelligence V2 P24 — deterministic native DIMO event identity.

CREATE TYPE "DrivingEventTripAssignment" AS ENUM ('ASSIGNED', 'UNASSIGNED');

ALTER TABLE "driving_events"
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_event_name" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_source_id" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "trip_assignment" "DrivingEventTripAssignment" NOT NULL DEFAULT 'UNASSIGNED';

CREATE UNIQUE INDEX IF NOT EXISTS "driving_events_org_provider_fingerprint"
  ON "driving_events" ("organization_id", "provider_fingerprint");

CREATE INDEX IF NOT EXISTS "driving_events_vehicle_id_trip_assignment_idx"
  ON "driving_events" ("vehicle_id", "trip_assignment");

CREATE INDEX IF NOT EXISTS "driving_events_organization_id_vehicle_id_recorded_at_idx"
  ON "driving_events" ("organization_id", "vehicle_id", "recorded_at");
