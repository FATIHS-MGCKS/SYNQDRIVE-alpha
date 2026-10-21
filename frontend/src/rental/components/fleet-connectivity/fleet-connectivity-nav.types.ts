/**
 * Fleet → Connectivity deep-link navigation contract (P0.1).
 *
 * Vehicle Detail Connectivity summary must deep-link into Fleet Hub connectivity
 * with the same vehicle pre-selected and detail drawer open.
 *
 * Pattern mirrors Fleet Health Service URL state (`fleet-health-service.types.ts`).
 */

export const FLEET_CONNECTIVITY_URL_TAB = 'fleetTab';
export const FLEET_CONNECTIVITY_URL_VEHICLE = 'connectivityVehicleId';

export interface FleetConnectivityNavState {
  vehicleId?: string;
}

export function fleetConnectivityNavToSearchParams(
  nav: FleetConnectivityNavState,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set(FLEET_CONNECTIVITY_URL_TAB, 'connectivity');
  if (nav.vehicleId) {
    params.set(FLEET_CONNECTIVITY_URL_VEHICLE, nav.vehicleId);
  } else {
    params.delete(FLEET_CONNECTIVITY_URL_VEHICLE);
  }
  return params;
}

export function parseFleetConnectivityNavFromSearch(
  search: string,
): FleetConnectivityNavState | null {
  const params = new URLSearchParams(search);
  const tab = params.get(FLEET_CONNECTIVITY_URL_TAB);
  if (tab !== 'connectivity') return null;
  const vehicleId = params.get(FLEET_CONNECTIVITY_URL_VEHICLE);
  return { vehicleId: vehicleId ?? undefined };
}

/**
 * Target URL shape (P0.5 implementation):
 * `/rental?view=fleet&fleetTab=connectivity&connectivityVehicleId=<vehicleId>`
 *
 * Requirements:
 * - deep-linkable and browser-back safe (pushState on navigation)
 * - refresh restores Fleet connectivity tab + vehicle drawer when vehicle still exists in org
 * - invalid/missing vehicleId falls back to connectivity list without cross-org leakage
 * - Vehicle Detail Connectivity box uses this contract for "Connectivity Details →" CTA (P0.5)
 */
