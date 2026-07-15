import { create } from 'zustand';
import type { Feature, Point } from 'geojson';
import { api, type FleetMapVehicleResponse } from '../../lib/api';
import {
  persistDashboardStationId,
  stationFilterToDashboardId,
  vehicleMatchesStationFilter,
} from '../lib/fleet-station-filter';
import {
  buildFleetMapGeoJson,
  type FleetMapFeatureVisualProperties,
  type FleetMapVisualGeoJson,
} from '../lib/fleetVisualState';
import {
  normalizeFleetOperationalStatus,
  type FleetStatusKey,
} from '../lib/vehicle-status';
import type {
  VehicleData,
  VehicleDisplayIgnition,
  VehicleDisplayState,
  VehicleOnlineStatus,
  FleetMaintenanceReasonCode,
} from '../data/vehicles';

export const FLEET_MAP_REFRESH_MS = 30_000;
export const ALL_STATIONS_FILTER = 'all';

export interface FleetStationOption {
  id: string;
  label: string;
}

export interface FleetMapVehicle extends VehicleData {
  stationId: string | null;
  stationName: string | null;
  heading: number | null;
  lastSeenAt: string | null;
}

export type FleetMapFeatureProperties = FleetMapFeatureVisualProperties;
export type FleetMapFeature = Feature<Point, FleetMapFeatureProperties>;
export type FleetMapGeoJson = FleetMapVisualGeoJson;

export const NO_STATION_FILTER = 'no-station';
export const NO_LOCATION_FILTER = 'no-location';

export interface FleetMapFilters {
  stationId: string;
}

interface FleetMapState {
  vehicles: FleetMapVehicle[];
  filters: FleetMapFilters;
  selectedVehicleId: string | null;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  refreshIntervalMs: number;
  fetchFleetMap: (orgId: string) => Promise<void>;
  setStationFilter: (stationId: string) => void;
  setSelectedVehicleId: (vehicleId: string | null) => void;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  return Number.isFinite(value) ? value : undefined;
}

function normalizeFuelType(raw: string | null | undefined): VehicleData['fuelType'] {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('diesel')) return 'Diesel';
  if (value.includes('electric')) return 'Electric';
  if (value.includes('plugin') || value.includes('plug-in') || value.includes('phev')) {
    return 'PHEV';
  }
  if (value.includes('hybrid')) return 'Hybrid';
  return 'Petrol';
}

function normalizeHealthStatus(
  raw: string | null | undefined,
): VehicleData['healthStatus'] {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('critical')) return 'Critical';
  if (value.includes('warning')) return 'Warning';
  return 'Good Health';
}

function normalizeCleaningStatus(
  raw: string | null | undefined,
): VehicleData['cleaningStatus'] {
  const value = (raw ?? '').toLowerCase();
  return value.includes('need') ? 'Needs Cleaning' : 'Clean';
}

function normalizeOnlineStatus(raw: unknown): VehicleOnlineStatus | undefined {
  if (raw === 'ONLINE' || raw === 'STANDBY' || raw === 'OFFLINE') return raw;
  return undefined;
}

function normalizeDisplayState(raw: unknown): VehicleDisplayState | undefined {
  if (raw === 'MOVING' || raw === 'IDLE' || raw === 'PARKED') return raw;
  return undefined;
}

function normalizeDisplayIgnition(raw: unknown): VehicleDisplayIgnition | undefined {
  if (raw === 'ON' || raw === 'OFF' || raw === 'UNKNOWN') return raw;
  return undefined;
}

function normalizeTelemetryFreshness(
  raw: unknown,
): VehicleData['telemetryFreshness'] {
  if (
    raw === 'live' ||
    raw === 'standby' ||
    raw === 'signal_delayed' ||
    raw === 'offline' ||
    raw === 'no_signal'
  ) {
    return raw;
  }
  return undefined;
}

function mapFleetVehicle(raw: FleetMapVehicleResponse): FleetMapVehicle {
  const fuelType = normalizeFuelType(raw.fuelType);
  const normalizedStatus = normalizeFleetOperationalStatus({
    status: raw.status,
    dataQualityState: (raw as { dataQualityState?: string | null }).dataQualityState,
    isReliable: (raw as { isReliable?: boolean | null }).isReliable,
  });
  const status = normalizedStatus.status;
  const healthStatus = normalizeHealthStatus(raw.healthStatus);
  const cleaningStatus = normalizeCleaningStatus(raw.cleaningStatus);
  const isElectric =
    typeof raw.isElectric === 'boolean'
      ? raw.isElectric
      : fuelType === 'Electric' || fuelType === 'PHEV';
  // V4.6.85 — null-preserving telemetry. The UI cells (FuelCell /
  // OdometerCell) read these fields and render "—" when they are null
  // instead of a misleading "0 km" / "0%".
  const fuelPercent = toFiniteNumber(raw.fuelPercent) ?? null;
  const evSocPercent = toFiniteNumber(raw.evSoc) ?? null;
  const odometerKm = toFiniteNumber(raw.odometerKm) ?? null;
  const chargePct = isElectric
    ? evSocPercent ?? fuelPercent
    : fuelPercent ?? evSocPercent;
  const reasonCode = (
    raw.maintenanceReasonCode === 'SCHEDULED_SERVICE' ||
    raw.maintenanceReasonCode === 'OPERATIONAL_BLOCK'
      ? raw.maintenanceReasonCode
      : null
  ) as FleetMaintenanceReasonCode | null;
  const homeStationId = raw.homeStationId ?? raw.stationId ?? null;
  const currentStationId = raw.currentStationId ?? null;

  return {
    id: raw.id,
    license: raw.licensePlate ?? '',
    make: raw.make ?? '',
    model: raw.model || raw.make || raw.licensePlate || 'Unknown vehicle',
    year: raw.year ?? 0,
    station: raw.stationName ?? '',
    homeStationId,
    currentStationId,
    expectedStationId: raw.expectedStationId ?? null,
    fuelType,
    status,
    dataQualityState: normalizedStatus.dataQualityState,
    isReliable: normalizedStatus.isReliable,
    cleaningStatus,
    healthStatus,
    online: raw.isFresh,
    lastSignal: raw.lastSeenAt ?? '',
    badge: 0,
    // Legacy numeric mirrors — kept as-is for consumers that already
    // tolerate 0 for "no data". Production cells read the nullable
    // canonical fields below.
    odometer: odometerKm ?? 0,
    fuel:
      chargePct != null
        ? Math.max(0, Math.min(100, Math.round(chargePct)))
        : 0,
    fuelLevel: fuelPercent,
    battery: evSocPercent ?? 0,
    speed: 0,
    coolant: 0,
    brakes: 0,
    tires: 0,
    engineOil: 0,
    // V4.6.85 — canonical null-preserving fields.
    odometerKm,
    fuelPercent,
    evSoc: evSocPercent,
    isElectric,
    hvBatteryCapacityKwh: null,
    lat: toFiniteNumber(raw.latitude),
    lng: toFiniteNumber(raw.longitude),
    leasingRate: '€ 0,00',
    insuranceCost: '€ 0,00',
    taxCost: '€ 0,00',
    totalMonthlyCost: '€ 0,00',
    imageUrl: raw.imageUrl ?? null,
    signalAgeMs: toFiniteNumber(raw.signalAgeMs),
    isFresh: typeof raw.isFresh === 'boolean' ? raw.isFresh : undefined,
    onlineStatus: normalizeOnlineStatus(raw.onlineStatus),
    telemetryFreshness: normalizeTelemetryFreshness(raw.telemetryFreshness),
    displayState: normalizeDisplayState(raw.displayState),
    displayIgnition: normalizeDisplayIgnition(raw.displayIgnition),
    isLiveTracking:
      typeof raw.isLiveTracking === 'boolean' ? raw.isLiveTracking : undefined,
    stationId: homeStationId,
    stationName: raw.stationName ?? null,
    heading: toFiniteNumber(raw.heading) ?? null,
    lastSeenAt: raw.lastSeenAt ?? null,
    // V4.6.84/85 — canonical fleet-status context (reserved / active
    // rented / maintenance).
    reservedBookingId: raw.reservedBookingId ?? null,
    reservedCustomerName: raw.reservedCustomerName ?? null,
    reservedPickupAt: raw.reservedPickupAt ?? null,
    reservedPickupStationName: raw.reservedPickupStationName ?? null,
    reservedIsOverdue: Boolean(raw.reservedIsOverdue),
    activeBookingId: raw.activeBookingId ?? null,
    activeCustomerName: raw.activeCustomerName ?? null,
    activeReturnAt: raw.activeReturnAt ?? null,
    activeReturnStationName: raw.activeReturnStationName ?? null,
    activeKmIncluded: toFiniteNumber(raw.activeKmIncluded) ?? null,
    activeKmDriven: toFiniteNumber(raw.activeKmDriven) ?? null,
    activeIsOverdue: Boolean(raw.activeIsOverdue),
    maintenanceReason: raw.maintenanceReason ?? null,
    maintenanceReasonCode: reasonCode,
    maintenanceUrgency:
      raw.maintenanceUrgency === 'planned' || raw.maintenanceUrgency === 'urgent'
        ? raw.maintenanceUrgency
        : null,
  };
}

function normalizeFleetMapResponse(
  response: FleetMapVehicleResponse[] | { data?: FleetMapVehicleResponse[] } | unknown,
): FleetMapVehicleResponse[] {
  if (Array.isArray(response)) return response;
  if (
    response &&
    typeof response === 'object' &&
    'data' in response &&
    Array.isArray((response as { data?: unknown }).data)
  ) {
    return (response as { data: FleetMapVehicleResponse[] }).data;
  }
  return [];
}

export const useFleetMapStore = create<FleetMapState>((set) => ({
  vehicles: [],
  filters: { stationId: ALL_STATIONS_FILTER },
  selectedVehicleId: null,
  loading: false,
  error: null,
  lastFetchedAt: null,
  refreshIntervalMs: FLEET_MAP_REFRESH_MS,
  fetchFleetMap: async (orgId: string) => {
    if (!orgId) {
      set({
        vehicles: [],
        selectedVehicleId: null,
        loading: false,
        error: null,
        lastFetchedAt: Date.now(),
      });
      return;
    }

    set({ loading: true, error: null });
    try {
      const response = await api.vehicles.fleetMap(orgId);
      const rawVehicles = normalizeFleetMapResponse(response);
      const vehicles = rawVehicles
        .filter(
          (row): row is FleetMapVehicleResponse =>
            !!row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string',
        )
        .map(mapFleetVehicle);
      const stationIds = new Set(
        vehicles
          .flatMap((vehicle) => [
            vehicle.stationId,
            vehicle.homeStationId,
            vehicle.currentStationId,
          ])
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      );

      set((state) => {
        const nextFilter =
          state.filters.stationId === ALL_STATIONS_FILTER ||
          stationIds.has(state.filters.stationId)
            ? state.filters
            : { stationId: ALL_STATIONS_FILTER };

        const selectedVehicleId =
          state.selectedVehicleId &&
          vehicles.some((vehicle) => vehicle.id === state.selectedVehicleId)
            ? state.selectedVehicleId
            : null;

        return {
          vehicles,
          filters: nextFilter,
          selectedVehicleId,
          loading: false,
          error: null,
          lastFetchedAt: Date.now(),
        };
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load fleet map',
      });
    }
  },
  setStationFilter: (stationId: string) => {
    const nextFilter = stationId || ALL_STATIONS_FILTER;
    persistDashboardStationId(stationFilterToDashboardId(nextFilter));
    set({ filters: { stationId: nextFilter } });
  },
  setSelectedVehicleId: (selectedVehicleId: string | null) =>
    set({ selectedVehicleId }),
}));

export const selectFleetMapVehicles = (state: FleetMapState) => state.vehicles;
export const selectFleetMapFilters = (state: FleetMapState) => state.filters;
export const selectFleetMapLoading = (state: FleetMapState) => state.loading;
export const selectFleetMapError = (state: FleetMapState) => state.error;
export const selectFleetMapLastFetchedAt = (state: FleetMapState) =>
  state.lastFetchedAt;
export const selectFleetMapRefreshInterval = (state: FleetMapState) =>
  state.refreshIntervalMs;
export const selectFleetMapSelectedVehicleId = (state: FleetMapState) =>
  state.selectedVehicleId;

export const selectFleetStationOptions = (
  state: FleetMapState,
): FleetStationOption[] => {
  const stationMap = new Map<string, string>();
  state.vehicles.forEach((vehicle) => {
    if (vehicle.stationId && vehicle.stationName) {
      stationMap.set(vehicle.stationId, vehicle.stationName);
    }
  });

  const stations = [...stationMap.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [{ id: ALL_STATIONS_FILTER, label: 'All Stations' }, ...stations];
};

export const selectVisibleFleetVehicles = (
  state: FleetMapState,
): FleetMapVehicle[] =>
  filterFleetVehiclesByStationFilter(state.vehicles, state.filters.stationId);

function filterFleetVehiclesByStationFilter(
  vehicles: FleetMapVehicle[],
  stationFilter: string,
): FleetMapVehicle[] {
  if (stationFilter === ALL_STATIONS_FILTER) return vehicles;
  return vehicles.filter((vehicle) => vehicleMatchesStationFilter(vehicle, stationFilter));
}

export const selectFleetGeoJson = (state: FleetMapState): FleetMapGeoJson =>
  buildFleetMapGeoJson(selectVisibleFleetVehicles(state));

