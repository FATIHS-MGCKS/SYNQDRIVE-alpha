-- PDI P1B.1 hardening: durable identity-verification idempotency + Prisma/schema parity for dimo_vehicles.

-- Prisma client expects optional mirror fields that were never migrated historically.
ALTER TABLE "dimo_vehicles" ADD COLUMN IF NOT EXISTS "powertrain_type" TEXT;
ALTER TABLE "dimo_vehicles" ADD COLUMN IF NOT EXISTS "battery_percent" DOUBLE PRECISION;
ALTER TABLE "dimo_vehicles" ADD COLUMN IF NOT EXISTS "fuel_percent" DOUBLE PRECISION;

ALTER TABLE "physical_device_inventory_audit_events"
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "physical_device_inventory_audit_identity_idempotency_key_uq"
  ON "physical_device_inventory_audit_events" ("idempotency_key")
  WHERE "event_kind" = 'IDENTITY_VERIFICATION' AND "idempotency_key" IS NOT NULL;
