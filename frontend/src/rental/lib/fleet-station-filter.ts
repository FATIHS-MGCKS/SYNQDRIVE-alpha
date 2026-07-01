import type { VehicleData } from '../data/vehicles';
import { STATION_FILTER_STORAGE_KEY } from '../components/dashboard/dashboardTypes';
import {
  ALL_STATIONS_FILTER,
  NO_LOCATION_FILTER,
  NO_STATION_FILTER,
} from '../stores/useFleetMapStore';
import { vehicleHasFleetLocation } from './fleetVisualState';

export { STATION_FILTER_STORAGE_KEY };

export function dashboardStationIdToFilter(stationId: string | null): string {
  return stationId ?? ALL_STATIONS_FILTER;
}

export function stationFilterToDashboardId(stationFilter: string): string | null {
  return stationFilter === ALL_STATIONS_FILTER ? null : stationFilter;
}

export function readPersistedDashboardStationId(): string | null {
  try {
    return localStorage.getItem(STATION_FILTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistDashboardStationId(stationId: string | null): void {
  try {
    if (stationId) localStorage.setItem(STATION_FILTER_STORAGE_KEY, stationId);
    else localStorage.removeItem(STATION_FILTER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function vehicleMatchesStationFilter(
  vehicle: VehicleData,
  stationFilter: string,
): boolean {
  if (stationFilter === ALL_STATIONS_FILTER) return true;
  if (stationFilter === NO_STATION_FILTER) {
    return !vehicle.stationId && !vehicle.homeStationId;
  }
  if (stationFilter === NO_LOCATION_FILTER) {
    return !vehicleHasFleetLocation(vehicle);
  }
  return (
    vehicle.stationId === stationFilter ||
    vehicle.homeStationId === stationFilter ||
    vehicle.currentStationId === stationFilter
  );
}

export function filterFleetVehiclesByStationFilter(
  vehicles: VehicleData[],
  stationFilter: string,
): VehicleData[] {
  if (stationFilter === ALL_STATIONS_FILTER) return vehicles;
  return vehicles.filter((vehicle) => vehicleMatchesStationFilter(vehicle, stationFilter));
}
