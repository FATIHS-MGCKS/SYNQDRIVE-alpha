-- Booking status command idempotency ledger (Prompt 9)
CREATE TYPE "BookingStatusCommandType" AS ENUM (
  'CONFIRM',
  'ACTIVATE',
  'COMPLETE',
  'CANCEL',
  'MARK_NO_SHOW',
  'ADMIN_OVERRIDE'
);

CREATE TABLE "booking_status_commands" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "command_type" "BookingStatusCommandType" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "from_status" "BookingStatus",
  "to_status" "BookingStatus" NOT NULL,
  "trigger" TEXT NOT NULL,
  "reason_code" TEXT NOT NULL,
  "request_payload" JSONB,
  "result_payload" JSONB NOT NULL,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_status_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_status_commands_organization_id_idempotency_key_key"
  ON "booking_status_commands"("organization_id", "idempotency_key");

CREATE INDEX "booking_status_commands_booking_id_command_type_idx"
  ON "booking_status_commands"("booking_id", "command_type");

CREATE INDEX "booking_status_commands_organization_id_booking_id_idx"
  ON "booking_status_commands"("organization_id", "booking_id");

ALTER TABLE "booking_status_commands"
  ADD CONSTRAINT "booking_status_commands_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_status_commands"
  ADD CONSTRAINT "booking_status_commands_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
