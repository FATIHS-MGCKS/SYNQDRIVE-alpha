-- ============================================================================
-- Phase 2E.4: partial UNIQUE on vehicles.dimo_vehicle_id (non-null only)
--
-- Prevents cross-org duplicate DIMO bindings at the database layer.
-- Run duplicate audit before applying in production:
--   SELECT dimo_vehicle_id, COUNT(*) FROM vehicles
--   WHERE dimo_vehicle_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
--
-- Uses CREATE INDEX CONCURRENTLY — not inside an explicit transaction block.
-- ============================================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "vehicles_dimo_vehicle_id_unique"
  ON "vehicles" ("dimo_vehicle_id")
  WHERE "dimo_vehicle_id" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicles_dimo_vehicle_id_idx"
  ON "vehicles" ("dimo_vehicle_id")
  WHERE "dimo_vehicle_id" IS NOT NULL;
