-- AlterTable
ALTER TABLE "dimo_vehicles" ADD COLUMN     "last_snapshot_at" TIMESTAMP(3),
ADD COLUMN     "snapshot_ev_soc" DOUBLE PRECISION,
ADD COLUMN     "snapshot_fuel_level_pct" DOUBLE PRECISION,
ADD COLUMN     "snapshot_odometer_km" DOUBLE PRECISION;
