-- Tire lifecycle invariants (Prompt 5)
-- NOT applied to production automatically — deploy via `prisma migrate deploy` on staging first.
--
-- Prisma schema note:
-- Partial unique indexes are NOT expressible in schema.prisma; they are managed here only.
-- See docs/implementation/tire-health-production-readiness-remediation-2026-07.md § Prompt 5.

-- Extend lifecycle enum with canonical states (additive; legacy DISCARDED/SOLD retained).
ALTER TYPE "TireSetupStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "TireSetupStatus" ADD VALUE IF NOT EXISTS 'REMOVED';
ALTER TYPE "TireSetupStatus" ADD VALUE IF NOT EXISTS 'RETIRED';

-- At most one ACTIVE, non-removed setup per vehicle (P0-TH-02).
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_tire_setups_one_active_setup_per_vehicle"
  ON "vehicle_tire_setups"("vehicle_id")
  WHERE "status" = 'ACTIVE' AND "removed_at" IS NULL;

-- At most one active tire identity per setup + wheel position.
CREATE UNIQUE INDEX IF NOT EXISTS "tires_one_active_tire_per_setup_position"
  ON "tires"("tire_set_id", "current_position")
  WHERE "active" = true AND "tire_set_id" IS NOT NULL;
