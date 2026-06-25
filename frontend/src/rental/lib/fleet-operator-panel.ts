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
import {
  fleetOperationalSortScore,
  resolveFleetVehicleDisplayState,
} from './fleetVehicleDisplay';

export type FleetCommandTab = 'Available' | 'Active' | 'Reserved';

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
  Available: 'No available vehicles in this filter',
  Active: 'No active rentals',
  Reserved: 'No upcoming reservations',
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

/**
 * Whether a vehicle belongs in the Attention operator bucket.
 *
 * Telemetry freshness is treated as a secondary signal: a genuinely offline
 * device (≥48h) is attention-worthy and soft-offline / signal_delayed (24–48h)
 * gets a low-priority slot, but STANDBY (15min–24h) is normal telemetry and
 * never inflates the Attention counts or drags Ready vehicles in.
 */
export function isFleetAttentionVehicle(
  visual: FleetVisualState,
  vehicle: VehicleData,
  health?: VehicleHealthResponse | null,
): boolean {
  const healthWarning =
    health?.overall_state === 'warning' || vehicle.healthStatus === 'Warning';

  // Operational reasons (independent of telemetry freshness).
  if (visual.isBlocked || hasCriticalOrWarningDtc(health)) return true;
  if (visual.attentionLevel === 'critical') return true; // blocked / health-critical / maintenance-urgent / return overdue
  if (vehicle.reservedIsOverdue) return true;
  if (healthWarning) return true;
  if (vehicle.maintenanceUrgency === 'urgent' || vehicle.maintenanceUrgency === 'planned') {
    return true;
  }
  if (!visual.hasLocation && vehicle.status !== 'Maintenance') return true;

  // Telemetry reasons. Offline (≥48h) is a real connectivity problem; soft
  // offline / signal_delayed (24–48h, `visual.isStale`) is a low-priority hint.
  // STANDBY is never an attention reason.
  if (visual.isOffline) return true;
  if (visual.isStale) return true;

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
  const { vehicle: v } = ctx;
  return [v.license, v.make, v.model, fleetVehicleTitle(v)]
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
  const { vehicle } = ctx;
  switch (tab) {
    case 'Available':
      return vehicle.status === 'Available';
    case 'Active':
      return vehicle.status === 'Active Rented';
    case 'Reserved':
      return vehicle.status === 'Reserved';
    default:
      return false;
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

function appointmentTime(vehicle: VehicleData): number {
  return Math.min(
    vehicle.activeReturnAt ? new Date(vehicle.activeReturnAt).getTime() : Infinity,
    vehicle.reservedPickupAt ? new Date(vehicle.reservedPickupAt).getTime() : Infinity,
  );
}

/**
 * Operational sort. Critical/blocked/warning stay on top (even when stale or
 * offline), normal ready vehicles in the middle, non-urgent offline vehicles
 * at the very bottom, and outdated-signal vehicles nudged down — mirroring the
 * Dashboard Fleet State Board ordering. The Attention tab keeps its dedicated
 * priority ranking.
 */
export function sortFleetContexts(
  contexts: FleetVehicleContext[],
): FleetVehicleContext[] {
  const scored = contexts.map((ctx) => ({
    ctx,
    score: fleetOperationalSortScore(
      resolveFleetVehicleDisplayState(ctx.vehicle, {
        rentalHealth: ctx.health,
        visual: ctx.visual,
      }),
    ),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    const aCrit = a.ctx.visual.attentionLevel === 'critical' ? 0 : 1;
    const bCrit = b.ctx.visual.attentionLevel === 'critical' ? 0 : 1;
    if (aCrit !== bCrit) return aCrit - bCrit;

    const aTime = appointmentTime(a.ctx.vehicle);
    const bTime = appointmentTime(b.ctx.vehicle);
    if (aTime !== bTime) return aTime - bTime;

    const stationCmp = vehicleStationLabel(a.ctx.vehicle).localeCompare(
      vehicleStationLabel(b.ctx.vehicle),
    );
    if (stationCmp !== 0) return stationCmp;

    return a.ctx.vehicle.license.localeCompare(b.ctx.vehicle.license);
  });
  return scored.map((s) => s.ctx);
}

export function computeCommandTabCounts(
  contexts: FleetVehicleContext[],
): Record<FleetCommandTab, number> {
  const counts: Record<FleetCommandTab, number> = {
    Available: 0,
    Active: 0,
    Reserved: 0,
  };
  for (const ctx of contexts) {
    if (vehicleMatchesCommandTab(ctx, 'Available')) counts.Available += 1;
    if (vehicleMatchesCommandTab(ctx, 'Active')) counts.Active += 1;
    if (vehicleMatchesCommandTab(ctx, 'Reserved')) counts.Reserved += 1;
  }
  return counts;
}

export function resolveOperatorTabForVehicle(
  ctx: FleetVehicleContext,
): FleetCommandTab {
  if (ctx.vehicle.status === 'Active Rented') return 'Active';
  if (ctx.vehicle.status === 'Reserved') return 'Reserved';
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
