import type { DashboardWarningLightsResponse, VehicleHealthResponse } from '../../lib/api';

/**
 * Stage 3B — extract canonical dashboard warning lights from the rental-health
 * batch payload (server already fetched them during evaluation).
 */
export function resolveDashboardWarningLightsFromRentalHealth(
  health: VehicleHealthResponse | null | undefined,
): DashboardWarningLightsResponse | null {
  return health?.dashboard_warning_lights ?? null;
}

/**
 * Compose getDashboardWarningLights for buildFleetVehicleContexts without N+1:
 * explicit accessor wins; otherwise reuse embedded rental-health passthrough.
 */
export function composeFleetDashboardWarningLightsAccessor(
  getHealth: (vehicleId: string) => VehicleHealthResponse | null | undefined,
  getDashboardWarningLights?: (
    vehicleId: string,
  ) => DashboardWarningLightsResponse | null | undefined,
): (vehicleId: string) => DashboardWarningLightsResponse | null | undefined {
  if (getDashboardWarningLights) {
    return (vehicleId) =>
      getDashboardWarningLights(vehicleId) ??
      resolveDashboardWarningLightsFromRentalHealth(getHealth(vehicleId));
  }

  return (vehicleId) => resolveDashboardWarningLightsFromRentalHealth(getHealth(vehicleId));
}
