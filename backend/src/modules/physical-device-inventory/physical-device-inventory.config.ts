/**
 * P1B.1 rollout gate — write workflows disabled unless explicitly enabled in environment.
 */
export function isPhysicalDeviceInventoryP1b1WritesEnabled(): boolean {
  const raw = process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}
