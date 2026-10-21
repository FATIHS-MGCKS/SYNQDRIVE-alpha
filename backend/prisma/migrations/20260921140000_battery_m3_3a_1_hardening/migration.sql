-- M3.3A.1 — semantic + concurrency hardening

ALTER TYPE "BatteryGeneralizedEvidenceClass" ADD VALUE IF NOT EXISTS 'PARKED_REST_CANDIDATE';

ALTER TABLE "battery_rest_sessions"
  ADD COLUMN IF NOT EXISTS "rest_observation_count" INTEGER NOT NULL DEFAULT 0;

-- At most one non-terminal rest session per vehicle (multi-replica safety).
CREATE UNIQUE INDEX IF NOT EXISTS "battery_rest_session_one_active_per_vehicle"
  ON "battery_rest_sessions" ("vehicle_id")
  WHERE "session_status" IN ('CANDIDATE', 'CONFIRMED', 'RESTING');
