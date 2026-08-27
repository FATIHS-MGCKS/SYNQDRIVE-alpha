import type { Station } from '../../lib/api';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../data/vehicles';
import type { VehicleOperationalUiProjection } from './operational-projection';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
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
import {
  buildVehicleRowOperationalProjection,
  type VehicleRowReadinessInput,
} from './vehicle-row-operational-projection';
import { composeFleetDashboardWarningLightsAccessor } from './vehicle-row-health-consumer';

import { isStationFilterHudOperationallyReady } from '../components/dashboard/runtime/dashboard-operational-readiness';
import type { DashboardRuntimeModel } from '../components/dashboard/runtime/dashboardRuntimeTypes';
import type { VehicleRuntimeState } from '../components/dashboard/runtime/dashboardRuntimeTypes';
import {
  selectOperationalStatus,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';
import {
  applyFleetCommandFilters,
  computeCommandTabCounts,
  filterFleetByTab,
  fleetCommandTabEmptyMessage,
  fleetContextsToVehicles,
  resolveFleetCommandTabForVehicle,
  resolveOperatorTabForVehicle,
  selectHasFutureBooking,
  vehicleMatchesFleetCommandTab,
  type FleetCommandFilterState,
  type FleetCommandTab,
  FLEET_COMMAND_TABS,
} from './fleet-command-filters';

export {
  applyFleetCommandFilters,
  computeCommandTabCounts,
  filterFleetByTab,
  fleetCommandTabEmptyMessage,
  fleetContextsToVehicles,
  resolveFleetCommandTabForVehicle,
  resolveOperatorTabForVehicle,
  selectHasFutureBooking,
  vehicleMatchesFleetCommandTab,
  type FleetCommandFilterState,
  type FleetCommandTab,
  FLEET_COMMAND_TABS,
};

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

/** Runtime-derived attention counts for Fleet Command when no dashboard slice is available. */
export function resolveRuntimeFleetAlertCounts(
  states: VehicleRuntimeState[],
  scopeVehicleIds?: ReadonlySet<string>,
): { critical: number; warning: number } {
  const scoped = scopeVehicleIds
    ? states.filter((state) => scopeVehicleIds.has(state.vehicleId))
    : states;
  let critical = 0;
  let warning = 0;
  for (const state of scoped) {
    if (state.isCritical || state.isBlocked) critical += 1;
    else if (state.isWarning) warning += 1;
  }
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
  const { vehicle: v, visual, health, uiProjection } = ctx;
  const attention = uiProjection.attention.attention.presentation?.state;

  if (options.canonicalCriticalVehicleIds?.has(v.id)) return 'critical';

  if (attention === 'CRITICAL' || attention === 'ACTION_REQUIRED') return 'critical';
  if (health?.rental_blocked === true) return 'critical';
  if (health?.overall_state === 'critical') return 'critical';
  if (visual.attentionLevel === 'critical') return 'critical';
  if (visual.isBlocked || hasHardBlockingReasons(health)) return 'critical';
  if (v.activeIsOverdue) return 'critical';
  if (hasCriticalHealthModule(health)) return 'critical';
  if (health?.modules?.error_codes?.state === 'critical') return 'critical';
  if (visual.isOffline) return 'critical';

  if (attention === 'WATCH') return 'warning';
  if (health?.overall_state === 'warning') return 'warning';
  if (visual.attentionLevel === 'warning') return 'warning';
  if (hasWarningHealthModule(health)) return 'warning';
  if (hasCriticalOrWarningDtc(health) && health?.modules?.error_codes?.state === 'warning') {
    return 'warning';
  }
  if (visual.isStale) return 'warning';
  if (
    v.maintenanceUrgency === 'planned' ||
    (v.maintenanceUrgency === 'urgent' && selectOperationalStatus(v) !== VEHICLE_OPERATIONAL_STATUS.MAINTENANCE)
  ) {
    return 'warning';
  }
  if (!visual.hasLocation && selectOperationalStatus(v) !== VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) return 'warning';

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

/** @deprecated Use vehicleMatchesFleetCommandTab */
export function vehicleMatchesCommandTab(
  ctx: FleetVehicleContext,
  tab: FleetCommandTab,
): boolean {
  return vehicleMatchesFleetCommandTab(ctx.vehicle, tab);
}

export interface FleetVehicleContext {
  vehicle: VehicleData;
  visual: FleetVisualState;
  health: VehicleHealthResponse | null;
  /** P1.3 — canonical UI projection for fleet list/map surfaces. */
  uiProjection: import('./operational-projection').VehicleOperationalUiProjection;
  /** Stage 2A — shared row projection contract (not yet bound to visible UI). */
  rowOperationalProjection: import('./vehicle-row-operational-projection').VehicleRowOperationalProjection;
}

export interface StationFilterOption {
  id: string;
  label: string;
  total: number;
  ready: number;
  attention: number;
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

  if (health?.rental_blocked) return true;
  // Operational reasons (independent of telemetry freshness).
  if (visual.isBlocked || hasCriticalOrWarningDtc(health)) return true;
  if (visual.attentionLevel === 'critical') return true; // blocked / health-critical / maintenance-urgent / return overdue
  if (vehicle.reservedIsOverdue) return true;
  if (healthWarning) return true;
  if (vehicle.maintenanceUrgency === 'urgent' || vehicle.maintenanceUrgency === 'planned') {
    return true;
  }
  if (!visual.hasLocation && selectOperationalStatus(vehicle) !== VEHICLE_OPERATIONAL_STATUS.MAINTENANCE) return true;

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
  options: {
    locale?: 'en' | 'de';
    getReadiness?: (vehicleId: string) => VehicleRowReadinessInput | undefined;
    getDashboardWarningLights?: (
      vehicleId: string,
    ) => import('../../lib/api').DashboardWarningLightsResponse | null | undefined;
  } = {},
): FleetVehicleContext[] {
  const locale = options.locale ?? 'de';
  const resolveDashboardWarningLights = composeFleetDashboardWarningLightsAccessor(
    getHealth,
    options.getDashboardWarningLights,
  );
  return vehicles.map((vehicle) => {
    const health = getHealth(vehicle.id) ?? null;
    const uiProjection = buildFleetVehicleUiProjection(
      vehicle as import('./fleet-vehicle-ui-projection').FleetProjectionVehicle,
      { locale },
    );
    const visual = deriveFleetVisualState(vehicle, { uiProjection, locale });
    const rowOperationalProjection = buildVehicleRowOperationalProjection({
      vehicle: vehicle as import('./fleet-vehicle-ui-projection').FleetProjectionVehicle,
      uiProjection,
      rentalHealth: health,
      readiness: options.getReadiness?.(vehicle.id) ?? null,
      dashboardWarningLights: resolveDashboardWarningLights(vehicle.id) ?? null,
      locale,
    });
    return { vehicle, visual, health, uiProjection, rowOperationalProjection };
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
      uiProjection: ctx.uiProjection,
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

export function buildStationFilterOptions(
  stations: Station[],
  vehicles: VehicleData[],
  getHealth: (id: string) => VehicleHealthResponse | null | undefined,
  options: { locale?: 'en' | 'de' } = {},
): StationFilterOption[] {
  const locale = options.locale ?? 'de';
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
    const uiProjection = buildFleetVehicleUiProjection(
      vehicle as import('./fleet-vehicle-ui-projection').FleetProjectionVehicle,
      { locale },
    );
    const visual = deriveFleetVisualState(vehicle, { uiProjection, locale });
    const attention = isFleetAttentionVehicle(visual, vehicle, health);
    const ready = isStationFilterHudOperationallyReady(vehicle);
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
  const filterOptions: StationFilterOption[] = [
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

  filterOptions.push(...stationRows);

  const noStation = stats.get(NO_STATION_FILTER);
  if (noStation && noStation.total > 0) {
    filterOptions.push({
      id: NO_STATION_FILTER,
      label: 'No Station',
      ...noStation,
    });
  }

  const noLocation = stats.get(NO_LOCATION_FILTER);
  if (noLocation && noLocation.total > 0) {
    filterOptions.push({
      id: NO_LOCATION_FILTER,
      label: 'No Location',
      ...noLocation,
    });
  }

  return filterOptions;
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
