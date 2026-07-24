/**
 * Demand-driven polling policy for the Vehicle Detail Page.
 *
 * Frequencies (before → after this prompt):
 *  - GPS live: 5s whenever VDP open → 5s only on Overview + visible map + visible tab
 *  - Telemetry dashboard: 30s on all VDP tabs → 30s Overview / 90s other VDP tabs / paused when hidden
 *  - Device connection: one-shot on mount → 60s refresh on Overview when visible (else one-shot)
 *  - Battery live (overview health box): 30s whenever mounted → 30s only when Overview map visible
 */

export const VEHICLE_DETAIL_POLLING = {
  GPS_MS: 5_000,
  DASHBOARD_OVERVIEW_MS: 30_000,
  /** Slower cadence for header badge on non-Overview vehicle-detail tabs. */
  DASHBOARD_OTHER_TAB_MS: 90_000,
  DEVICE_CONNECTION_MS: 60_000,
} as const;

export type TelemetryAccessBlockReason = 'permission' | 'data_authorization';

export interface VehicleDetailPollingGateInput {
  vehicleId: string | null;
  orgId: string | null;
  /** Vehicle detail shell is open with a bound vehicle. */
  isVehicleDetailOpen: boolean;
  isOverviewTab: boolean;
  /** Overview live map intersects the viewport (rendered + visible). */
  isOverviewMapVisible: boolean;
  /** `document.visibilityState === 'visible'`. */
  isDocumentVisible: boolean;
  /** `navigator.onLine` and no offline event. */
  isOnline: boolean;
  canReadFleet: boolean;
  accessBlockReason: TelemetryAccessBlockReason | null;
}

export interface VehicleDetailPollingGates {
  gpsHighFrequency: boolean;
  dashboardTelemetry: boolean;
  deviceConnection: boolean;
  batteryLive: boolean;
  dashboardIntervalMs: number;
}

export function resolveVehicleDetailPollingGates(
  input: VehicleDetailPollingGateInput,
): VehicleDetailPollingGates {
  const hasBinding = Boolean(input.vehicleId && input.orgId);
  const baseActive =
    hasBinding &&
    input.isVehicleDetailOpen &&
    input.isDocumentVisible &&
    input.isOnline &&
    input.canReadFleet &&
    input.accessBlockReason == null;

  const overviewSurfaceActive =
    baseActive && input.isOverviewTab && input.isOverviewMapVisible;

  return {
    gpsHighFrequency: overviewSurfaceActive,
    dashboardTelemetry: baseActive,
    deviceConnection: overviewSurfaceActive,
    batteryLive: overviewSurfaceActive,
    dashboardIntervalMs: input.isOverviewTab
      ? VEHICLE_DETAIL_POLLING.DASHBOARD_OVERVIEW_MS
      : VEHICLE_DETAIL_POLLING.DASHBOARD_OTHER_TAB_MS,
  };
}
