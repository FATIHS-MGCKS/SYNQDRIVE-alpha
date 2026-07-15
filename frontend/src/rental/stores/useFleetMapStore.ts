import { create } from 'zustand';
import type { Feature, Point } from 'geojson';
import { api } from '../../lib/api';
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
  applyFleetOperationalOptimisticPatch,
  mapFleetMapVehicleResponse,
  normalizeFleetMapApiResponse,
  type FleetMapVehicle,
} from '../lib/fleet-map-vehicle-store.utils';
import type { FleetOperationalOptimisticPatch } from '../lib/vehicle-operational-query/types';

export type { FleetMapVehicle };
export {
  mapFleetMapVehicleResponse,
  normalizeFleetMapApiResponse,
} from '../lib/fleet-map-vehicle-store.utils';

export const FLEET_MAP_REFRESH_MS = 30_000;
export const ALL_STATIONS_FILTER = 'all';

export interface FleetStationOption {
  id: string;
  label: string;
}

export type FleetMapFeatureProperties = FleetMapFeatureVisualProperties;
export type FleetMapFeature = Feature<Point, FleetMapFeatureProperties>;
export type FleetMapGeoJson = FleetMapVisualGeoJson;

export const NO_STATION_FILTER = 'no-station';
export const NO_LOCATION_FILTER = 'no-location';

export interface FleetMapFilters {
  stationId: string;
}

interface OptimisticOperationalEntry {
  token: string;
  snapshots: Map<string, FleetMapVehicle>;
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
  applyOptimisticOperationalPatches: (
    patches: Array<{ vehicleId: string; patch: FleetOperationalOptimisticPatch }>,
  ) => string | null;
  rollbackOptimisticOperationalPatches: (token: string) => void;
  commitOptimisticOperationalPatches: (token: string) => void;
  setStationFilter: (stationId: string) => void;
  setSelectedVehicleId: (vehicleId: string | null) => void;
}

let optimisticTokenCounter = 0;
const pendingOptimisticPatches = new Map<string, OptimisticOperationalEntry>();

export const useFleetMapStore = create<FleetMapState>((set) => ({
  vehicles: [],
  filters: { stationId: ALL_STATIONS_FILTER },
  selectedVehicleId: null,
  loading: false,
  error: null,
  lastFetchedAt: null,
  refreshIntervalMs: FLEET_MAP_REFRESH_MS,
  applyOptimisticOperationalPatches: (patches) => {
    if (patches.length === 0) return null;

    const token = `fleet-opt-${++optimisticTokenCounter}`;
    const snapshots = new Map<string, FleetMapVehicle>();
    const patchById = new Map(patches.map((p) => [p.vehicleId, p.patch]));

    set((state) => {
      const nextVehicles = state.vehicles.map((vehicle) => {
        const patch = patchById.get(vehicle.id);
        if (!patch) return vehicle;
        snapshots.set(vehicle.id, vehicle);
        return applyFleetOperationalOptimisticPatch(vehicle, patch);
      });
      return { vehicles: nextVehicles };
    });

    pendingOptimisticPatches.set(token, { token, snapshots });
    return token;
  },
  rollbackOptimisticOperationalPatches: (token) => {
    const entry = pendingOptimisticPatches.get(token);
    if (!entry) return;
    pendingOptimisticPatches.delete(token);

    set((state) => ({
      vehicles: state.vehicles.map((vehicle) => {
        const snapshot = entry.snapshots.get(vehicle.id);
        return snapshot ?? vehicle;
      }),
    }));
  },
  commitOptimisticOperationalPatches: (token) => {
    pendingOptimisticPatches.delete(token);
  },
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
      const rawVehicles = normalizeFleetMapApiResponse(response);
      const vehicles = rawVehicles
        .filter(
          (row): row is NonNullable<typeof row> =>
            !!row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string',
        )
        .map(mapFleetMapVehicleResponse);
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

      for (const entry of pendingOptimisticPatches.values()) {
        pendingOptimisticPatches.delete(entry.token);
      }
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
