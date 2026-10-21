/**
 * P1B.1 rollout gate — write workflows disabled unless explicitly enabled in environment.
 */
export function isPhysicalDeviceInventoryP1b1WritesEnabled(): boolean {
  const raw = process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/**
 * P1B.2 rollout gate — uninstall / lifecycle writes disabled unless explicitly enabled.
 */
export function isPhysicalDeviceInventoryP1b2WritesEnabled(): boolean {
  const raw = process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/**
 * Pilot-safe uninstall: INSTALLED → PENDING_RETURN only (no direct AVAILABLE on uninstall).
 * Used for controlled production pilots and enforced by the P1B.2 uninstall operator CLI.
 */
export function isPhysicalDeviceInventoryP1b2PilotSafeUninstallEnabled(): boolean {
  const raw = process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}
