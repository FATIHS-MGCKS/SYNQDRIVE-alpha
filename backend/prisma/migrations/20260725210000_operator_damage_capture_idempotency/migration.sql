-- Operator damage capture idempotency (Prompt 26)

CREATE TABLE "operator_damage_capture_idempotency" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "capture_key" TEXT NOT NULL,
    "damage_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "captured_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_damage_capture_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operator_damage_capture_idempotency_organization_id_capture_key_key" ON "operator_damage_capture_idempotency"("organization_id", "capture_key");
CREATE INDEX "operator_damage_capture_idempotency_damage_id_idx" ON "operator_damage_capture_idempotency"("damage_id");
CREATE INDEX "operator_damage_capture_idempotency_vehicle_id_idx" ON "operator_damage_capture_idempotency"("vehicle_id");

ALTER TABLE "operator_damage_capture_idempotency" ADD CONSTRAINT "operator_damage_capture_idempotency_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operator_damage_capture_idempotency" ADD CONSTRAINT "operator_damage_capture_idempotency_damage_id_fkey" FOREIGN KEY ("damage_id") REFERENCES "vehicle_damages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operator_damage_capture_idempotency" ADD CONSTRAINT "operator_damage_capture_idempotency_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operator_damage_capture_idempotency" ADD CONSTRAINT "operator_damage_capture_idempotency_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
