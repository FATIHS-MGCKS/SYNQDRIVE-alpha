-- CreateEnum
CREATE TYPE "VehicleStationTransferStatus" AS ENUM ('PLANNED', 'READY', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED', 'OVERDUE');

-- CreateTable
CREATE TABLE "vehicle_station_transfers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "from_station_id" TEXT,
    "to_station_id" TEXT NOT NULL,
    "status" "VehicleStationTransferStatus" NOT NULL DEFAULT 'PLANNED',
    "planned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_arrival_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "performed_by_user_id" TEXT,
    "reason" TEXT,
    "source_booking_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_station_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_station_transfers_organization_id_vehicle_id_status_idx" ON "vehicle_station_transfers"("organization_id", "vehicle_id", "status");

-- CreateIndex
CREATE INDEX "vehicle_station_transfers_organization_id_to_station_id_stat_idx" ON "vehicle_station_transfers"("organization_id", "to_station_id", "status");

-- AddForeignKey
ALTER TABLE "vehicle_station_transfers" ADD CONSTRAINT "vehicle_station_transfers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_station_transfers" ADD CONSTRAINT "vehicle_station_transfers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_station_transfers" ADD CONSTRAINT "vehicle_station_transfers_from_station_id_fkey" FOREIGN KEY ("from_station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_station_transfers" ADD CONSTRAINT "vehicle_station_transfers_to_station_id_fkey" FOREIGN KEY ("to_station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_station_transfers" ADD CONSTRAINT "vehicle_station_transfers_source_booking_id_fkey" FOREIGN KEY ("source_booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
