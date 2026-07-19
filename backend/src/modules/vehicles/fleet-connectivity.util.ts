import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import {
  legacyConnectionStatusNote,
  mapTelemetryFreshnessToLegacyConnectionStatus,
  resolveTelemetryFreshness,
  TELEMETRY_FRESH_THRESHOLD_MS,
  TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
  type TelemetryTimestampEvidence,
} from './telemetry-freshness.resolver';
import { projectLegacyFleetConnectivityFields } from './connectivity/vehicle-connectivity-runtime-legacy.projection';
import { serializeVehicleConnectivityRuntimeState } from './connectivity/vehicle-connectivity-runtime-state.dto';
import type { VehicleConnectivityRuntimeState } from './connectivity/domain/connectivity-domain.types';
import {
  assembleVehicleConnectivityRuntimeState,
  type ConnectivityRuntimeVehicleRow,
} from './connectivity/vehicle-connectivity-runtime-batch.assembler';
import { DeviceConnectionEpisodeStatus } from '@prisma/client';
import {
  buildFleetDataCoverage,
  mapCoverageStateToLegacyReadinessLevel,
  resolveFleetDeviceClass,
  resolveFleetPowertrainClass,
  resolveFleetProviderClass,
} from './fleet-data-coverage';
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
  onlineMaxMinutes: TELEMETRY_FRESH_THRESHOLD_MS / 60_000,
  standbyMaxHours: TELEMETRY_STANDBY_THRESHOLD_MS / 3_600_000,
  signalDelayedMaxHours: TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS / 3_600_000,
};

/** @deprecated Use TELEMETRY_FRESH_THRESHOLD_MS from telemetry-freshness.resolver */
export const ONLINE_MAX_MS = TELEMETRY_FRESH_THRESHOLD_MS;
/** @deprecated Use TELEMETRY_STANDBY_THRESHOLD_MS from telemetry-freshness.resolver */
export const STANDBY_MAX_MS = TELEMETRY_STANDBY_THRESHOLD_MS;
/** @deprecated Use TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS from telemetry-freshness.resolver */
export const SIGNAL_DELAYED_MAX_MS = TELEMETRY_SIGNAL_DELAYED_THRESHOLD_MS;
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
  telemetryEvidence: TelemetryTimestampEvidence,
  nowMs: number,
): {
  connectionStatus: FleetConnectionStatus;
  telemetryFreshness: ReturnType<typeof resolveTelemetryFreshness>['freshness'];
  statusNote: string;
  diffMs: number;
} {
  if (!hasProviderLink) {
    return {
      connectionStatus: 'not_connected',
      telemetryFreshness: 'no_signal',
      statusNote: legacyConnectionStatusNote('not_connected', 'no_signal', null),
      diffMs: -1,
    };
  }

  const resolved = resolveTelemetryFreshness(telemetryEvidence, nowMs);
  const connectionStatus = mapTelemetryFreshnessToLegacyConnectionStatus(
    resolved.freshness,
    hasProviderLink,
  );

  return {
    connectionStatus,
    telemetryFreshness: resolved.freshness,
    statusNote: legacyConnectionStatusNote(
      connectionStatus,
      resolved.freshness,
      resolved.ageMs,
    ),
    diffMs: resolved.ageMs ?? -1,
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
  fuelType?: string | null;
  hardwareType?: string | null;
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
    sourceTimestamp?: Date | null;
    providerFetchedAt?: Date | null;
    updatedAt?: Date | null;
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

/** Builds canonical runtime state from fleet-connectivity list inputs (tests + admin). */
export function buildFleetConnectivityRuntimeForInput(
  v: FleetConnectivityVehicleInput,
  nowMs: number,
  deviceConnection: FleetDeviceConnectionDto | null = null,
): VehicleConnectivityRuntimeState {
  const dv = v.dimoVehicle;
  const ls = v.latestState;
  const openEpisodes: ConnectivityRuntimeVehicleRow['deviceConnectionEpisodes'] = [];

  if (deviceConnection?.openUnpluggedEpisode) {
    openEpisodes.push({
      id: 'synthetic-open-episode',
      deviceBindingId: 'synthetic-link',
      openedAt: deviceConnection.openUnpluggedSince
        ? new Date(deviceConnection.openUnpluggedSince)
        : new Date(nowMs),
      status: DeviceConnectionEpisodeStatus.OPEN,
      resolutionMethod: null,
      resolutionEvidenceAt: null,
    });
  }

  const row: ConnectivityRuntimeVehicleRow = {
    id: v.id,
    organizationId: 'org-synthetic',
    hardwareType: v.hardwareType ?? null,
    fuelType: v.fuelType ?? null,
    dimoVehicleId: dv ? 'dimo-linked' : null,
    dimoVehicle: dv
      ? {
          connectionStatus: 'CONNECTED',
          tokenId: dv.tokenId,
          lastSignal: dv.lastSignal,
        }
      : null,
    latestState: ls
      ? {
          lastSeenAt: ls.lastSeenAt,
          providerFetchedAt: ls.providerFetchedAt ?? null,
          sourceTimestamp: ls.sourceTimestamp ?? ls.lastSeenAt,
          providerSource: ls.providerSource,
          providerBindingId: null,
          rawPayloadJson: ls.rawPayloadJson,
          latitude: ls.latitude,
          longitude: ls.longitude,
          speedKmh: ls.speedKmh,
          odometerKm: ls.odometerKm,
          fuelLevelRelative: ls.fuelLevelRelative,
          fuelLevelAbsolute: ls.fuelLevelAbsolute,
          evSoc: ls.evSoc,
          obdDtcList: ls.obdDtcList,
          lastDtcPollAt: ls.lastDtcPollAt,
        }
      : null,
    dataSourceLinks: dv
      ? [
          {
            id: 'synthetic-link',
            sourceType: 'DIMO',
            sourceSubtype: null,
            isActive: true,
            provider: 'DIMO',
          },
        ]
      : [],
    providerConsents: dv
      ? [
          {
            organizationId: 'org-synthetic',
            provider: 'DIMO',
            status: 'ACTIVE',
            grantedAt: new Date('2026-01-01'),
            expiresAt: null,
            revokedAt: null,
          },
        ]
      : [],
    deviceConnectionEpisodes: openEpisodes,
  };

  return assembleVehicleConnectivityRuntimeState(row, null, nowMs);
}

/** Convenience wrapper — builds runtime then maps (tests and legacy callers). */
export function mapFleetConnectivityVehicleWithRuntime(
  v: FleetConnectivityVehicleInput,
  nowMs: number,
  deviceConnection: FleetDeviceConnectionDto | null = null,
): FleetConnectivityVehicleDto {
  const runtime = buildFleetConnectivityRuntimeForInput(v, nowMs, deviceConnection);
  return mapFleetConnectivityVehicle(v, nowMs, deviceConnection, runtime);
}

export function mapFleetConnectivityVehicle(
  v: FleetConnectivityVehicleInput,
  nowMs: number,
  deviceConnection: FleetDeviceConnectionDto | null = null,
  connectivityRuntime: VehicleConnectivityRuntimeState,
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

  const telemetryEvidence: TelemetryTimestampEvidence = {
    providerObservedAt: ls?.sourceTimestamp ?? null,
    lastValidTelemetryAt: ls?.sourceTimestamp ?? ls?.lastSeenAt ?? null,
    receivedAt: ls?.providerFetchedAt ?? null,
    lastSignal: dv?.lastSignal ?? null,
    latestStateUpdatedAt: ls?.lastSeenAt ?? ls?.updatedAt ?? null,
  };

  const resolvedObserved = resolveTelemetryFreshness(telemetryEvidence, nowMs);
  const legacy = projectLegacyFleetConnectivityFields(
    connectivityRuntime,
    resolvedObserved.ageMs,
  );
  const { connectionStatus, telemetryFreshness, statusNote, online } = legacy;
  const freshnessLabel = deriveFreshnessLabel(resolvedObserved.observedAtMs, nowMs);
  const lastSyncedAt = toIsoString(dv?.syncedAt ?? null);

  const rawSignals = (ls?.rawPayloadJson ?? null) as Record<
    string,
    unknown
  > | null;
  const conn = extractConnectivitySnapshot(rawSignals ?? undefined);

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

  const powertrain = resolveFleetPowertrainClass(v.fuelType);
  const deviceClass = resolveFleetDeviceClass({
    hardwareType: v.hardwareType,
    hasAftermarketDevice: hasAftermarket,
    hasSyntheticDevice: hasSynthetic,
    hasProviderLink,
  });
  const providerClass = resolveFleetProviderClass(
    hasProviderLink,
    ls?.providerSource,
  );
  const dataCoverage = buildFleetDataCoverage({
    context: {
      provider: providerClass,
      deviceClass,
      powertrain,
      physicalObdCapable: v.hardwareType === 'LTE_R1' || hasAftermarket,
      hasProviderLink,
      hasTelemetrySnapshot: hasTelemetry,
    },
    observation: {
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
      hasTelemetry,
      rawSignals,
    },
    telemetryFreshness: connectivityRuntime.telemetryState,
  });

  const coveragePercent = dataCoverage.coveragePercent;
  const signalCoveragePercent = coveragePercent ?? 0;
  const readinessScore = signalCoveragePercent;
  const readinessLevel = mapCoverageStateToLegacyReadinessLevel(
    connectivityRuntime.dataCoverageState,
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
    telemetryFreshness,
    statusNote,
    lastSeenAt: resolvedObserved.observedAtIso,
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
    coverageState: connectivityRuntime.dataCoverageState,
    coveragePercent,
    expectedSignalCount: dataCoverage.expectedSignalCount,
    freshSignalCount: dataCoverage.freshSignalCount,
    staleSignalCount: dataCoverage.staleSignalCount,
    missingSignalCount: dataCoverage.missingSignalCount,
    reasonCodes: dataCoverage.reasonCodes,
    signals,
    deviceSerial: maskedDeviceSerial,
    dimoTokenId: null,
    syntheticTokenId: null,
    online,
    deviceConnection,
    connectivityRuntime: serializeVehicleConnectivityRuntimeState(connectivityRuntime),
  };
}

export function buildFleetConnectivitySummary(
  vehicles: FleetConnectivityVehicleDto[],
): FleetConnectivitySummary {
  const connected = vehicles.filter((v) => v.connectionStatus !== 'not_connected')
    .length;
  const withTelemetry = vehicles.filter((v) => v.hasTelemetry).length;
  const coverageValues = vehicles
    .map((v) => v.coveragePercent ?? v.signalCoveragePercent)
    .filter((n): n is number => n != null && Number.isFinite(n));
  const readinessValues = vehicles
    .map((v) => v.readinessScore)
    .filter((n) => Number.isFinite(n));

  return {
    total: vehicles.length,
    online: vehicles.filter((v) => v.telemetryFreshness === 'live').length,
    standby: vehicles.filter((v) => v.telemetryFreshness === 'standby').length,
    signalDelayed: vehicles.filter((v) => v.telemetryFreshness === 'signal_delayed').length,
    offline: vehicles.filter((v) =>
      v.telemetryFreshness === 'offline' || v.telemetryFreshness === 'no_signal',
    ).length,
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
