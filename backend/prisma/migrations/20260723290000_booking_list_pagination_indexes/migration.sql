-- CreateIndex
CREATE INDEX "bookings_organization_id_start_date_id_idx" ON "bookings"("organization_id", "start_date", "id");

-- CreateIndex
CREATE INDEX "bookings_organization_id_vehicle_id_start_date_idx" ON "bookings"("organization_id", "vehicle_id", "start_date");
