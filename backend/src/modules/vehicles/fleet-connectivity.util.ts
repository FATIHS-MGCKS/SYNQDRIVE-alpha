import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import type {
  FleetConnectionStatus,
  FleetConnectivityJammingSnapshot,
  FleetConnectivitySignals,
  FleetConnectivitySummary,
  FleetConnectivityThresholds,
  FleetConnectivityVehicleDto,
  FleetDeviceConnectionDto,
  FleetReadinessLevel,
  FleetSignalAvailability,
} from './fleet-connectivity.types';

export const FLEET_CONNECTIVITY_THRESHOLDS: FleetConnectivityThresholds = {
  onlineMaxMinutes: 15,
  standbyMaxHours: 24,
};

export const ONLINE_MAX_MS = FLEET_CONNECTIVITY_THRESHOLDS.onlineMaxMinutes * 60 * 1000;
export const STANDBY_MAX_MS = FLEET_CONNECTIVITY_THRESHOLDS.standbyMaxHours * 60 * 60 * 1000;
export const FLEET_CONNECTIVITY_HARD_LIMIT = 1000;
export const DEFAULT_FLEET_CONNECTIVITY_LIMIT = 100;
export const MAX_FLEET_CONNECTIVITY_PAGE_LIMIT = 500;

const SIGNAL_KEYS = [
  'gps',
  'odometer',
  'speed',
  'fuel',
  'evSoc',
  'dtc',
  'obdPlug',
  'jamming',
] as const;

export function maskSensitiveId(
  value: string | number | null | undefined,
): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length <= 2) return '*'.repeat(s.length);
  if (s.length <= 6) return `${s[0]}…${s[s.length - 1]}`;
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

export function parseTimestampMs(
  value: Date | string | null | undefined,
): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms;
}

export function toIsoString(
  value: Date | string | null | undefined,
): string | null {
  const ms = parseTimestampMs(value);
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

export function deriveConnectionStatus(
  hasProviderLink: boolean,
  lastSeenMs: number | null,
  nowMs: number,
): {
  connectionStatus: FleetConnectionStatus;
  statusNote: string;
  diffMs: number;
} {
  if (!hasProviderLink) {
    return {
      connectionStatus: 'not_connected',
      statusNote:
        'Fahrzeug ist mit keiner DIMO-/Provider-Datenquelle verknüpft',
      diffMs: -1,
    };
  }

  if (lastSeenMs == null) {
    return {
      connectionStatus: 'offline',
      statusNote:
        'Keine verwertbaren Signale — Verbindung ohne aktuellen Telemetrie-Feed',
      diffMs: -1,
    };
  }

  const diffMs = nowMs - lastSeenMs;
  if (diffMs < 0) {
    return {
      connectionStatus: 'offline',
      statusNote:
        'Signalzeitstempel ungültig — letzte Meldung liegt in der Zukunft',
      diffMs,
    };
  }

  if (diffMs < ONLINE_MAX_MS) {
    return {
      connectionStatus: 'online',
      statusNote:
        'Telemetrie wird aktiv empfangen (letztes Signal innerhalb von 15 Minuten)',
      diffMs,
    };
  }

  if (diffMs < STANDBY_MAX_MS) {
    return {
      connectionStatus: 'standby',
      statusNote:
        'Kein frisches Signal — Fahrzeug vermutlich geparkt oder inaktiv (letztes Signal innerhalb von 24 Stunden)',
      diffMs,
    };
  }

  const days = Math.round(diffMs / 86_400_000);
  return {
    connectionStatus: 'offline',
    statusNote:
      days > 7
        ? 'Seit über 7 Tagen kein Signal — Verbindung möglicherweise unterbrochen oder Gerät sendet nicht mehr'
        : 'Kein Signal innerhalb der letzten 24 Stunden — Verbindung unterbrochen oder Gerät sendet nicht',
    diffMs,
  };
}

export function deriveFreshnessLabel(
  lastSeenMs: number | null,
  nowMs: number,
): string {
  if (lastSeenMs == null) return 'Unknown';
  const diffMs = nowMs - lastSeenMs;
  if (diffMs < 0) return 'Invalid timestamp';
  const mins = diffMs / 60_000;
  if (mins < 5) return 'Live';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function hasRawSignal(
  signals: Record<string, unknown> | null,
  key: string,
): boolean {
  if (!signals) return false;
  const field = signals[key];
  if (field == null) return false;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    return (field as { value?: unknown }).value != null;
  }
  return true;
}

function hasDtcData(
  obdDtcList: unknown,
  lastDtcPollAt: Date | string | null | undefined,
): boolean {
  if (lastDtcPollAt != null && parseTimestampMs(lastDtcPollAt) != null) {
    return true;
  }
  if (Array.isArray(obdDtcList)) return true;
  if (obdDtcList != null && typeof obdDtcList === 'object') {
    return Object.keys(obdDtcList as object).length > 0;
  }
  return false;
}

function resolveSignalAvailability(
  hasTelemetry: boolean,
  hasRawPayload: boolean,
  isAvailable: boolean,
  rawKeyPresent: boolean,
): FleetSignalAvailability {
  if (isAvailable) return 'available';
  if (!hasTelemetry && !hasRawPayload) return 'unknown';
  if (rawKeyPresent || hasTelemetry) return 'missing';
  return 'unknown';
}

export function deriveFleetSignals(input: {
  hasTelemetry: boolean;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  odometerKm: number | null | undefined;
  speedKmh: number | null | undefined;
  fuelLevelRelative: number | null | undefined;
  fuelLevelAbsolute: number | null | undefined;
  evSoc: number | null | undefined;
  obdDtcList: unknown;
  lastDtcPollAt: Date | string | null | undefined;
  obdIsPluggedIn: boolean | null;
  jammingDetectedCount: number;
  rawSignals: Record<string, unknown> | null;
}): FleetConnectivitySignals {
  const raw = input.rawSignals;
  const hasRaw = raw != null && typeof raw === 'object';

  const gpsAvailable =
    (input.latitude != null && input.longitude != null) ||
    hasRawSignal(raw, 'currentLocationCoordinates');

  const odometerAvailable =
    input.odometerKm != null ||
    hasRawSignal(raw, 'powertrainTransmissionTravelledDistance');

  const speedAvailable =
    input.speedKmh != null || hasRawSignal(raw, 'speed');

  const fuelAvailable =
    input.fuelLevelRelative != null ||
    input.fuelLevelAbsolute != null ||
    hasRawSignal(raw, 'powertrainFuelSystemRelativeLevel') ||
    hasRawSignal(raw, 'powertrainFuelSystemAbsoluteLevel');

  const evSocAvailable =
    input.evSoc != null ||
    hasRawSignal(raw, 'powertrainTractionBatteryStateOfChargeCurrent');

  const dtcAvailable =
    hasDtcData(input.obdDtcList, input.lastDtcPollAt) ||
    hasRawSignal(raw, 'obdDTCList') ||
    hasRawSignal(raw, 'obdDtcList');

  const obdPlugRawPresent = hasRawSignal(raw, 'obdIsPluggedIn');
  const obdPlugAvailable = input.obdIsPluggedIn != null;

  const jammingRawPresent = hasRawSignal(
    raw,
    'connectivityCellularIsJammingDetected',
  );
  const jammingAvailable =
    input.jammingDetectedCount > 0 || jammingRawPresent;

  return {
    gps: resolveSignalAvailability(
      input.hasTelemetry,
      hasRaw,
      gpsAvailable,
      hasRawSignal(raw, 'currentLocationCoordinates'),
    ),
    odometer: resolveSignalAvailability(
      input.hasTelemetry,
      hasRaw,
      odometerAvailable,
      hasRawSignal(raw, 'powertrainTransmissionTravelledDistance'),
    ),
    speed: resolveSignalAvailability(
      input.hasTelemetry,
      hasRaw,
      speedAvailable,
      hasRawSignal(raw, 'speed'),
    ),
    fuel: resolveSignalAvailability(
      input.hasTelemetry,
      hasRaw,
      fuelAvailable,
      hasRawSignal(raw, 'powertrainFuelSystemRelativeLevel') ||
        hasRawSignal(raw, 'powertrainFuelSystemAbsoluteLevel'),
    ),
    evSoc: resolveSignalAvailability(
      input.hasTelemetry,
      hasRaw,
      evSocAvailable,
      hasRawSignal(raw, 'powertrainTractionBatteryStateOfChargeCurrent'),
    ),
    dtc: resolveSignalAvailability(
      input.hasTelemetry,
      hasRaw,
      dtcAvailable,
      hasRawSignal(raw, 'obdDTCList') || hasRawSignal(raw, 'obdDtcList'),
    ),
    obdPlug: resolveSignalAvailability(
      input.hasTelemetry,
      hasRaw,
      obdPlugAvailable,
      obdPlugRawPresent,
    ),
    jamming: resolveSignalAvailability(
      input.hasTelemetry,
      hasRaw,
      jammingAvailable,
      jammingRawPresent,
    ),
  };
}

export function computeSignalCoveragePercent(
  signals: FleetConnectivitySignals,
): number {
  let known = 0;
  let available = 0;
  for (const key of SIGNAL_KEYS) {
    const status = signals[key];
    if (status === 'unknown') continue;
    known += 1;
    if (status === 'available') available += 1;
  }
  if (known === 0) return 0;
  return Math.round((available / known) * 100);
}

export function deriveReadinessLevel(
  score: number,
  hasProviderLink: boolean,
  hasTelemetry: boolean,
  signals: FleetConnectivitySignals,
): FleetReadinessLevel {
  const hasKnownSignal = SIGNAL_KEYS.some((k) => signals[k] !== 'unknown');
  if (!hasProviderLink || (!hasTelemetry && !hasKnownSignal)) {
    return 'no_data';
  }
  if (score <= 0 && !hasKnownSignal) return 'no_data';
  if (score >= 80) return 'good';
  if (score >= 50) return 'watch';
  if (score > 0) return 'warning';
  return 'no_data';
}

export function buildJammingSnapshotIncidents(
  count: number,
  detectedAt: string | null,
  where: string | null,
): FleetConnectivityJammingSnapshot[] {
  if (count <= 0) return [];
  return [
    {
      detectedAt,
      where,
      lastKnownAddress: null,
      isSnapshotIndication: true,
    },
  ];
}

export function buildJammingSnapshotNote(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) {
    return 'Letzter Telemetrie-Snapshot deutet auf mögliches Jamming hin (Momentaufnahme, keine Ereignishistorie).';
  }
  return `Letzter Telemetrie-Snapshot meldet ${count} Jamming-Hinweis(e) — Aggregat aus der Momentaufnahme, keine historische Ereignisliste.`;
}

export interface FleetConnectivityVehicleInput {
  id: string;
  vin: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  homeStation?: { name: string } | null;
  dimoVehicle?: {
    tokenId: number | null;
    lastSignal: Date | null;
    syncedAt: Date | null;
    createdAt: Date;
    rawJson: unknown;
  } | null;
  latestState?: {
    lastSeenAt: Date | null;
    latitude: number | null;
    longitude: number | null;
    speedKmh: number | null;
    odometerKm: number | null;
    fuelLevelRelative: number | null;
    fuelLevelAbsolute: number | null;
    evSoc: number | null;
    obdDtcList: unknown;
    lastDtcPollAt: Date | null;
    rawPayloadJson: unknown;
    providerSource: string | null;
  } | null;
}

export function mapFleetConnectivityVehicle(
  v: FleetConnectivityVehicleInput,
  nowMs: number,
  deviceConnection: FleetDeviceConnectionDto | null = null,
): FleetConnectivityVehicleDto {
  const dv = v.dimoVehicle;
  const ls = v.latestState;
  const raw = (dv?.rawJson ?? {}) as Record<string, unknown>;
  const aftermarket = raw?.aftermarketDevice as
    | { serial?: string; pairedAt?: string }
    | undefined;
  const synthetic = raw?.syntheticDevice as { tokenId?: number } | undefined;

  const hasAftermarket = aftermarket?.serial != null;
  const hasSynthetic = synthetic?.tokenId != null;
  const hasProviderLink = dv != null;
  const connectionType = hasAftermarket
    ? 'Aftermarket Device'
    : hasSynthetic
      ? 'Synthetic Device'
      : dv
        ? 'DIMO'
        : 'Not Connected';
  const sourceType = hasAftermarket
    ? 'OBD-II'
    : hasSynthetic
      ? 'API / Software'
      : dv
        ? 'DIMO Platform'
        : null;

  const lastSeenAtRaw = ls?.lastSeenAt ?? dv?.lastSignal ?? null;
  const lastSeenMs = parseTimestampMs(lastSeenAtRaw);
  const lastSyncedAt = toIsoString(dv?.syncedAt ?? null);

  const rawSignals = (ls?.rawPayloadJson ?? null) as Record<
    string,
    unknown
  > | null;
  const conn = extractConnectivitySnapshot(rawSignals ?? undefined);

  const { connectionStatus, statusNote } = deriveConnectionStatus(
    hasProviderLink,
    lastSeenMs,
    nowMs,
  );
  const freshnessLabel = deriveFreshnessLabel(lastSeenMs, nowMs);

  const hasTelemetry = ls != null;
  const signals = deriveFleetSignals({
    hasTelemetry,
    latitude: ls?.latitude,
    longitude: ls?.longitude,
    odometerKm: ls?.odometerKm,
    speedKmh: ls?.speedKmh,
    fuelLevelRelative: ls?.fuelLevelRelative,
    fuelLevelAbsolute: ls?.fuelLevelAbsolute,
    evSoc: ls?.evSoc,
    obdDtcList: ls?.obdDtcList,
    lastDtcPollAt: ls?.lastDtcPollAt,
    obdIsPluggedIn: conn.obdIsPluggedIn,
    jammingDetectedCount: conn.jammingDetectedCount,
    rawSignals,
  });

  const signalCoveragePercent = computeSignalCoveragePercent(signals);
  const readinessScore = signalCoveragePercent;
  const readinessLevel = deriveReadinessLevel(
    readinessScore,
    hasProviderLink,
    hasTelemetry,
    signals,
  );

  const jammingSnapshotNote = buildJammingSnapshotNote(
    conn.jammingDetectedCount,
  );
  const jammingIncidents = buildJammingSnapshotIncidents(
    conn.jammingDetectedCount,
    conn.jammingIncidents[0]?.detectedAt ?? null,
    conn.jammingIncidents[0]?.where ?? null,
  );

  const maskedDeviceSerial = maskSensitiveId(aftermarket?.serial ?? null);
  const maskedDimoTokenId = maskSensitiveId(dv?.tokenId ?? null);
  const maskedSyntheticTokenId = maskSensitiveId(synthetic?.tokenId ?? null);

  const provider =
    ls?.providerSource?.trim() || (hasProviderLink ? 'DIMO' : 'Not linked');

  return {
    vehicleId: v.id,
    vin: v.vin,
    licensePlate: v.licensePlate ?? null,
    make: v.make,
    model: v.model,
    year: v.year,
    station: v.homeStation?.name ?? null,
    provider,
    connectionType,
    sourceType,
    connectionStatus,
    statusNote,
    lastSeenAt: toIsoString(lastSeenAtRaw),
    lastSyncedAt,
    freshnessLabel,
    pairedAt:
      aftermarket?.pairedAt ??
      toIsoString(dv?.createdAt ?? null) ??
      null,
    hasTelemetry,
    odometerKm:
      ls?.odometerKm != null ? Math.floor(ls.odometerKm) : null,
    latitude: ls?.latitude ?? null,
    longitude: ls?.longitude ?? null,
    obdIsPluggedIn: conn.obdIsPluggedIn,
    jammingDetectedCount: conn.jammingDetectedCount,
    jammingSnapshotNote,
    jammingIncidents,
    maskedDeviceSerial,
    maskedDimoTokenId,
    maskedSyntheticTokenId,
    readinessScore,
    readinessLevel,
    signalCoveragePercent,
    signals,
    deviceSerial: maskedDeviceSerial,
    dimoTokenId: null,
    syntheticTokenId: null,
    online: connectionStatus === 'online',
    deviceConnection,
  };
}

export function buildFleetConnectivitySummary(
  vehicles: FleetConnectivityVehicleDto[],
): FleetConnectivitySummary {
  const connected = vehicles.filter((v) => v.connectionStatus !== 'not_connected')
    .length;
  const withTelemetry = vehicles.filter((v) => v.hasTelemetry).length;
  const coverageValues = vehicles
    .map((v) => v.signalCoveragePercent)
    .filter((n) => Number.isFinite(n));
  const readinessValues = vehicles
    .map((v) => v.readinessScore)
    .filter((n) => Number.isFinite(n));

  return {
    total: vehicles.length,
    online: vehicles.filter((v) => v.connectionStatus === 'online').length,
    standby: vehicles.filter((v) => v.connectionStatus === 'standby').length,
    offline: vehicles.filter((v) => v.connectionStatus === 'offline').length,
    notConnected: vehicles.filter((v) => v.connectionStatus === 'not_connected')
      .length,
    connected,
    withTelemetry,
    withoutTelemetry: Math.max(0, connected - withTelemetry),
    obdPluggedIn: vehicles.filter((v) => v.obdIsPluggedIn === true).length,
    obdUnplugged: vehicles.filter((v) => v.obdIsPluggedIn === false).length,
    obdNoData: vehicles.filter((v) => v.obdIsPluggedIn == null).length,
    jammingSnapshotDetected: vehicles.filter(
      (v) => v.jammingDetectedCount > 0,
    ).length,
    deviceUnpluggedOpenEpisodes: vehicles.filter(
      (v) => v.deviceConnection?.openUnpluggedEpisode === true,
    ).length,
    deviceUnpluggedDuringBooking: vehicles.filter(
      (v) => v.deviceConnection?.duringActiveBooking === true,
    ).length,
    avgSignalCoverage:
      coverageValues.length > 0
        ? Math.round(
            coverageValues.reduce((s, n) => s + n, 0) / coverageValues.length,
          )
        : null,
    avgReadinessScore:
      readinessValues.length > 0
        ? Math.round(
            readinessValues.reduce((s, n) => s + n, 0) / readinessValues.length,
          )
        : null,
  };
}

export function matchesFleetConnectivitySearch(
  vehicle: FleetConnectivityVehicleDto,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    vehicle.vin,
    vehicle.licensePlate,
    vehicle.make,
    vehicle.model,
    vehicle.station,
    vehicle.maskedDeviceSerial,
    vehicle.maskedDimoTokenId,
    vehicle.maskedSyntheticTokenId,
    vehicle.deviceSerial,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function paginateFleetConnectivityVehicles<T>(
  items: T[],
  page: number,
  limit: number,
): { pageItems: T[]; page: number; limit: number; total: number } {
  const safeLimit = Math.max(1, Math.min(limit, MAX_FLEET_CONNECTIVITY_PAGE_LIMIT));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * safeLimit;
  return {
    pageItems: items.slice(start, start + safeLimit),
    page: safePage,
    limit: safeLimit,
    total,
  };
}
