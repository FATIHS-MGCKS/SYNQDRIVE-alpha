-- Persist server-evaluated station booking rules on bookings (WARNING snapshots + audit context).
ALTER TABLE "bookings" ADD COLUMN "station_booking_rules_snapshot" JSONB;
