import type { Station } from '../../lib/api';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import {
  ALL_STATIONS_FILTER,
  NO_LOCATION_FILTER,
  NO_STATION_FILTER,
} from '../stores/useFleetMapStore';
import { filterFleetVehiclesByStationFilter } from './fleet-station-filter';
import {
  deriveFleetVisualState,
  vehicleHasFleetLocation,
  type FleetVisualState,
} from './fleetVisualState';
import { isLegalComplianceBlockingText } from '../components/dashboard/runtime/dashboardRuntimeReasons';
import {
  fleetOperationalSortScore,
  fleetSignalAgeMs,
  resolveFleetVehicleDisplayState,
} from './fleetVehicleDisplay';
import { fleetStatusMatchesTab, normalizeFleetStatusKey } from './vehicle-status';

import type { DashboardRuntimeModel } from '../components/dashboard/runtime/dashboardRuntimeTypes';

export function resolveCanonicalFleetAlertCounts(
  runtime: DashboardRuntimeModel,
): { critical: number; warning: number } {
  const criticalSlice = runtime.slices['critical-alerts'];
  const critical = criticalSlice.count ?? criticalSlice.rows.length;
  const warning = runtime.vehicleStates.filter(
    (state) => state.isWarning && !state.isCritical && !state.isBlocked,
  ).length;
  return { critical, warning };
}

/** Vehicle IDs from the canonical Critical Alerts drawer slice. */
export function resolveCanonicalCriticalVehicleIds(
  runtime: DashboardRuntimeModel,
): Set<string> {
  const ids = new Set<string>();
  for (const row of runtime.slices['critical-alerts'].rows) {
    if (row.vehicleId) ids.add(row.vehicleId);
  }
  return ids;
}

export type FleetCommandRowSeverity = 'critical' | 'warning' | 'good';

export interface ResolveFleetCommandRowSeverityOptions {
  /** Forces critical when the vehicle is in the canonical Critical Alerts slice. */
  canonicalCriticalVehicleIds?: ReadonlySet<string>;
}

function hasCriticalHealthModule(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (!health?.modules) return false;
  return Object.values(health.modules).some((mod) => mod?.state === 'critical');
}

function hasWarningHealthModule(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  if (!health?.modules) return false;
  return Object.values(health.modules).some((mod) => mod?.state === 'warning');
}

function hasHardBlockingReasons(
  health: VehicleHealthResponse | null | undefined,
): boolean {
  const reasons = health?.blocking_reasons ?? [];
  if (reasons.length === 0) return health?.rental_blocked === true;
  return reasons.some((reason) => {
    const normalized = reason.toLowerCase();
    if (isLegalComplianceBlockingText(reason)) return true;
    return !normalized.includes('service') && !normalized.includes('wartung');
  });
}

/**
 * Canonical Fleet Command row severity — shared by Dashboard and Fleet Page.
 * Critical always wins over warning; standby is never elevated to warning.
 */
export function resolveFleetCommandRowSeverity(
  ctx: FleetVehicleContext,
  options: ResolveFleetCommandRowSeverityOptions = {},
): FleetCommandRowSeverity {
  const { vehicle: v, visual, health } = ctx;

  if (options.canonicalCriticalVehicleIds?.has(v.id)) return 'critical';

  if (health?.rental_blocked === true) return 'critical';
  if (health?.overall_state === 'critical') return 'critical';
  if (visual.attentionLevel === 'critical') return 'critical';
  if (visual.isBlocked || hasHardBlockingReasons(health)) return 'critical';
  if (v.healthStatus === 'Critical') return 'critical';
  if (v.activeIsOverdue) return 'critical';
  if (hasCriticalHealthModule(health)) return 'critical';
  if (health?.modules?.error_codes?.state === 'critical') return 'critical';
  // Offline (≥48h) is critical in the dashboard runtime telemetry path.
  if (visual.isOffline) return 'critical';

  if (health?.overall_state === 'warning') return 'warning';
  if (visual.attentionLevel === 'warning') return 'warning';
  if (v.healthStatus === 'Warning') return 'warning';
  if (hasWarningHealthModule(health)) return 'warning';
  if (hasCriticalOrWarningDtc(health) && health?.modules?.error_codes?.state === 'warning') {
    return 'warning';
  }
  if (visual.isStale) return 'warning';
  if (
    v.maintenanceUrgency === 'planned' ||
    (v.maintenanceUrgency === 'urgent' && v.status !== 'Maintenance')
  ) {
    return 'warning';
  }
  if (!visual.hasLocation && v.status !== 'Maintenance') return 'warning';

  return 'good';
}

export function fleetCommandSeveritySortRank(severity: FleetCommandRowSeverity): number {
  switch (severity) {
    case 'critical':
      return 0;
    case 'warning':
      return 1;
    default:
      return 2;
  }
}

export function computeFleetCommandAttentionCounts(
  contexts: FleetVehicleContext[],
  options: ResolveFleetCommandRowSeverityOptions = {},
): { critical: number; warning: number } {
  let critical = 0;
  let warning = 0;
  for (const ctx of contexts) {
    const severity = resolveFleetCommandRowSeverity(ctx, options);
    if (severity === 'critical') critical += 1;
    else if (severity === 'warning') warning += 1;
  }
  return { critical, warning };
}

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
  return filterFleetVehiclesByStationFilter(vehicles, stationFilter);
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
      return fleetStatusMatchesTab(vehicle.status, 'Available');
    case 'Active':
      return fleetStatusMatchesTab(vehicle.status, 'Active Rented');
    case 'Reserved':
      return fleetStatusMatchesTab(vehicle.status, 'Reserved');
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

function compareGoodReadyByLastSignal(a: FleetVehicleContext, b: FleetVehicleContext): number {
  const ageA = fleetSignalAgeMs(a.vehicle);
  const ageB = fleetSignalAgeMs(b.vehicle);
  if (ageA == null && ageB == null) return 0;
  if (ageA == null) return 1;
  if (ageB == null) return -1;
  if (ageA !== ageB) return ageA - ageB;
  return a.vehicle.license.localeCompare(b.vehicle.license);
}

/**
 * Fleet Command sort order (shared Dashboard + Fleet Page):
 * 1. Critical  2. Warning  3. Good/Ready
 * Within critical/warning: operational urgency (blocked, overdue, offline…)
 * Within good/ready: fresher last signal first; missing signal last.
 */
export function sortFleetContexts(
  contexts: FleetVehicleContext[],
  options: ResolveFleetCommandRowSeverityOptions = {},
): FleetVehicleContext[] {
  const scored = contexts.map((ctx) => ({
    ctx,
    severity: resolveFleetCommandRowSeverity(ctx, options),
    display: resolveFleetVehicleDisplayState(ctx.vehicle, {
      rentalHealth: ctx.health,
      visual: ctx.visual,
    }),
  }));

  scored.sort((a, b) => {
    const sevRankA = fleetCommandSeveritySortRank(a.severity);
    const sevRankB = fleetCommandSeveritySortRank(b.severity);
    if (sevRankA !== sevRankB) return sevRankA - sevRankB;

    if (a.severity !== 'good') {
      const scoreA = fleetOperationalSortScore(a.display);
      const scoreB = fleetOperationalSortScore(b.display);
      if (scoreB !== scoreA) return scoreB - scoreA;

      const aCrit = a.ctx.visual.attentionLevel === 'critical' ? 0 : 1;
      const bCrit = b.ctx.visual.attentionLevel === 'critical' ? 0 : 1;
      if (aCrit !== bCrit) return aCrit - bCrit;

      const aTime = appointmentTime(a.ctx.vehicle);
      const bTime = appointmentTime(b.ctx.vehicle);
      if (aTime !== bTime) return aTime - bTime;
    } else {
      const signalCmp = compareGoodReadyByLastSignal(a.ctx, b.ctx);
      if (signalCmp !== 0) return signalCmp;
    }

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
  const status = normalizeFleetStatusKey(ctx.vehicle.status);
  if (status === 'Active Rented') return 'Active';
  if (status === 'Reserved') return 'Reserved';
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
