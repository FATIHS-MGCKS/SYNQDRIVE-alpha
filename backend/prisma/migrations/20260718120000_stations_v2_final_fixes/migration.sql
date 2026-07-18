-- Stations V2 final fixes (Prompt 77/78) — additive only

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "current_station_source" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "current_station_confirmed_at" TIMESTAMP(3);
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "archived_capabilities_snapshot" JSONB;

CREATE TYPE "VehicleStationTransferStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS "vehicle_station_transfers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "from_station_id" TEXT,
    "to_station_id" TEXT NOT NULL,
    "status" "VehicleStationTransferStatus" NOT NULL DEFAULT 'PLANNED',
    "planned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrived_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_station_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicle_station_transfers_organization_id_vehicle_id_status_idx"
  ON "vehicle_station_transfers"("organization_id", "vehicle_id", "status");
CREATE INDEX IF NOT EXISTS "vehicle_station_transfers_organization_id_to_station_id_idx"
  ON "vehicle_station_transfers"("organization_id", "to_station_id");

ALTER TABLE "vehicle_station_transfers" ADD CONSTRAINT "vehicle_station_transfers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_station_transfers" ADD CONSTRAINT "vehicle_station_transfers_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_station_transfers" ADD CONSTRAINT "vehicle_station_transfers_from_station_id_fkey"
  FOREIGN KEY ("from_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_station_transfers" ADD CONSTRAINT "vehicle_station_transfers_to_station_id_fkey"
  FOREIGN KEY ("to_station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one primary station per organization
CREATE UNIQUE INDEX IF NOT EXISTS "stations_one_primary_per_org_idx"
  ON "stations" ("organization_id")
  WHERE "is_primary" = true;
