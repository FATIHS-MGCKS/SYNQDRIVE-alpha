-- Operator tire measurement idempotency + handover context on tread measurements (Prompt 28)

ALTER TABLE "vehicle_tire_tread_measurements"
  ADD COLUMN IF NOT EXISTS "booking_id" TEXT,
  ADD COLUMN IF NOT EXISTS "handover_session_id" TEXT;

CREATE INDEX IF NOT EXISTS "vehicle_tire_tread_measurements_booking_id_idx"
  ON "vehicle_tire_tread_measurements"("booking_id");

CREATE INDEX IF NOT EXISTS "vehicle_tire_tread_measurements_handover_session_id_idx"
  ON "vehicle_tire_tread_measurements"("handover_session_id");

ALTER TABLE "vehicle_tire_tread_measurements"
  ADD CONSTRAINT "vehicle_tire_tread_measurements_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicle_tire_tread_measurements"
  ADD CONSTRAINT "vehicle_tire_tread_measurements_handover_session_id_fkey"
  FOREIGN KEY ("handover_session_id") REFERENCES "booking_handover_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "operator_tire_measurement_idempotency" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "capture_key" TEXT NOT NULL,
  "measurement_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "booking_id" TEXT,
  "handover_session_id" TEXT,
  "captured_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operator_tire_measurement_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "operator_tire_measurement_idempotency_organization_id_capture_key_key"
  ON "operator_tire_measurement_idempotency"("organization_id", "capture_key");

CREATE INDEX IF NOT EXISTS "operator_tire_measurement_idempotency_measurement_id_idx"
  ON "operator_tire_measurement_idempotency"("measurement_id");

CREATE INDEX IF NOT EXISTS "operator_tire_measurement_idempotency_vehicle_id_idx"
  ON "operator_tire_measurement_idempotency"("vehicle_id");

ALTER TABLE "operator_tire_measurement_idempotency"
  ADD CONSTRAINT "operator_tire_measurement_idempotency_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_tire_measurement_idempotency"
  ADD CONSTRAINT "operator_tire_measurement_idempotency_measurement_id_fkey"
  FOREIGN KEY ("measurement_id") REFERENCES "vehicle_tire_tread_measurements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_tire_measurement_idempotency"
  ADD CONSTRAINT "operator_tire_measurement_idempotency_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operator_tire_measurement_idempotency"
  ADD CONSTRAINT "operator_tire_measurement_idempotency_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operator_tire_measurement_idempotency"
  ADD CONSTRAINT "operator_tire_measurement_idempotency_handover_session_id_fkey"
  FOREIGN KEY ("handover_session_id") REFERENCES "booking_handover_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
