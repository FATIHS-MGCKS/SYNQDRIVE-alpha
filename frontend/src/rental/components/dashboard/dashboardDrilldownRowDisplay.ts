import {
  dedupeDisplayReasons,
  formatRuntimeReasonLabel,
} from './reasonDisplay';
import { sanitizeUserFacingIssueText } from '../../lib/operational-issues';
import type { DashboardSlice, DashboardSliceRow, VehicleRuntimeState } from './runtime';
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

/** Client-side haystack for ready-to-rent drawer search (plate, make, model, station). */
export function readyToRentDrawerRowHaystack(
  row: DashboardSliceRow,
  state: VehicleRuntimeState | undefined,
): string {
  const parts = [
    state?.license,
    row.title,
    row.subtitle,
    row.meta,
    row.stationLabel,
    state?.stationLabel,
    state?.displayName,
  ];
  return parts
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ')
    .toLowerCase();
}

export function filterReadyToRentDrawerGroups(
  groups: DashboardDrawerGroup[],
  vehicleStates: Map<string, VehicleRuntimeState>,
  query: string,
): DashboardDrawerGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;

  return groups
    .map((group) => {
      const rows = group.rows.filter((row) => {
        const state = row.vehicleId ? vehicleStates.get(row.vehicleId) : undefined;
        return readyToRentDrawerRowHaystack(row, state).includes(q);
      });
      return { ...group, rows, count: rows.length };
    })
    .filter((group) => group.rows.length > 0);
}
