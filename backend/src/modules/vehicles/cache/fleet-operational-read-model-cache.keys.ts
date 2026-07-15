export const FLEET_MAP_CACHE_VERSION = 'v1';
export const VEHICLE_OPERATIONAL_CACHE_VERSION = 'v1';

/** Short-lived fleet-map cache — TTL remains a safety net after explicit invalidation. */
export const FLEET_MAP_CACHE_TTL_SECONDS = 5;

export function fleetMapCacheKey(organizationId: string): string {
  return `fleet-map:${organizationId}:${FLEET_MAP_CACHE_VERSION}`;
}

/** Per-vehicle operational read model (fleet-map row + booking context projection). */
export function vehicleOperationalCacheKey(
  organizationId: string,
  vehicleId: string,
): string {
  return `vehicle-operational:${organizationId}:${vehicleId}:${VEHICLE_OPERATIONAL_CACHE_VERSION}`;
}

export function uniqueNonEmptyVehicleIds(
  vehicleIds: Iterable<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  for (const id of vehicleIds) {
    if (typeof id === 'string' && id.length > 0) {
      seen.add(id);
    }
  }
  return [...seen];
}

export function fleetOperationalCacheKeysForVehicles(
  organizationId: string,
  vehicleIds: Iterable<string | null | undefined>,
): string[] {
  const keys = [fleetMapCacheKey(organizationId)];
  for (const vehicleId of uniqueNonEmptyVehicleIds(vehicleIds)) {
    keys.push(vehicleOperationalCacheKey(organizationId, vehicleId));
  }
  return keys;
}
