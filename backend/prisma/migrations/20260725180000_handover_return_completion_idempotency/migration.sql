-- V4.9.842 — Return handover completion idempotency (Prompt 16)

CREATE TABLE "booking_handover_return_completion_idempotency" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "session_id" UUID,
  "protocol_id" UUID NOT NULL,
  "response_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_handover_return_completion_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_handover_return_completion_org_idempotency_key"
  ON "booking_handover_return_completion_idempotency"("organization_id", "idempotency_key");

CREATE INDEX "booking_handover_return_completion_booking_id_idx"
  ON "booking_handover_return_completion_idempotency"("booking_id");

ALTER TABLE "booking_handover_return_completion_idempotency"
  ADD CONSTRAINT "booking_handover_return_completion_idempotency_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_return_completion_idempotency"
  ADD CONSTRAINT "booking_handover_return_completion_idempotency_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
