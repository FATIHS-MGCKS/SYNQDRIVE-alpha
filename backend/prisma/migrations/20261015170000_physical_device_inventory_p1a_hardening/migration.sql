-- Physical Device Inventory P1A hardening: case-insensitive uniqueness, audit durability, assignment history safety

CREATE TYPE "PhysicalDeviceInventoryAuditEventKind" AS ENUM ('MANUAL_INTAKE');

CREATE TABLE "physical_device_inventory_audit_events" (
    "id" TEXT NOT NULL,
    "physical_device_id" TEXT NOT NULL,
    "event_kind" "PhysicalDeviceInventoryAuditEventKind" NOT NULL,
    "actor_user_id" TEXT,
    "payload_fingerprint" TEXT NOT NULL,
    "evidence_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_device_inventory_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "physical_device_inventory_audit_events_physical_device_id_created_at_idx" ON "physical_device_inventory_audit_events"("physical_device_id", "created_at");

ALTER TABLE "physical_device_inventory_audit_events" ADD CONSTRAINT "physical_device_inventory_audit_events_physical_device_id_fkey" FOREIGN KEY ("physical_device_id") REFERENCES "physical_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "physical_devices_serial_number_key";
DROP INDEX IF EXISTS "physical_devices_imei_key";

CREATE UNIQUE INDEX "physical_devices_serial_number_canonical_key" ON "physical_devices" (UPPER("serial_number")) WHERE "serial_number" IS NOT NULL;
CREATE UNIQUE INDEX "physical_devices_imei_canonical_key" ON "physical_devices" ("imei") WHERE "imei" IS NOT NULL;

ALTER TABLE "physical_device_assignments" DROP CONSTRAINT IF EXISTS "physical_device_assignments_physical_device_id_fkey";
ALTER TABLE "physical_device_assignments" ADD CONSTRAINT "physical_device_assignments_physical_device_id_fkey" FOREIGN KEY ("physical_device_id") REFERENCES "physical_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
