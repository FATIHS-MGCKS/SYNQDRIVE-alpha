ALTER TABLE "booking_handover_sessions"
  ADD COLUMN "station_id" UUID,
  ADD COLUMN "current_step" TEXT,
  ADD COLUMN "started_by_user_id" UUID,
  ADD COLUMN "assigned_to_user_id" UUID,
  ADD COLUMN "updated_by_user_id" UUID,
  ADD COLUMN "expires_at" TIMESTAMPTZ;

CREATE INDEX "booking_handover_sessions_expires_at_idx"
  ON "booking_handover_sessions" ("expires_at");
