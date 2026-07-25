-- V4.9.840 — Booking handover session lifecycle (server-side state machine)

CREATE TYPE "HandoverSessionStatus" AS ENUM (
  'DRAFT',
  'IN_PROGRESS',
  'AWAITING_REQUIREMENTS',
  'AWAITING_SIGNATURE',
  'SUBMITTED',
  'COMPLETED',
  'CANCELLED',
  'SUPERSEDED'
);

CREATE TABLE "booking_handover_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "kind" "HandoverKind" NOT NULL,
  "status" "HandoverSessionStatus" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "payload_json" JSONB,
  "blocking_requirements" JSONB,
  "locked_by_user_id" UUID,
  "locked_at" TIMESTAMP(3),
  "scope_override_reason" TEXT,
  "cancel_reason" TEXT,
  "superseded_by_id" UUID,
  "completed_protocol_id" UUID,
  "submitted_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "booking_handover_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_handover_sessions_organization_id_idx"
  ON "booking_handover_sessions"("organization_id");

CREATE INDEX "booking_handover_sessions_booking_id_kind_idx"
  ON "booking_handover_sessions"("booking_id", "kind");

CREATE INDEX "booking_handover_sessions_vehicle_id_idx"
  ON "booking_handover_sessions"("vehicle_id");

-- At most one non-terminal session per booking side.
CREATE UNIQUE INDEX "booking_handover_sessions_active_unique"
  ON "booking_handover_sessions"("booking_id", "kind")
  WHERE "status" NOT IN ('COMPLETED', 'CANCELLED', 'SUPERSEDED');

ALTER TABLE "booking_handover_sessions"
  ADD CONSTRAINT "booking_handover_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_sessions"
  ADD CONSTRAINT "booking_handover_sessions_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_handover_sessions"
  ADD CONSTRAINT "booking_handover_sessions_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
