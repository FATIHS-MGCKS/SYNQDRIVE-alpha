/**
 * Three-layer status model — keep these strictly separate:
 *   • Prisma / DB truth : AVAILABLE | RENTED | IN_SERVICE | OUT_OF_SERVICE | RESERVED
 *   • UI key (this file): Available | Active Rented | Reserved | Maintenance | (Unavailable)
 *   • UI label          : localised strings (dashboard.* i18n) — labels only,
 *                         NEVER used in filters (no `status === "In Maintenance"`).
 *
 * Decision (must match backend RENTAL_STATUS_MAP in vehicles.service.ts): the
 * rental Fleet/Dashboard collapse BOTH IN_SERVICE and OUT_OF_SERVICE into the
 * single "Maintenance" bucket. The backend read-model therefore only ever emits
 * Available / Active Rented / Reserved / Maintenance for rental surfaces. The
 * legacy "Unavailable" key is kept tolerated below for backward-compat but is
 * not produced by the rental read-model.
 */
export type FleetStatusKey = 'Available' | 'Active Rented' | 'Reserved' | 'Maintenance' | 'Unavailable';

export const FLEET_STATUS_TAB_KEYS = [
  'Available',
  'Reserved',
  'Active Rented',
  'Maintenance',
] as const;

export type FleetStatusTabKey = (typeof FLEET_STATUS_TAB_KEYS)[number];

/**
 * Prisma enum → rental fleet status key. Mirrors the backend RENTAL_STATUS_MAP:
 * OUT_OF_SERVICE is intentionally bucketed under "Maintenance" (not a separate
 * "Unavailable" bucket) so Fleet/Dashboard counts stay consistent with the API.
 */
export const PRISMA_TO_FLEET_STATUS_KEY: Record<string, FleetStatusKey> = {
  AVAILABLE: 'Available',
  RENTED: 'Active Rented',
  RESERVED: 'Reserved',
  IN_SERVICE: 'Maintenance',
  OUT_OF_SERVICE: 'Maintenance',
};

/** Fleet status key → i18n label key suffix (dashboard.*). */
export const FLEET_STATUS_LABEL_KEY: Record<FleetStatusTabKey, string> = {
  Available: 'availableTab',
  Reserved: 'reservedTab',
  'Active Rented': 'activeRentedTab',
  Maintenance: 'maintenanceTab',
};

/**
 * Match a vehicle's fleet read-model status to a dashboard tab key.
 * The Maintenance tab also absorbs any legacy "Unavailable" value so older
 * rows / clients never silently fall out of the count.
 */
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
