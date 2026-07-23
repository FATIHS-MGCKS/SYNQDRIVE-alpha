-- Prompt 20/32 — append-only audit for booking pickup gate decisions and overrides.

CREATE TABLE "booking_pickup_gate_audit_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_display_name" TEXT,
    "override_reason" TEXT,
    "gate_code" TEXT,
    "missing_requirements" JSONB,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_pickup_gate_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_pickup_gate_audit_events_org_booking_created_idx"
    ON "booking_pickup_gate_audit_events"("organization_id", "booking_id", "created_at");

CREATE INDEX "booking_pickup_gate_audit_events_org_created_idx"
    ON "booking_pickup_gate_audit_events"("organization_id", "created_at");

ALTER TABLE "booking_pickup_gate_audit_events"
    ADD CONSTRAINT "booking_pickup_gate_audit_events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_pickup_gate_audit_events"
    ADD CONSTRAINT "booking_pickup_gate_audit_events_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
