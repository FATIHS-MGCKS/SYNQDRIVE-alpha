-- Prompt 13: composite tenant indexes for booking secondary lookups

CREATE INDEX IF NOT EXISTS "booking_handover_protocols_org_booking_kind_idx"
  ON "booking_handover_protocols" ("organization_id", "booking_id", "kind");

CREATE INDEX IF NOT EXISTS "booking_allowed_drivers_org_booking_customer_idx"
  ON "booking_allowed_drivers" ("organization_id", "booking_id", "customer_id");
