-- Tire trip usage ledger replay & concurrency safety (Prompt 11) — additive only.

ALTER TYPE "TireEventType" ADD VALUE IF NOT EXISTS 'TRIP_USAGE_REVISED';

ALTER TABLE "tire_trip_usage_ledger"
  ADD COLUMN IF NOT EXISTS "revision_number" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "previous_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "invalidated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invalidation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "superseded_by_trip_id" TEXT;

CREATE INDEX IF NOT EXISTS "tire_trip_usage_ledger_tire_setup_id_invalidated_at_idx"
  ON "tire_trip_usage_ledger"("tire_setup_id", "invalidated_at");
