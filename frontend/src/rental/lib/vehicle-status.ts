/**
 * Canonical fleet status keys used for dashboard tabs and filters.
 * Prisma VehicleStatus is mapped to these keys in the backend fleet read-model.
 */
export type FleetStatusKey = 'Available' | 'Active Rented' | 'Reserved' | 'Maintenance' | 'Unavailable';

export const FLEET_STATUS_TAB_KEYS = [
  'Available',
  'Reserved',
  'Active Rented',
  'Maintenance',
] as const;

export type FleetStatusTabKey = (typeof FLEET_STATUS_TAB_KEYS)[number];

/** Prisma enum → fleet status key (rental UI). */
export const PRISMA_TO_FLEET_STATUS_KEY: Record<string, FleetStatusKey> = {
  AVAILABLE: 'Available',
  RENTED: 'Active Rented',
  RESERVED: 'Reserved',
  IN_SERVICE: 'Maintenance',
  OUT_OF_SERVICE: 'Unavailable',
};

/** Fleet status key → i18n label key suffix (dashboard.*). */
export const FLEET_STATUS_LABEL_KEY: Record<FleetStatusTabKey, string> = {
  Available: 'availableTab',
  Reserved: 'reservedTab',
  'Active Rented': 'activeRentedTab',
  Maintenance: 'maintenanceTab',
};

/** Match a vehicle's fleet read-model status to a dashboard tab key. */
export function fleetStatusMatchesTab(
  vehicleStatus: string | null | undefined,
  tab: FleetStatusTabKey,
): boolean {
  if (!vehicleStatus) return false;
  if (tab === 'Maintenance') {
    return vehicleStatus === 'Maintenance' || vehicleStatus === 'Unavailable';
  }
  return vehicleStatus === tab;
}

/** Count vehicles for a fleet status tab. */
export function countFleetStatusTab(
  vehicles: Array<{ status?: string | null }>,
  tab: FleetStatusTabKey,
): number {
  return vehicles.filter((v) => fleetStatusMatchesTab(v.status, tab)).length;
}
