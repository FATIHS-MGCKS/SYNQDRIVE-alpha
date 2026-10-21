/**
 * Shared canonical operational fixtures for Dashboard P1.5+ tests.
 */
import type { VehicleConnectivityRuntimeState } from '../../../../lib/api';
import type { VehicleData } from '../../../data/vehicles';
import type { FleetHealthEvaluation } from '../../../lib/fleet-health-evaluation/types';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleOperationalStatus,
} from '../../../lib/vehicle-operational-state';

const NOW_ISO = '2026-08-26T12:00:00.000Z';

export function canonicalAvailability(
  state: 'AVAILABLE' | 'NEEDS_VERIFICATION' | 'UNAVAILABLE' | 'UNKNOWN',
  overrides: Record<string, unknown> = {},
) {
  return {
    state,
    generatedAt: NOW_ISO,
    ...overrides,
  };
}

export function canonicalHealthEvaluability(
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN' = 'EVALUABLE',
  overrides: Partial<FleetHealthEvaluation> = {},
): FleetHealthEvaluation {
  return {
    condition: 'good',
    evaluability,
    pipelineAvailability: 'ready',
    generatedAt: NOW_ISO,
    healthEvidenceAt: NOW_ISO,
    anyModuleDataStale: false,
    source: 'p0.2_projection',
    ...overrides,
  };
}

/**
 * Map legacy/string dashboard test status values to canonical P0.1 status.
 */
export function normalizeDashboardTestVehicleStatus(
  status: unknown,
): VehicleOperationalStatus {
  const raw = typeof status === 'string' ? status : undefined;
  if (raw === 'Available' || raw === 'available') {
    return VEHICLE_OPERATIONAL_STATUS.AVAILABLE;
  }
  if (raw === 'Active Rented' || raw === 'active_rented') {
    return VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED;
  }
  if (raw === 'Maintenance' || raw === 'maintenance') {
    return VEHICLE_OPERATIONAL_STATUS.MAINTENANCE;
  }
  if (raw === 'Reserved' || raw === 'reserved') {
    return VEHICLE_OPERATIONAL_STATUS.RESERVED;
  }
  if (raw === 'Blocked' || raw === 'blocked') {
    return VEHICLE_OPERATIONAL_STATUS.BLOCKED;
  }
  if (
    status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE ||
    status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED ||
    status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE ||
    status === VEHICLE_OPERATIONAL_STATUS.RESERVED ||
    status === VEHICLE_OPERATIONAL_STATUS.BLOCKED ||
    status === VEHICLE_OPERATIONAL_STATUS.UNKNOWN
  ) {
    return status as VehicleOperationalStatus;
  }
  return VEHICLE_OPERATIONAL_STATUS.AVAILABLE;
}

export type DashboardTestVehicleOptions = Partial<VehicleData> & {
  /** When true, attach explicit P0.4 EVALUABLE/good healthEvaluation (opt-in). */
  withCanonicalHealth?: boolean;
};

/**
 * Dashboard/Fleet runtime test vehicle with P0.2 operationalAvailability + connectivity by default.
 * Legacy onlineStatus/lastSignal may still be set for informational display tests.
 */
export function dashboardTestVehicle(options: DashboardTestVehicleOptions = {}): VehicleData {
  const { withCanonicalHealth, ...overrides } = options;
  const status = normalizeDashboardTestVehicleStatus(overrides.status);
  const id = overrides.id ?? 'v1';

  return canonicalOperationalVehicle(status, {
    isFresh: overrides.isFresh ?? false,
    onlineStatus: overrides.onlineStatus ?? 'STANDBY',
    leasingRate: overrides.leasingRate ?? '',
    insuranceCost: overrides.insuranceCost ?? '',
    taxCost: overrides.taxCost ?? '',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '',
    connectivityRuntime: canonicalConnectivityRuntime({ vehicleId: id }),
    ...(withCanonicalHealth
      ? { healthEvaluation: canonicalHealthEvaluability('EVALUABLE') }
      : {}),
    ...overrides,
    status,
  });
}

export function canonicalConnectivityRuntime(
  overrides: Partial<VehicleConnectivityRuntimeState> = {},
): VehicleConnectivityRuntimeState {
  return {
    vehicleId: overrides.vehicleId ?? 'v1',
    organizationId: overrides.organizationId ?? 'org-1',
    overallState: overrides.overallState ?? 'TELEMETRY_ACTIVE',
    providerLinkState: overrides.providerLinkState ?? 'ACTIVE',
    telemetryState: overrides.telemetryState ?? 'live',
    physicalDeviceState: overrides.physicalDeviceState ?? 'PLUGGED_CONFIRMED',
    dataCoverageState: overrides.dataCoverageState ?? 'GOOD',
    attentionState: overrides.attentionState ?? 'NONE',
    reasonCodes: overrides.reasonCodes ?? [],
    recommendedAction: overrides.recommendedAction ?? 'NONE',
    requiresAction: overrides.requiresAction ?? false,
    lastTelemetryAt: overrides.lastTelemetryAt ?? null,
    lastProviderObservedAt: overrides.lastProviderObservedAt ?? null,
    lastReceivedAt: overrides.lastReceivedAt ?? null,
    deviceBindingId: overrides.deviceBindingId ?? null,
    activeEpisodeId: overrides.activeEpisodeId ?? null,
    evidence: overrides.evidence ?? {},
    calculatedAt: overrides.calculatedAt ?? NOW_ISO,
    stateVersion: overrides.stateVersion ?? 1,
  };
}

export function canonicalOperationalVehicle(
  status: VehicleOperationalStatus = VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
  extra: Partial<VehicleData> = {},
): VehicleData {
  return {
    id: extra.id ?? 'v1',
    license: extra.license ?? 'M-AB 123',
    make: extra.make ?? 'VW',
    model: extra.model ?? 'Golf',
    year: extra.year ?? 2024,
    station: extra.station ?? 'Berlin',
    stationId: extra.stationId ?? 'st-1',
    fuelType: extra.fuelType ?? 'Petrol',
    status,
    cleaningStatus: extra.cleaningStatus ?? 'Clean',
    healthStatus: extra.healthStatus ?? 'Good Health',
    online: extra.online ?? true,
    lastSignal: extra.lastSignal ?? NOW_ISO,
    badge: extra.badge ?? 0,
    odometer: extra.odometer ?? 10000,
    fuel: extra.fuel ?? 72,
    battery: extra.battery ?? 100,
    speed: extra.speed ?? 0,
    coolant: extra.coolant ?? 90,
    brakes: extra.brakes ?? 90,
    tires: extra.tires ?? 90,
    engineOil: extra.engineOil ?? 90,
    isElectric: extra.isElectric ?? false,
    hvBatteryCapacityKwh: extra.hvBatteryCapacityKwh ?? null,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    operationalState: {
      status,
      reason: null,
      source: 'fleet-read-model',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: NOW_ISO,
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
      dataQualityReasons: [],
      isReliable: true,
      ...extra.operationalState,
    },
    operationalAvailability:
      extra.operationalAvailability !== undefined
        ? extra.operationalAvailability
        : canonicalAvailability('AVAILABLE'),
    connectivityRuntime:
      extra.connectivityRuntime !== undefined
        ? extra.connectivityRuntime
        : canonicalConnectivityRuntime({ vehicleId: extra.id ?? 'v1' }),
    ...extra,
  };
}
