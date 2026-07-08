-- Trip booking link source distinguishes explicit booking links from time-window inference.
CREATE TYPE "TripBookingLinkSource" AS ENUM ('EXPLICIT', 'TIME_WINDOW');

ALTER TABLE "vehicle_trips"
ADD COLUMN "booking_link_source" "TripBookingLinkSource";

-- Existing assigned trips were inferred via booking overlap — mark conservatively.
UPDATE "vehicle_trips"
SET "booking_link_source" = 'TIME_WINDOW'
WHERE "assigned_booking_id" IS NOT NULL
  AND "booking_link_source" IS NULL;
