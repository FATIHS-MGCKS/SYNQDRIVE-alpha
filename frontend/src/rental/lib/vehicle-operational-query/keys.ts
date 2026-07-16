/**
 * TanStack Query–compatible key factory for vehicle operational state surfaces.
 * Used by the invalidation registry even though the rental app does not mount
 * a global QueryClient — keys stay stable for targeted bust + future migration.
 */
export const vehicleOperationalQueryKeys = {
  all: ['vehicle-operational'] as const,

  org: (orgId: string) => [...vehicleOperationalQueryKeys.all, orgId] as const,

  fleetMap: (orgId: string) =>
    [...vehicleOperationalQueryKeys.org(orgId), 'fleet-map'] as const,

  fleetHealth: (orgId: string) =>
    [...vehicleOperationalQueryKeys.org(orgId), 'fleet-health'] as const,

  vehicleDetail: (orgId: string, vehicleId: string) =>
    [...vehicleOperationalQueryKeys.org(orgId), 'vehicle', vehicleId] as const,

  dashboardTodayBookings: (orgId: string) =>
    [...vehicleOperationalQueryKeys.org(orgId), 'dashboard-today-bookings'] as const,

  dashboardRuntime: (orgId: string) =>
    [...vehicleOperationalQueryKeys.org(orgId), 'dashboard-runtime'] as const,

  operatorToday: (orgId: string) =>
    [...vehicleOperationalQueryKeys.org(orgId), 'operator-today'] as const,

  operatorTasks: (orgId: string) =>
    [...vehicleOperationalQueryKeys.org(orgId), 'operator-tasks'] as const,
} as const;

export type VehicleOperationalQueryKey =
  | ReturnType<typeof vehicleOperationalQueryKeys.org>
  | ReturnType<typeof vehicleOperationalQueryKeys.fleetMap>
  | ReturnType<typeof vehicleOperationalQueryKeys.fleetHealth>
  | ReturnType<typeof vehicleOperationalQueryKeys.vehicleDetail>
  | ReturnType<typeof vehicleOperationalQueryKeys.dashboardTodayBookings>
  | ReturnType<typeof vehicleOperationalQueryKeys.dashboardRuntime>
  | ReturnType<typeof vehicleOperationalQueryKeys.operatorToday>
  | ReturnType<typeof vehicleOperationalQueryKeys.operatorTasks>;

/** Structural match for registry fan-out (prefix + optional vehicle id). */
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

export function isVehicleDetailKey(
  key: readonly unknown[],
): key is ReturnType<typeof vehicleOperationalQueryKeys.vehicleDetail> {
  return (
    key.length >= 4 &&
    key[0] === 'vehicle-operational' &&
    key[2] === 'vehicle' &&
    typeof key[3] === 'string'
  );
}
