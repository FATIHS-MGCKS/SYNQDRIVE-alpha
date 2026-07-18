import type { Station, StationOpeningHours, StationOverviewStats, StationSummaryReadModel } from '../../lib/api';
import type { StatusTone } from '../../components/patterns';
import {
  stationExpectsHomeFleet,
  summaryHasPickupEnabled,
  summaryHasReturnEnabled,
  STATION_TYPES_EXPECTING_HOME_FLEET,
} from './station-org-summaries.utils';

export function formatStationAddress(station: Pick<Station, 'address' | 'addressLine1' | 'addressLine2' | 'postalCode' | 'city' | 'country'>): string {
  const line1 = station.addressLine1 ?? station.address;
  const parts = [line1, station.addressLine2, [station.postalCode, station.city].filter(Boolean).join(' '), station.country]
    .filter((p) => typeof p === 'string' && p.trim().length > 0);
  return parts.join(', ');
}

export function openingHoursIsMissing(openingHours: Station['openingHours']): boolean {
  if (openingHours == null) return true;
  if (typeof openingHours === 'string') return openingHours.trim().length === 0;
  if (typeof openingHours === 'object') {
    const legacy = (openingHours as Record<string, unknown>).legacyText;
    if (typeof legacy === 'string' && legacy.trim()) return false;
    return Object.keys(openingHours).length === 0;
  }
  return true;
}

export type StationWarningKey =
  | 'missingCoordinates'
  | 'missingOpeningHours'
  | 'missingPickupReturnRules'
  | 'noVehicles'
  | 'missingGeofence';

export function getStationWarningsFromSummary(
  summary: StationSummaryReadModel,
): StationWarningKey[] {
  const warnings: StationWarningKey[] = [];
  const stationType = summary.lifecycle.type;
  const isActive = summary.lifecycle.status === 'ACTIVE';
  const expectsOperationalSetup = STATION_TYPES_EXPECTING_HOME_FLEET.has(stationType);

  if (summary.configurationProblems.some((problem) => problem.code.includes('COORDINATES'))) {
    if (expectsOperationalSetup || summaryHasPickupEnabled(summary) || summaryHasReturnEnabled(summary)) {
      warnings.push('missingCoordinates');
    }
  }
  if (
    expectsOperationalSetup &&
    summary.configurationProblems.some((problem) => problem.code.includes('OPENING_HOURS'))
  ) {
    warnings.push('missingOpeningHours');
  }
  if (
    isActive &&
    expectsOperationalSetup &&
    !summaryHasPickupEnabled(summary) &&
    !summaryHasReturnEnabled(summary)
  ) {
    warnings.push('missingPickupReturnRules');
  }
  if (stationExpectsHomeFleet(summary)) {
    const homeFleet = summary.kpis.metrics.homeFleetCount;
    if (homeFleet.known && (homeFleet.value ?? 0) <= 0) {
      warnings.push('noVehicles');
    }
  }
  if (
    expectsOperationalSetup &&
    summary.configurationProblems.some((problem) => problem.code.includes('GEOFENCE'))
  ) {
    warnings.push('missingGeofence');
  }
  return warnings;
}

export function stationHasProblemsFromSummary(summary: StationSummaryReadModel): boolean {
  return (
    getStationWarningsFromSummary(summary).length > 0 ||
    summary.operationalWarnings.length > 0 ||
    !summary.partialData.complete
  );
}

export function getStationWarnings(
  station: Station,
  stats?: StationOverviewStats | null,
  summary?: StationSummaryReadModel | null,
): StationWarningKey[] {
  if (summary) {
    return getStationWarningsFromSummary(summary);
  }
  const warnings: StationWarningKey[] = [];
  const missingCoords =
    stats?.hasMissingCoordinates ??
    (station.latitude == null || station.longitude == null);
  if (missingCoords) warnings.push('missingCoordinates');
  if (stats?.hasMissingOpeningHours ?? openingHoursIsMissing(station.openingHours)) {
    warnings.push('missingOpeningHours');
  }
  if (stats?.hasMissingPickupReturnRules ?? (!station.pickupEnabled && !station.returnEnabled)) {
    warnings.push('missingPickupReturnRules');
  }
  const vehicles = stats?.totalVehicles ?? station.vehicleCount ?? 0;
  if (vehicles <= 0) warnings.push('noVehicles');
  if (station.latitude != null && station.longitude != null && !station.radiusMeters) {
    warnings.push('missingGeofence');
  }
  return warnings;
}

export function stationHasProblems(
  station: Station,
  stats?: StationOverviewStats | null,
  summary?: StationSummaryReadModel | null,
): boolean {
  if (summary) {
    return stationHasProblemsFromSummary(summary);
  }
  return getStationWarnings(station, stats).length > 0;
}

export function stationStatusTone(status: Station['status']): StatusTone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'ARCHIVED') return 'neutral';
  return 'warning';
}

export function stationTypeTone(type: Station['type']): StatusTone {
  if (type === 'MAIN') return 'info';
  if (type === 'PARTNER' || type === 'TEMPORARY') return 'warning';
  return 'neutral';
}

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export function defaultWeeklyHours(): StationOpeningHours {
  const base: StationOpeningHours = {};
  for (const day of WEEKDAYS) {
    base[day] = day === 'sunday' ? { closed: true } : { open: '08:00', close: '18:00' };
  }
  return base;
}

export function parseOpeningHours(raw: Station['openingHours']): StationOpeningHours {
  if (!raw) return defaultWeeklyHours();
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as StationOpeningHours;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      return { legacyText: raw } as StationOpeningHours;
    }
    return { legacyText: raw } as StationOpeningHours;
  }
  return raw;
}

export function formatOpeningHoursSummary(hours: StationOpeningHours): string {
  if ('legacyText' in hours && typeof hours.legacyText === 'string') return hours.legacyText;
  const openDays = WEEKDAYS.filter((d) => {
    const slot = hours[d];
    return slot && !slot.closed;
  });
  if (openDays.length === 0) return '—';
  if (openDays.length === 7) {
    const mon = hours.monday;
    if (mon?.open && mon?.close) return `Mo–So ${mon.open}–${mon.close}`;
  }
  return `${openDays.length} Tage/Woche`;
}
