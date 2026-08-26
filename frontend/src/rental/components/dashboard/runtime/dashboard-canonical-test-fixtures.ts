/**
 * Shared canonical operational fixtures for Dashboard P1.5+ tests.
 */
import type { VehicleConnectivityRuntimeState } from '../../../../lib/api';
import type { VehicleData } from '../../../data/vehicles';
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
