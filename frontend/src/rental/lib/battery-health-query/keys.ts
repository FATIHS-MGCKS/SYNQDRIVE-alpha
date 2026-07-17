/**
 * Central query keys for canonical battery health read models.
 * TanStack-compatible shape for cache + invalidation bus.
 */
export const batteryHealthQueryKeys = {
  root: ['battery-health'] as const,

  org: (orgId: string) => [...batteryHealthQueryKeys.root, orgId] as const,

  vehicle: (orgId: string, vehicleId: string) =>
    [...batteryHealthQueryKeys.org(orgId), vehicleId] as const,

  summary: (orgId: string, vehicleId: string) =>
    [...batteryHealthQueryKeys.vehicle(orgId, vehicleId), 'summary'] as const,

  detail: (orgId: string, vehicleId: string) =>
    [...batteryHealthQueryKeys.vehicle(orgId, vehicleId), 'detail'] as const,
} as const;

export type BatteryHealthQueryKey =
  | ReturnType<typeof batteryHealthQueryKeys.summary>
  | ReturnType<typeof batteryHealthQueryKeys.detail>;

export function serializeBatteryHealthQueryKey(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

export function queryKeyMatches(
  registered: readonly unknown[],
  target: readonly unknown[],
): boolean {
  if (target.length < registered.length) return false;
  for (let i = 0; i < registered.length; i += 1) {
    if (registered[i] !== target[i]) return false;
  }
  return true;
}

export function isBatteryHealthVehicleKey(
  key: readonly unknown[],
): key is ReturnType<typeof batteryHealthQueryKeys.vehicle> {
  return (
    key.length >= 3 &&
    key[0] === 'battery-health' &&
    typeof key[1] === 'string' &&
    typeof key[2] === 'string'
  );
}
