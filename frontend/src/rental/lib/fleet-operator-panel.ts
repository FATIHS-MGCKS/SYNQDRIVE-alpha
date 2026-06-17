import type { Station } from '../../lib/api';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import {
  ALL_STATIONS_FILTER,
  NO_LOCATION_FILTER,
  NO_STATION_FILTER,
} from '../stores/useFleetMapStore';
import {
  deriveFleetVisualState,
  vehicleHasFleetLocation,
  type FleetVisualState,
} from './fleetVisualState';

export type FleetCommandTab =
  | 'Attention'
  | 'Available'
  | 'Active'
  | 'Reserved'
  | 'Maintenance'
  | 'Offline'
  | 'All';

export interface FleetVehicleContext {
  vehicle: VehicleData;
  visual: FleetVisualState;
  health: VehicleHealthResponse | null;
}

export interface StationFilterOption {
  id: string;
  label: string;
  total: number;
  ready: number;
  attention: number;
}

const TAB_EMPTY_MESSAGES: Record<FleetCommandTab, string> = {
  Attention: 'No vehicles need attention',
  Available: 'No available vehicles in this filter',
  Active: 'No active rentals',
  Reserved: 'No upcoming reservations',
  Maintenance: 'No vehicles in maintenance',
  Offline: 'No offline vehicles',
  All: 'No vehicles in this filter',
};

export function fleetCommandTabEmptyMessage(
  tab: FleetCommandTab,
  hasSearch: boolean,
): string {
  if (hasSearch) return 'No vehicles match your search';
  return TAB_EMPTY_MESSAGES[tab];
}

export function hasCriticalOrWarningDtc(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  const mod = health?.modules?.error_codes;
  return mod?.state === 'critical' || mod?.state === 'warning';
}

/** Whether a vehicle belongs in the Attention operator bucket. */
export function isFleetAttentionVehicle(
  visual: FleetVisualState,
  vehicle: VehicleData,
  health?: VehicleHealthResponse | null,
): boolean {
  if (visual.isBlocked || hasCriticalOrWarningDtc(health)) return true;
  if (visual.attentionLevel === 'critical' || visual.attentionLevel === 'warning') {
    return true;
  }
  if (visual.isOffline || visual.isStale) return true;
  if (!visual.hasLocation && vehicle.status !== 'Maintenance') return true;
  if (visual.rentalStatus === 'available' && !visual.isReady) return true;
  if (
    visual.rentalStatus === 'active_rented' &&
    (visual.isOffline || visual.isStale)
  ) {
    return true;
  }
  if (vehicle.maintenanceUrgency === 'urgent') return true;
  return false;
}

/** Lower rank = higher priority within Attention tab. */
export function attentionSortRank(
  visual: FleetVisualState,
  vehicle: VehicleData,
): number {
  if (visual.isBlocked) return 0;
  if (visual.attentionLevel === 'critical') return 5;
  if (vehicle.activeIsOverdue || vehicle.reservedIsOverdue) return 10;
  if (visual.isOffline) return 20;
  if (visual.isStale) return 30;
  if (visual.visualStatus === 'maintenance' || visual.attentionLevel === 'warning') {
    return 40;
  }
  if (!visual.hasLocation) return 50;
  return 60;
}

export function buildFleetVehicleContexts(
  vehicles: VehicleData[],
  getHealth: (id: string) => VehicleHealthResponse | null | undefined,
): FleetVehicleContext[] {
  return vehicles.map((vehicle) => {
    const health = getHealth(vehicle.id) ?? null;
    const visual = deriveFleetVisualState(vehicle, { rentalHealth: health });
    return { vehicle, visual, health };
  });
}

export function filterFleetByStation(
  vehicles: VehicleData[],
  stationFilter: string,
): VehicleData[] {
  if (stationFilter === ALL_STATIONS_FILTER) return vehicles;
  if (stationFilter === NO_STATION_FILTER) {
    return vehicles.filter((v) => !v.stationId);
  }
  if (stationFilter === NO_LOCATION_FILTER) {
    return vehicles.filter((v) => !vehicleHasFleetLocation(v));
  }
  return vehicles.filter((v) => v.stationId === stationFilter);
}

function searchableHaystack(ctx: FleetVehicleContext): string {
  const { vehicle: v, visual } = ctx;
  return [
    v.license,
    v.make,
    v.model,
    fleetVehicleTitle(v),
    v.station,
    (v as { stationName?: string | null }).stationName,
    v.activeCustomerName,
    v.reservedCustomerName,
    v.status,
    visual.label,
    visual.shortLabel,
    visual.reason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function fleetVehicleTitle(v: VehicleData): string {
  const model = typeof v.model === 'string' ? v.model : '';
  const short = model.replace(/ \d{4}$/, '');
  return [v.make, short].filter(Boolean).join(' ') || model;
}

export function filterFleetBySearch(
  contexts: FleetVehicleContext[],
  query: string,
): FleetVehicleContext[] {
  const q = query.trim().toLowerCase();
  if (!q) return contexts;
  return contexts.filter((ctx) => searchableHaystack(ctx).includes(q));
}

export function vehicleMatchesCommandTab(
  ctx: FleetVehicleContext,
  tab: FleetCommandTab,
): boolean {
  const { vehicle, visual } = ctx;
  switch (tab) {
    case 'Attention':
      return isFleetAttentionVehicle(visual, vehicle, ctx.health);
    case 'Available':
      return vehicle.status === 'Available';
    case 'Active':
      return vehicle.status === 'Active Rented';
    case 'Reserved':
      return vehicle.status === 'Reserved';
    case 'Maintenance':
      return vehicle.status === 'Maintenance';
    case 'Offline':
      return visual.isOffline || visual.isStale;
    case 'All':
      return true;
    default:
      return true;
  }
}

export function filterFleetByTab(
  contexts: FleetVehicleContext[],
  tab: FleetCommandTab,
): FleetVehicleContext[] {
  return contexts.filter((ctx) => vehicleMatchesCommandTab(ctx, tab));
}

function vehicleStationLabel(v: VehicleData): string {
  const named = (v as { stationName?: string | null }).stationName;
  return named ?? v.station ?? '';
}

export function sortFleetContexts(
  contexts: FleetVehicleContext[],
  tab: FleetCommandTab,
): FleetVehicleContext[] {
  const sorted = [...contexts];
  sorted.sort((a, b) => {
    if (tab === 'Attention') {
      const rank =
        attentionSortRank(a.visual, a.vehicle) -
        attentionSortRank(b.visual, b.vehicle);
      if (rank !== 0) return rank;
    }

    const aCrit = a.visual.attentionLevel === 'critical' ? 0 : 1;
    const bCrit = b.visual.attentionLevel === 'critical' ? 0 : 1;
    if (aCrit !== bCrit) return aCrit - bCrit;

    const aTime = Math.min(
      a.vehicle.activeReturnAt ? new Date(a.vehicle.activeReturnAt).getTime() : Infinity,
      a.vehicle.reservedPickupAt ? new Date(a.vehicle.reservedPickupAt).getTime() : Infinity,
    );
    const bTime = Math.min(
      b.vehicle.activeReturnAt ? new Date(b.vehicle.activeReturnAt).getTime() : Infinity,
      b.vehicle.reservedPickupAt ? new Date(b.vehicle.reservedPickupAt).getTime() : Infinity,
    );
    if (aTime !== bTime) return aTime - bTime;

    const stationCmp = vehicleStationLabel(a.vehicle).localeCompare(
      vehicleStationLabel(b.vehicle),
    );
    if (stationCmp !== 0) return stationCmp;

    return a.vehicle.license.localeCompare(b.vehicle.license);
  });
  return sorted;
}

export function computeCommandTabCounts(
  contexts: FleetVehicleContext[],
): Record<FleetCommandTab, number> {
  const counts: Record<FleetCommandTab, number> = {
    Attention: 0,
    Available: 0,
    Active: 0,
    Reserved: 0,
    Maintenance: 0,
    Offline: 0,
    All: contexts.length,
  };
  for (const ctx of contexts) {
    if (vehicleMatchesCommandTab(ctx, 'Attention')) counts.Attention += 1;
    if (vehicleMatchesCommandTab(ctx, 'Available')) counts.Available += 1;
    if (vehicleMatchesCommandTab(ctx, 'Active')) counts.Active += 1;
    if (vehicleMatchesCommandTab(ctx, 'Reserved')) counts.Reserved += 1;
    if (vehicleMatchesCommandTab(ctx, 'Maintenance')) counts.Maintenance += 1;
    if (vehicleMatchesCommandTab(ctx, 'Offline')) counts.Offline += 1;
  }
  return counts;
}

export function resolveOperatorTabForVehicle(
  ctx: FleetVehicleContext,
): FleetCommandTab {
  if (isFleetAttentionVehicle(ctx.visual, ctx.vehicle, ctx.health)) {
    return 'Attention';
  }
  if (ctx.visual.isOffline || ctx.visual.isStale) return 'Offline';
  if (ctx.vehicle.status === 'Active Rented') return 'Active';
  if (ctx.vehicle.status === 'Reserved') return 'Reserved';
  if (ctx.vehicle.status === 'Maintenance') return 'Maintenance';
  return 'Available';
}

export function buildStationFilterOptions(
  stations: Station[],
  vehicles: VehicleData[],
  getHealth: (id: string) => VehicleHealthResponse | null | undefined,
): StationFilterOption[] {
  const stats = new Map<string, { total: number; ready: number; attention: number }>();

  const bump = (id: string, ready: boolean, attention: boolean) => {
    const row = stats.get(id) ?? { total: 0, ready: 0, attention: 0 };
    row.total += 1;
    if (ready) row.ready += 1;
    if (attention) row.attention += 1;
    stats.set(id, row);
  };

  for (const vehicle of vehicles) {
    const health = getHealth(vehicle.id) ?? null;
    const visual = deriveFleetVisualState(vehicle, { rentalHealth: health });
    const attention = isFleetAttentionVehicle(visual, vehicle, health);
    const ready = visual.isReady;
    bump(ALL_STATIONS_FILTER, ready, attention);
    if (!vehicle.stationId) {
      bump(NO_STATION_FILTER, ready, attention);
    } else {
      bump(vehicle.stationId, ready, attention);
    }
    if (!vehicleHasFleetLocation(vehicle)) {
      bump(NO_LOCATION_FILTER, ready, attention);
    }
  }

  const all = stats.get(ALL_STATIONS_FILTER) ?? { total: 0, ready: 0, attention: 0 };
  const options: StationFilterOption[] = [
    {
      id: ALL_STATIONS_FILTER,
      label: 'All Stations',
      total: all.total,
      ready: all.ready,
      attention: all.attention,
    },
  ];

  const stationRows = [...stations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((station) => {
      const row = stats.get(station.id) ?? { total: 0, ready: 0, attention: 0 };
      return {
        id: station.id,
        label: station.name,
        total: row.total,
        ready: row.ready,
        attention: row.attention,
      };
    });

  options.push(...stationRows);

  const noStation = stats.get(NO_STATION_FILTER);
  if (noStation && noStation.total > 0) {
    options.push({
      id: NO_STATION_FILTER,
      label: 'No Station',
      ...noStation,
    });
  }

  const noLocation = stats.get(NO_LOCATION_FILTER);
  if (noLocation && noLocation.total > 0) {
    options.push({
      id: NO_LOCATION_FILTER,
      label: 'No Location',
      ...noLocation,
    });
  }

  return options;
}

export function formatLastSignalAge(lastSignal: string | undefined): string {
  if (!lastSignal) return 'No signal';
  const ms = Date.now() - new Date(lastSignal).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
