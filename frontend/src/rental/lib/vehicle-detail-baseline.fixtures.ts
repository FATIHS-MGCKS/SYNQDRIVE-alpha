/**
 * Reproducible baseline scenario catalog for Vehicle Detail Page audits.
 * Used by unit tests and referenced by E2E fixtures — no product logic changes.
 */
import type { FleetMapVehicleResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import { mapFleetMapVehicleResponse } from './fleet-map-vehicle-mapper';
import { deriveOverviewMapPosition } from './overview-map-position';
import {
  resolveTelemetryFreshness,
  type TelemetryFreshness,
  type TelemetryFreshnessInput,
} from './telemetryFreshness';
import { resolveFleetVehicleDisplayState } from './fleetVehicleDisplay';
import {
  VEHICLE_DETAIL_TAB_KEYS,
  type VehicleOverviewNavigateTarget,
} from './vehicle-overview-navigation';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';

export const VEHICLE_DETAIL_BASELINE_ORG_ID = 'org-vd-baseline';

export const VEHICLE_DETAIL_BASELINE_VEHICLE_IDS = {
  primary: 'veh-vd-baseline-1',
  secondary: 'veh-vd-baseline-2',
} as const;

export type VehicleDetailBaselineScenarioId =
  | 'open-detail'
  | 'vehicle-switch'
  | 'tab-switch'
  | 'status-display'
  | 'telemetry-null-values'
  | 'telemetry-missing-values'
  | 'live-position'
  | 'last-known-position'
  | 'standby'
  | 'soft-offline'
  | 'offline'
  | 'read-only-role'
  | 'mobile-viewport';

export interface VehicleDetailBaselineScenario {
  id: VehicleDetailBaselineScenarioId;
  label: string;
  layer: 'unit' | 'e2e' | 'both';
  notes?: string;
}

/** Audit matrix — documents intended baseline coverage per scenario. */
export const VEHICLE_DETAIL_BASELINE_SCENARIOS: VehicleDetailBaselineScenario[] = [
  { id: 'open-detail', label: 'Vehicle Detail öffnen', layer: 'e2e' },
  { id: 'vehicle-switch', label: 'Fahrzeugwechsel', layer: 'e2e' },
  { id: 'tab-switch', label: 'Tabwechsel (8 Tabs)', layer: 'both' },
  { id: 'status-display', label: 'Statusanzeige (operational + telemetry)', layer: 'both' },
  {
    id: 'telemetry-null-values',
    label: 'Telemetrie mit echten Nullwerten',
    layer: 'unit',
    notes: 'API null → mapper coerces odometer/speed to 0 (known C-03 conflict)',
  },
  {
    id: 'telemetry-missing-values',
    label: 'Telemetrie mit fehlenden Werten',
    layer: 'both',
  },
  { id: 'live-position', label: 'Live-Position', layer: 'unit' },
  { id: 'last-known-position', label: 'Alte letzte bekannte Position', layer: 'unit' },
  { id: 'standby', label: 'Standby (15min–24h)', layer: 'both' },
  { id: 'soft-offline', label: 'Soft-Offline / signal_delayed (24–48h)', layer: 'both' },
  { id: 'offline', label: 'Offline (≥48h)', layer: 'both' },
  {
    id: 'read-only-role',
    label: 'Read-only-Rolle',
    layer: 'e2e',
    notes: 'fleet/vehicles write=false — detail shell renders, no write assertions yet',
  },
  { id: 'mobile-viewport', label: 'Mobile Viewports', layer: 'e2e' },
];

export const VEHICLE_DETAIL_TAB_LABELS: Record<(typeof VEHICLE_DETAIL_TAB_KEYS)[number], string> = {
  overview: 'Overview',
  trips: 'Trips',
  'health-errors': 'Health',
  damages: 'Damages',
  documents: 'Documents',
  'vehicle-bookings': 'Bookings',
  'vehicle-tasks': 'Task List',
  'vehicle-requirements': 'Requirements',
};

const minutesAgoIso = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoursAgoIso = (h: number) => new Date(Date.now() - h * 60 * 60_000).toISOString();

export interface BaselineTelemetrySeed {
  freshness: TelemetryFreshness;
  input: TelemetryFreshnessInput;
  onlineStatus?: string;
}

export const BASELINE_TELEMETRY_SEEDS: Record<
  Extract<
    VehicleDetailBaselineScenarioId,
    'standby' | 'soft-offline' | 'offline' | 'telemetry-missing-values' | 'live-position'
  >,
  BaselineTelemetrySeed
> = {
  'live-position': {
    freshness: 'live',
    input: { lastSignal: minutesAgoIso(5) },
    onlineStatus: 'ONLINE',
  },
  standby: {
    freshness: 'standby',
    input: { lastSignal: hoursAgoIso(3) },
    onlineStatus: 'STANDBY',
  },
  'soft-offline': {
    freshness: 'signal_delayed',
    input: { lastSignal: hoursAgoIso(30) },
    onlineStatus: 'STANDBY',
  },
  offline: {
    freshness: 'offline',
    input: { lastSignal: hoursAgoIso(50) },
    onlineStatus: 'OFFLINE',
  },
  'telemetry-missing-values': {
    freshness: 'no_signal',
    input: { lastSignal: '', signalAgeMs: undefined, onlineStatus: 'OFFLINE' },
    onlineStatus: 'OFFLINE',
  },
};

export function buildBaselineVehicleData(
  overrides: Partial<VehicleData> & { id?: string } = {},
): VehicleData {
  return {
    id: overrides.id ?? VEHICLE_DETAIL_BASELINE_VEHICLE_IDS.primary,
    license: overrides.license ?? 'VD-BASE-1',
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Kassel',
    stationId: overrides.stationId ?? 'st-baseline',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? minutesAgoIso(5),
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 12_000,
    fuel: overrides.fuel ?? 72,
    battery: overrides.battery ?? 100,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    lat: overrides.lat ?? 51.312,
    lng: overrides.lng ?? 9.479,
    leasingRate: '',
    insuranceCost: '',
    taxCost: '',
    totalMonthlyCost: '',
    ...overrides,
  };
}

export function buildBaselineFleetMapRow(
  overrides: Partial<FleetMapVehicleResponse> = {},
): FleetMapVehicleResponse {
  return {
    id: overrides.id ?? VEHICLE_DETAIL_BASELINE_VEHICLE_IDS.primary,
    licensePlate: overrides.licensePlate ?? 'VD-BASE-1',
    displayName: overrides.displayName ?? 'VW Golf VD-BASE-1',
    make: 'VW',
    model: 'Golf',
    year: 2024,
    status: 'Available',
    fuelType: 'Petrol',
    healthStatus: 'Good Health',
    cleaningStatus: 'Clean',
    stationId: 'st-baseline',
    stationName: 'Kassel',
    homeStationId: 'st-baseline',
    currentStationId: 'st-baseline',
    expectedStationId: null,
    latitude: 51.312,
    longitude: 9.479,
    lastSeenAt: minutesAgoIso(5),
    signalAgeMs: 5_000,
    isFresh: true,
    onlineStatus: 'ONLINE',
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    heading: null,
    imageUrl: null,
    odometerKm: 12_000,
    fuelPercent: 72,
    evSoc: null,
    isElectric: false,
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedReturnAt: null,
    reservedPickupStationName: null,
    reservedIsOverdue: false,
    activeBookingId: null,
    activeCustomerName: null,
    activeStartAt: null,
    activeReturnAt: null,
    activeReturnStationName: null,
    activeKmIncluded: null,
    activeKmDriven: null,
    activeIsOverdue: false,
    maintenanceReason: null,
    maintenanceReasonCode: null,
    maintenanceUrgency: null,
    ...overrides,
  };
}

export function resolveBaselineTelemetry(seed: BaselineTelemetrySeed) {
  return resolveTelemetryFreshness(seed.input);
}

export function resolveBaselineFleetDisplay(
  vehicle: VehicleData,
  options?: { locale?: string },
) {
  return resolveFleetVehicleDisplayState(vehicle, { locale: options?.locale ?? 'de' });
}

export function resolveBaselineMapPosition(
  mode: 'live' | 'last-known' | 'static' | 'empty',
  vehicleId = VEHICLE_DETAIL_BASELINE_VEHICLE_IDS.primary,
) {
  const orgId = VEHICLE_DETAIL_BASELINE_ORG_ID;
  const coords: [number, number] = [9.479, 51.312];

  switch (mode) {
    case 'live':
      return deriveOverviewMapPosition({
        boundVehicleId: vehicleId,
        boundOrgId: orgId,
        vehicleId,
        orgId,
        targetPosition: coords,
        lastConfirmedPosition: coords,
        staticLat: null,
        staticLng: null,
        loading: false,
        error: null,
        isLiveTracking: true,
        isFresh: true,
        gpsSource: 'dimo',
      });
    case 'last-known':
      return deriveOverviewMapPosition({
        boundVehicleId: vehicleId,
        boundOrgId: orgId,
        vehicleId,
        orgId,
        targetPosition: coords,
        lastConfirmedPosition: coords,
        staticLat: null,
        staticLng: null,
        loading: false,
        error: 'Network error',
        isLiveTracking: true,
        isFresh: false,
        gpsSource: 'cache',
      });
    case 'static':
      return deriveOverviewMapPosition({
        boundVehicleId: null,
        boundOrgId: null,
        vehicleId,
        orgId,
        targetPosition: null,
        lastConfirmedPosition: null,
        staticLat: 51.31,
        staticLng: 9.48,
        loading: true,
        error: null,
        isLiveTracking: false,
        isFresh: false,
        gpsSource: null,
      });
    case 'empty':
    default:
      return deriveOverviewMapPosition({
        boundVehicleId: vehicleId,
        boundOrgId: orgId,
        vehicleId,
        orgId,
        targetPosition: null,
        lastConfirmedPosition: null,
        staticLat: null,
        staticLng: null,
        loading: false,
        error: null,
        isLiveTracking: false,
        isFresh: false,
        gpsSource: null,
      });
  }
}

export function mapBaselineFleetRowWithNullTelemetry() {
  return mapFleetMapVehicleResponse(
    buildBaselineFleetMapRow({
      odometerKm: null as unknown as number,
      fuelPercent: null as unknown as number,
      evSoc: null,
    }),
  );
}

export function allVehicleDetailTabTargets(): VehicleOverviewNavigateTarget[] {
  return VEHICLE_DETAIL_TAB_KEYS.map((tab) => ({ tab }) as VehicleOverviewNavigateTarget);
}

export const BASELINE_READ_ONLY_PERMISSIONS = {
  fleet: { read: true, write: false, manage: false },
  bookings: { read: true, write: false, manage: false },
  vehicles: { read: true, write: false, manage: false },
  tasks: { read: true, write: false, manage: false },
} as const;
