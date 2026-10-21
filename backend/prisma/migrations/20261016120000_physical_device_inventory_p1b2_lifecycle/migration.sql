-- Physical Device Inventory P1B.2 — uninstall & lifecycle audit events (additive)

ALTER TYPE "PhysicalDeviceInventoryAuditEventKind" ADD VALUE IF NOT EXISTS 'UNINSTALL';
ALTER TYPE "PhysicalDeviceInventoryAuditEventKind" ADD VALUE IF NOT EXISTS 'RETURN_TO_STOCK';
ALTER TYPE "PhysicalDeviceInventoryAuditEventKind" ADD VALUE IF NOT EXISTS 'MARK_DEFECTIVE';
ALTER TYPE "PhysicalDeviceInventoryAuditEventKind" ADD VALUE IF NOT EXISTS 'MARK_LOST';
ALTER TYPE "PhysicalDeviceInventoryAuditEventKind" ADD VALUE IF NOT EXISTS 'RETIRE';
