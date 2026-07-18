-- Prompt 59/78: additive indexes for occupied Stations V2 query paths.
-- Lock profile: CREATE INDEX (non-concurrent) takes SHARE UPDATE EXCLUSIVE on the target
-- table; reads continue, writes to the indexed table are blocked until complete.
-- For large production tables, prefer CREATE INDEX CONCURRENTLY in a manual ops window.

-- Home fleet (org summaries batch): vehicles WHERE organization_id = ? AND station_id IN (...)
CREATE INDEX "vehicles_organization_id_home_station_id_idx"
ON "vehicles"("organization_id", "station_id");

-- Today's pickups + timeline pickup windows:
-- bookings WHERE organization_id = ? AND pickup_station_id = ? AND start_date BETWEEN ...
CREATE INDEX "bookings_organization_id_pickup_station_id_start_date_idx"
ON "bookings"("organization_id", "pickup_station_id", "start_date");

-- Today's returns, overdue returns, timeline return windows:
-- bookings WHERE organization_id = ? AND return_station_id = ? AND end_date BETWEEN ...
CREATE INDEX "bookings_organization_id_return_station_id_end_date_idx"
ON "bookings"("organization_id", "return_station_id", "end_date");

-- Outgoing transfers (mirror of existing to_station_id + status index):
-- vehicle_station_transfers WHERE organization_id = ? AND from_station_id = ? AND status IN (...)
CREATE INDEX "vehicle_station_transfers_organization_id_from_station_id_stat_idx"
ON "vehicle_station_transfers"("organization_id", "from_station_id", "status");

-- Timeline after-hours handovers:
-- booking_handover_protocols WHERE organization_id = ? AND actual_station_id = ? AND performed_at BETWEEN ...
CREATE INDEX "booking_handover_protocols_org_actual_station_performed_at_idx"
ON "booking_handover_protocols"("organization_id", "actual_station_id", "performed_at")
WHERE "actual_station_id" IS NOT NULL;
