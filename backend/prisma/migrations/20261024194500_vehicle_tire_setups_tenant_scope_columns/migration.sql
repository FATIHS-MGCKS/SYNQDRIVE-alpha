-- vehicle_tire_setups.organization_id: required by tire_trip_usage_ledger_scope_guard (20260716210000).
-- is_staggered: Prisma schema field missing from historical migration chain.

ALTER TABLE "vehicle_tire_setups"
  ADD COLUMN "organization_id" TEXT,
  ADD COLUMN "is_staggered" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "vehicle_tire_setups_organization_id_vehicle_id_idx"
  ON "vehicle_tire_setups"("organization_id", "vehicle_id");
