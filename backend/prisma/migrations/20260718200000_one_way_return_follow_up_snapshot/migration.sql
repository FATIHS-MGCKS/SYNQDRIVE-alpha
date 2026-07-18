-- One-way return follow-up snapshot on handover protocol (Prompt 51/78)
ALTER TABLE "booking_handover_protocols"
ADD COLUMN "one_way_return_follow_up_snapshot" JSONB;
