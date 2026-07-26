-- ============================================================================
-- Phase 2E.4: partial UNIQUE on vehicles.dimo_vehicle_id (non-null only)
--
-- Prevents cross-org duplicate DIMO bindings at the database layer.
-- Run duplicate audit before applying in production:
--   SELECT dimo_vehicle_id, COUNT(*) FROM vehicles
--   WHERE dimo_vehicle_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
--
-- Plain (non-CONCURRENTLY) CREATE INDEX: the Prisma migrate engine wraps each
-- migration in a transaction, and CREATE INDEX CONCURRENTLY is rejected inside
-- one (SQLSTATE 25001). The exclusive lock is negligible here — `vehicles` is a
-- low-cardinality table and the DIMO binding column is sparsely populated.
--
-- The partial UNIQUE index also serves equality lookups on dimo_vehicle_id, so
-- no separate non-unique index is needed.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_dimo_vehicle_id_unique"
  ON "vehicles" ("dimo_vehicle_id")
  WHERE "dimo_vehicle_id" IS NOT NULL;
