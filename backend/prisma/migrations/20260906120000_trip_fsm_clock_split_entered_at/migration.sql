-- R1: separate FSM worker-entry clocks from event-time boundary candidates.
-- Additive, nullable, no backfill required.

ALTER TABLE "vehicle_trip_detection_states"
ADD COLUMN "possible_start_entered_at" TIMESTAMP(3),
ADD COLUMN "possible_end_entered_at" TIMESTAMP(3);
