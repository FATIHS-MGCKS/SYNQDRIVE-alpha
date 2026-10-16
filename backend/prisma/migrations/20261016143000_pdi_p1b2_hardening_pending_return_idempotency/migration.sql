-- PDI P1B.2 hardening: PENDING_RETURN stock semantics + lifecycle audit idempotency uniqueness.

ALTER TYPE "PhysicalDeviceInventoryStatus" ADD VALUE IF NOT EXISTS 'PENDING_RETURN';

CREATE UNIQUE INDEX IF NOT EXISTS "physical_device_inventory_audit_lifecycle_idempotency_key_uq"
  ON "physical_device_inventory_audit_events" ("physical_device_id", "event_kind", "idempotency_key")
  WHERE "event_kind" IN (
    'UNINSTALL',
    'RETURN_TO_STOCK',
    'MARK_DEFECTIVE',
    'MARK_LOST',
    'RETIRE'
  )
  AND "idempotency_key" IS NOT NULL;
