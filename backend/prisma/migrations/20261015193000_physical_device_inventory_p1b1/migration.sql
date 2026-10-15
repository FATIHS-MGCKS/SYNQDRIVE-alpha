-- Physical Device Inventory P1B.1 — identity verification + vehicle install (additive)

ALTER TYPE "PhysicalDeviceAssignmentKind" ADD VALUE IF NOT EXISTS 'INSTALL';
ALTER TYPE "PhysicalDeviceInventoryAuditEventKind" ADD VALUE IF NOT EXISTS 'IDENTITY_VERIFICATION';
ALTER TYPE "PhysicalDeviceInventoryAuditEventKind" ADD VALUE IF NOT EXISTS 'INSTALL';

-- At most one active vehicle installation per physical device.
CREATE UNIQUE INDEX IF NOT EXISTS "physical_device_assignments_one_active_vehicle_per_device"
  ON "physical_device_assignments" ("physical_device_id")
  WHERE "effective_to" IS NULL AND "vehicle_id" IS NOT NULL;
