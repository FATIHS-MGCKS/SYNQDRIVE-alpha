import {
  dedupeDisplayReasons,
  formatRuntimeReasonLabel,
} from './reasonDisplay';
import { sanitizeUserFacingIssueText } from '../../lib/operational-issues';
import type { FleetReasonBadge } from '../../lib/fleetVehicleDisplay';
import { fleetSignalAgeMs, resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import type {
  DashboardSlice,
  DashboardSliceRow,
  TelemetryConnectionState,
  VehicleRuntimeState,
} from './runtime';
import { readyToRentNotReadyRows } from './dashboardSliceAccess';
import type { DashboardDrawerGroup } from './dashboardDrilldownGroups';

const OPERATIONAL_STATUS_TERMS = new Set([
  'available',
  'reserved',
  'active rented',
  'active_rented',
  'maintenance',
  'unavailable',
  'unknown',
]);

function isDe(locale: string): boolean {
  return locale === 'de';
}

function normalizeText(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripOperationalTokens(parts: string[]): string[] {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !OPERATIONAL_STATUS_TERMS.has(normalizeText(part)));
}

function vehicleModelLine(state: VehicleRuntimeState): string | undefined {
  const license = (state.license ?? '').trim();
  let remainder = state.displayName.trim();
  if (license) {
    const licensePrefix = new RegExp(`^${license.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(·|-)?\\s*`, 'i');
    remainder = remainder.replace(licensePrefix, '').trim();
  }
  const parts = stripOperationalTokens(remainder.split('·'));
  const withoutStation = parts.filter((part) => normalizeText(part) !== normalizeText(state.stationLabel));
  return withoutStation.join(' · ') || undefined;
}

function telemetryLabel(state: VehicleRuntimeState, locale: string): string | null {
  const de = isDe(locale);
  switch (state.telemetryState) {
    case 'live':
      return de ? 'Live' : 'Live';
    case 'standby':
      return de ? 'Standby' : 'Standby';
    case 'soft_offline':
      return de ? 'Soft Offline' : 'Soft offline';
    case 'offline':
      return de ? 'Offline' : 'Offline';
    case 'unknown':
      return de ? 'Kein Signal' : 'No signal';
    default:
      return null;
  }
}

function locationLine(state: VehicleRuntimeState, locale: string): string | undefined {
  const parts = [state.stationLabel, telemetryLabel(state, locale)].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function readyToRentDrawerHint(slice: DashboardSlice, locale: string): string {
  const de = isDe(locale);
  const readyCount = slice.count ?? slice.rows.length;
  const notReadyCount = readyToRentNotReadyRows(slice).length;
  return de
    ? `${readyCount} bereit · ${notReadyCount} nicht bereit`
    : `${readyCount} ready · ${notReadyCount} not ready`;
}

export function buildReadyToRentDrawerGroups(slice: DashboardSlice, locale: string): DashboardDrawerGroup[] {
  const de = isDe(locale);
  const groups = (slice.groups ?? []).filter((group) => group.rows.length > 0);
  const ready = groups.find((group) => group.id === 'ready-now');
  const notReady = groups.find((group) => group.id === 'available-but-not-ready');
  const result: DashboardDrawerGroup[] = [];

  if (ready) {
    result.push({
      ...ready,
      title: de ? 'Bereit' : 'Ready',
      count: ready.rows.length,
    });
  }
  if (notReady) {
    result.push({
      ...notReady,
      title: de ? 'Nicht bereit' : 'Not Ready',
      count: notReady.rows.length,
    });
  }

  return result;
}

const TELEMETRY_SORT_RANK: Record<TelemetryConnectionState, number> = {
  live: 0,
  standby: 1,
  soft_offline: 2,
  offline: 3,
  unknown: 4,
};

const NO_TIMESTAMP_BASE_MS = 10 * 365 * 24 * 60 * 60_000;

function rowSignalSortKey(
  row: DashboardSliceRow,
  fleetVehicleById: Map<string, VehicleData>,
  vehicleStates: Map<string, VehicleRuntimeState>,
  now: number,
): number {
  const vehicleId = row.vehicleId;
  const vehicle = vehicleId ? fleetVehicleById.get(vehicleId) : undefined;
  const state = vehicleId ? vehicleStates.get(vehicleId) : undefined;

  if (vehicle) {
    const ageMs = fleetSignalAgeMs(vehicle, now);
    if (ageMs != null) return ageMs;
  }

  if (state) {
    const rank = TELEMETRY_SORT_RANK[state.telemetryState] ?? TELEMETRY_SORT_RANK.unknown;
    return NO_TIMESTAMP_BASE_MS + rank * 60 * 60_000;
  }

  return Number.POSITIVE_INFINITY;
}

/**
 * Sort drawer rows fresh → older within a single Ready / Not Ready group.
 * Uses fleet `lastSignal` / `signalAgeMs`; missing signal sorts last.
 */
export function sortRowsByLastSignalFreshFirst(
  rows: DashboardSliceRow[],
  options: {
    vehicleStates: Map<string, VehicleRuntimeState>;
    fleetVehicleById: Map<string, VehicleData>;
    now?: number;
  },
): DashboardSliceRow[] {
  const now = options.now ?? Date.now();
  return [...rows].sort((a, b) => {
    const keyA = rowSignalSortKey(a, options.fleetVehicleById, options.vehicleStates, now);
    const keyB = rowSignalSortKey(b, options.fleetVehicleById, options.vehicleStates, now);
    if (keyA !== keyB) return keyA - keyB;
    return a.title.localeCompare(b.title);
  });
}

export function sortReadyToRentDrawerGroupsByLastSignal(
  groups: DashboardDrawerGroup[],
  options: {
    vehicleStates: Map<string, VehicleRuntimeState>;
    fleetVehicleById: Map<string, VehicleData>;
    now?: number;
  },
): DashboardDrawerGroup[] {
  return groups.map((group) => {
    const rows = sortRowsByLastSignalFreshFirst(group.rows, options);
    return { ...group, rows, count: rows.length };
  });
}

export interface VehicleDrawerRowDisplay {
  title: string;
  subtitle?: string;
  locationLine?: string;
  primaryReason?: string;
  extraReasonCount: number;
  readinessLabel?: string;
  readinessTone: 'success' | 'watch' | 'critical' | 'neutral';
  healthLabel?: string;
  healthTone: 'success' | 'watch' | 'critical' | 'neutral';
}

function healthChip(state: VehicleRuntimeState, locale: string): { label?: string; tone: VehicleDrawerRowDisplay['healthTone'] } {
  if (state.isCritical) {
    return { label: isDe(locale) ? 'Kritisch' : 'Critical', tone: 'critical' };
  }
  if (state.isWarning) {
    return { label: isDe(locale) ? 'Warnung' : 'Warning', tone: 'watch' };
  }
  if (state.healthSeverity === 'ok') {
    return { label: isDe(locale) ? 'Gut' : 'Good', tone: 'success' };
  }
  return { tone: 'neutral' };
}

function readinessChip(
  state: VehicleRuntimeState,
  locale: string,
): { label: string; tone: VehicleDrawerRowDisplay['readinessTone'] } {
  if (state.isBlocked) {
    return { label: isDe(locale) ? 'Blockiert' : 'Blocked', tone: 'critical' };
  }
  if (state.isReadyToRent) {
    return { label: isDe(locale) ? 'Bereit' : 'Ready', tone: 'success' };
  }
  return { label: isDe(locale) ? 'Nicht bereit' : 'Not Ready', tone: 'watch' };
}

function filterDrawerReasons(
  row: DashboardSliceRow,
  locale: string,
  excludedTexts: string[],
): ReturnType<typeof dedupeDisplayReasons> {
  const excluded = new Set(excludedTexts.map(normalizeText).filter(Boolean));
  return dedupeDisplayReasons(row.reasons ?? []).filter((reason) => {
    const label = normalizeText(formatRuntimeReasonLabel(reason, locale));
    return label.length > 0 && !excluded.has(label);
  });
}

export function composeVehicleDrawerRowDisplay(
  row: DashboardSliceRow,
  state: VehicleRuntimeState | undefined,
  locale: string,
  options?: { showReadiness?: boolean },
): VehicleDrawerRowDisplay {
  const showReadiness = options?.showReadiness ?? false;
  const title = sanitizeUserFacingIssueText(state?.license || row.title) || row.title;
  const subtitle = state
    ? vehicleModelLine(state)
    : sanitizeUserFacingIssueText(
        stripOperationalTokens((row.subtitle ?? '').split('·')).join(' · '),
      ) || undefined;

  const location = state ? locationLine(state, locale) : row.stationLabel ?? undefined;
  const excludedTexts = [row.meta, subtitle, location, title].filter(Boolean) as string[];
  if (state) {
    const telemetry = telemetryLabel(state, locale);
    if (telemetry) excludedTexts.push(telemetry);
  }
  const reasons = filterDrawerReasons(row, locale, excludedTexts);
  const primaryReason = reasons[0]
    ? sanitizeUserFacingIssueText(formatRuntimeReasonLabel(reasons[0], locale))
    : sanitizeUserFacingIssueText(row.meta);
  const extraReasonCount = Math.max(0, reasons.length - (primaryReason ? 1 : 0));

  const health = state ? healthChip(state, locale) : {
    label: row.severity === 'critical'
      ? (isDe(locale) ? 'Kritisch' : 'Critical')
      : row.severity === 'warning'
        ? (isDe(locale) ? 'Warnung' : 'Warning')
        : row.severity === 'success'
          ? (isDe(locale) ? 'Gut' : 'Good')
          : undefined,
    tone: row.severity === 'critical'
      ? 'critical'
      : row.severity === 'warning'
        ? 'watch'
        : row.severity === 'success'
          ? 'success'
          : 'neutral',
  } as const;

  const readiness = showReadiness && state ? readinessChip(state, locale) : null;

  return {
    title,
    subtitle: subtitle || undefined,
    locationLine: location,
    primaryReason: primaryReason || undefined,
    extraReasonCount,
    readinessLabel: readiness?.label,
    readinessTone: readiness?.tone ?? 'neutral',
    healthLabel: health.label,
    healthTone: health.tone,
  };
}

export type DrawerVehicleReasonBadge = {
  text: string;
  tone: 'success' | 'watch' | 'warning' | 'critical' | 'neutral';
};

export type HandoverReadinessBadge = {
  label: string;
  tone: 'success' | 'watch' | 'critical' | 'info' | 'neutral';
};

const HANDOVER_TIMING_REASON_PATTERNS = [
  'abholung überfällig',
  'pickup overdue',
  'rückgabe überfällig',
  'return overdue',
];

function isHandoverTimingReason(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return HANDOVER_TIMING_REASON_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Reserved handover badge tone follows fleet health readiness (green / orange / red),
 * not pickup timing — overdue is shown only in the timing chip.
 */
export function resolveHandoverReadinessBadge(
  vehicle: VehicleData | undefined,
  health: VehicleHealthResponse | null | undefined,
  runtimeState: VehicleRuntimeState | undefined,
  locale: string,
  fallbackLabel?: string,
): HandoverReadinessBadge | null {
  const de = isDe(locale);
  const label = fallbackLabel ?? (de ? 'Reserviert' : 'Reserved');

  const fleetDisplay = vehicle
    ? resolveFleetVehicleDisplayState(vehicle, { rentalHealth: health ?? null, locale })
    : null;

  if (fleetDisplay) {
    const healthStatus = fleetDisplay.healthDisplay.status;
    const blocked =
      fleetDisplay.rentalDisplay.status === 'blocked'
      || fleetDisplay.primaryStatus === 'blocked'
      || fleetDisplay.primaryStatus === 'critical';

    if (blocked || healthStatus === 'critical') {
      return { label, tone: 'critical' };
    }
    if (
      healthStatus === 'warning'
      || fleetDisplay.primaryStatus === 'warning'
      || (vehicle?.cleaningStatus && vehicle.cleaningStatus !== 'Clean')
    ) {
      return { label, tone: 'watch' };
    }
    return { label, tone: 'success' };
  }

  if (runtimeState) {
    if (runtimeState.isCritical || runtimeState.blockLevel === 'hard_blocked') {
      return { label, tone: 'critical' };
    }
    if (runtimeState.isWarning || runtimeState.blockLevel === 'soft_blocked') {
      return { label, tone: 'watch' };
    }
    return { label, tone: 'success' };
  }

  return { label, tone: 'info' };
}

/** Fleet-style vehicle warning for handover rows; excludes timing-only reasons. */
export function resolveHandoverVehicleReasonBadge(
  row: DashboardSliceRow,
  vehicle: VehicleData | undefined,
  health: VehicleHealthResponse | null | undefined,
  locale: string,
): DrawerVehicleReasonBadge | null {
  const fleetDisplay = vehicle
    ? resolveFleetVehicleDisplayState(vehicle, { rentalHealth: health ?? null, locale })
    : null;
  const badge = resolveDrawerVehicleReasonBadge(row, locale, fleetDisplay?.reasonBadge ?? null);
  if (!badge || isHandoverTimingReason(badge.text)) return null;
  return badge;
}

function drawerReasonTone(
  tone: FleetReasonBadge['tone'],
): DrawerVehicleReasonBadge['tone'] {
  if (tone === 'critical') return 'critical';
  if (tone === 'watch' || tone === 'warning') return 'watch';
  if (tone === 'success') return 'success';
  return 'neutral';
}

/** Primary reason chip for shared drawer vehicle rows — fleet display first, then runtime reasons. */
export function resolveDrawerVehicleReasonBadge(
  row: DashboardSliceRow,
  locale: string,
  fleetReason: FleetReasonBadge | null,
): DrawerVehicleReasonBadge | null {
  if (fleetReason) {
    return { text: fleetReason.text, tone: drawerReasonTone(fleetReason.tone) };
  }

  const reasons = dedupeDisplayReasons(row.reasons ?? []);
  if (reasons.length > 0) {
    const primary = reasons[0];
    const tone =
      primary.severity === 'critical'
        ? 'critical'
        : primary.severity === 'warning'
          ? 'watch'
          : 'neutral';
    return {
      text: sanitizeUserFacingIssueText(formatRuntimeReasonLabel(primary, locale))!,
      tone,
    };
  }

  const meta = sanitizeUserFacingIssueText(row.meta);
  if (meta) {
    const tone =
      row.severity === 'critical'
        ? 'critical'
        : row.severity === 'warning'
          ? 'watch'
          : 'neutral';
    return { text: meta, tone };
  }

  return null;
}

export function composeBookingDrawerRowDisplay(row: DashboardSliceRow): {
  title: string;
  subtitle?: string;
  meta?: string;
} {
  return {
    title: sanitizeUserFacingIssueText(row.title) || row.title,
    subtitle: sanitizeUserFacingIssueText(row.subtitle),
    meta: sanitizeUserFacingIssueText(row.meta),
  };
}

/** Client-side haystack for operative vehicle drawer search. */
export function dashboardDrawerRowHaystack(
  row: DashboardSliceRow,
  state: VehicleRuntimeState | undefined,
  locale: string,
): string {
  const reasonParts = (row.reasons ?? []).map((reason) => formatRuntimeReasonLabel(reason, locale));
  const parts = [
    state?.license,
    row.title,
    row.subtitle,
    row.meta,
    row.stationLabel,
    state?.stationLabel,
    state?.displayName,
    ...reasonParts,
  ];
  return parts
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase();
}

/** @deprecated Use dashboardDrawerRowHaystack */
export function readyToRentDrawerRowHaystack(
  row: DashboardSliceRow,
  state: VehicleRuntimeState | undefined,
): string {
  return dashboardDrawerRowHaystack(row, state, 'en');
}

export function filterDashboardDrawerGroups(
  groups: DashboardDrawerGroup[],
  vehicleStates: Map<string, VehicleRuntimeState>,
  query: string,
  locale: string,
): DashboardDrawerGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;

  return groups
    .map((group) => {
      const rows = group.rows.filter((row) => {
        const state = row.vehicleId ? vehicleStates.get(row.vehicleId) : undefined;
        return dashboardDrawerRowHaystack(row, state, locale).includes(q);
      });
      return { ...group, rows, count: rows.length };
    })
    .filter((group) => group.rows.length > 0);
}

/** @deprecated Use filterDashboardDrawerGroups */
export function filterReadyToRentDrawerGroups(
  groups: DashboardDrawerGroup[],
  vehicleStates: Map<string, VehicleRuntimeState>,
  query: string,
): DashboardDrawerGroup[] {
  return filterDashboardDrawerGroups(groups, vehicleStates, query, 'en');
}
