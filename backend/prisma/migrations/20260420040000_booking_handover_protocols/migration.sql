-- V4.6.75 — Booking Handover Protocols (Pickup + Return)
-- New table booking_handover_protocols stores the formal handover record per
-- booking: odometer reading, fuel/SoC level, cleanliness + warning-light
-- checks, operator/customer signatures (PNG data URL from canvas + typed
-- name fallback), free-form notes and a JSON array of VehicleDamage.id values
-- that were noted or newly created during the handover.
-- Unique (booking_id, kind) enforces exactly one PICKUP and one RETURN row
-- per booking. Lifecycle transitions (CONFIRMED->ACTIVE on PICKUP,
-- ACTIVE->COMPLETED on RETURN) are enforced in BookingsHandoverService and
-- persisted via the existing bookings table — this table is additive, no
-- schema change on bookings.

-- Enum for the two handover kinds
CREATE TYPE "HandoverKind" AS ENUM ('PICKUP', 'RETURN');

CREATE TABLE "booking_handover_protocols" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "kind" "HandoverKind" NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performed_by_user_id" TEXT,
    "performed_by_name" TEXT,
    "odometer_km" INTEGER NOT NULL,
    "fuel_percent" INTEGER NOT NULL,
    "fuel_full" BOOLEAN NOT NULL DEFAULT false,
    "exterior_clean" BOOLEAN NOT NULL DEFAULT true,
    "interior_clean" BOOLEAN NOT NULL DEFAULT true,
    "tires_season_ok" BOOLEAN NOT NULL DEFAULT true,
    "warning_lights_on" BOOLEAN NOT NULL DEFAULT false,
    "warning_lights_notes" TEXT,
    "notes" TEXT,
    "customer_signature_name" TEXT,
    "customer_signature_data_url" TEXT,
    "staff_signature_name" TEXT,
    "staff_signature_data_url" TEXT,
    "documents_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "damage_ids" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_handover_protocols_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_handover_protocols_booking_id_kind_key"
    ON "booking_handover_protocols"("booking_id", "kind");
CREATE INDEX "booking_handover_protocols_organization_id_idx"
    ON "booking_handover_protocols"("organization_id");
CREATE INDEX "booking_handover_protocols_vehicle_id_idx"
    ON "booking_handover_protocols"("vehicle_id");

ALTER TABLE "booking_handover_protocols"
    ADD CONSTRAINT "booking_handover_protocols_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_handover_protocols"
    ADD CONSTRAINT "booking_handover_protocols_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_handover_protocols"
    ADD CONSTRAINT "booking_handover_protocols_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
