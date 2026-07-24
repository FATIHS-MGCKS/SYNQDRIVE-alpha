import type { LiveTelemetrySnapshot } from './telemetry-field-semantics';
import {
  mergeGpsMeasuredAt,
  shouldAcceptNewerMeasurement,
} from './telemetry-timestamp-semantics';
import type { VehicleLiveMapData } from '../stores/useVehicleLiveMapStore';

/** GPS / map position fields — owned by live-gps channel. */
export const VEHICLE_LIVE_MAP_GPS_FIELDS = [
  'locationHistory',
  'lastConfirmedPosition',
  'lastLocationAt',
  'gpsSource',
  'targetPosition',
  'heading',
  'isMoving',
] as const satisfies ReadonlyArray<keyof VehicleLiveMapData>;

/** Dashboard / snapshot fields — owned by telemetry dashboard channel. */
export const VEHICLE_LIVE_MAP_DASHBOARD_FIELDS = [
  'snapshot',
  'isLiveTracking',
  'loading',
  'error',
  'displayState',
  'displayIgnition',
  'displaySpeed',
  'displayCoolant',
  'displayEngineLoad',
  'tripDetectionState',
] as const satisfies ReadonlyArray<keyof VehicleLiveMapData>;

/** Shared freshness fields — merged with provider timestamp ordering. */
export const VEHICLE_LIVE_MAP_FRESHNESS_FIELDS = [
  'measuredAt',
  'receivedAt',
  'lastSignal',
  'signalAgeMs',
  'isFresh',
  'telemetryFreshness',
  'onlineStatus',
] as const satisfies ReadonlyArray<keyof VehicleLiveMapData>;

export type VehicleLiveMapGpsField = (typeof VEHICLE_LIVE_MAP_GPS_FIELDS)[number];
export type VehicleLiveMapDashboardField = (typeof VEHICLE_LIVE_MAP_DASHBOARD_FIELDS)[number];

export interface VehicleLiveMapBinding {
  vehicleId: string;
  orgId: string;
  generation: number;
}

export function isVehicleLiveMapBindingCurrent(
  state: Pick<VehicleLiveMapData, 'boundVehicleId' | 'boundOrgId' | 'boundGeneration'>,
  binding: VehicleLiveMapBinding,
): boolean {
  return (
    state.boundVehicleId === binding.vehicleId &&
    state.boundOrgId === binding.orgId &&
    state.boundGeneration === binding.generation
  );
}

/**
 * Merge dashboard snapshot fields without inventing zero defaults.
 * Incoming `null` preserves the previous confirmed value.
 */
export function mergeLiveTelemetrySnapshot(
  current: LiveTelemetrySnapshot | null,
  incoming: LiveTelemetrySnapshot,
): LiveTelemetrySnapshot {
  if (!current) return incoming;
  return {
    speed: incoming.speed ?? current.speed,
    fuel: incoming.fuel ?? current.fuel,
    coolant: incoming.coolant ?? current.coolant,
    battery: incoming.battery ?? current.battery,
    lvBatteryVoltage: incoming.lvBatteryVoltage ?? current.lvBatteryVoltage,
    odometer: incoming.odometer ?? current.odometer,
    engineLoad: incoming.engineLoad ?? current.engineLoad,
    rangeKm: incoming.rangeKm ?? current.rangeKm,
    tractionBatteryTemperatureC:
      incoming.tractionBatteryTemperatureC ?? current.tractionBatteryTemperatureC,
    headingDeg: incoming.headingDeg ?? current.headingDeg,
    accuracyM: incoming.accuracyM ?? current.accuracyM,
    ignitionOn: incoming.ignitionOn ?? current.ignitionOn,
  };
}

function mergeFreshnessFields(
  current: VehicleLiveMapData,
  patch: Partial<VehicleLiveMapData>,
): Partial<VehicleLiveMapData> {
  const merged: Partial<VehicleLiveMapData> = {};
  const incomingMeasuredAt = patch.measuredAt ?? null;
  const canAcceptTimestamp =
    incomingMeasuredAt == null ||
    shouldAcceptNewerMeasurement(
      current.measuredAt ?? current.lastSignal,
      incomingMeasuredAt,
    );

  for (const key of VEHICLE_LIVE_MAP_FRESHNESS_FIELDS) {
    if (!(key in patch) || patch[key] === undefined) continue;
    if (
      (key === 'measuredAt' || key === 'lastSignal' || key === 'receivedAt') &&
      !canAcceptTimestamp
    ) {
      continue;
    }
    merged[key] = patch[key] as never;
  }

  return merged;
}

/**
 * Apply a partial patch onto the latest store row.
 * GPS and dashboard domains are independent — neither channel clears the other.
 */
export function mergeVehicleLiveMapState(
  current: VehicleLiveMapData,
  patch: Partial<VehicleLiveMapData>,
): VehicleLiveMapData {
  const next: VehicleLiveMapData = { ...current };

  if (patch.snapshot !== undefined) {
    next.snapshot = mergeLiveTelemetrySnapshot(current.snapshot, patch.snapshot);
  }

  const freshness = mergeFreshnessFields(current, patch);
  Object.assign(next, freshness);

  if (patch.speedKmh !== undefined) {
    next.speedKmh = patch.speedKmh;
  }

  for (const key of VEHICLE_LIVE_MAP_GPS_FIELDS) {
    if (patch[key] !== undefined) {
      next[key] = patch[key] as never;
    }
  }

  for (const key of VEHICLE_LIVE_MAP_DASHBOARD_FIELDS) {
    if (patch[key] !== undefined) {
      next[key] = patch[key] as never;
    }
  }

  return next;
}

export interface GpsTimestampPatchInput {
  measuredAt?: string | null;
  lastSeenAt?: string | null;
  receivedAt?: string | null;
  source?: 'dimo' | 'cache' | null;
}

/** Merge GPS freshness timestamps using provider ordering rules. */
export function mergeGpsFreshnessPatch(
  current: VehicleLiveMapData,
  gps: GpsTimestampPatchInput,
): Partial<VehicleLiveMapData> {
  const merged = mergeGpsMeasuredAt(current, gps);
  const displayPatch: Partial<VehicleLiveMapData> = {};

  if (merged.measuredAt !== current.measuredAt) {
    displayPatch.measuredAt = merged.measuredAt ?? null;
  }
  if (merged.lastSignal !== current.lastSignal) {
    displayPatch.lastSignal = merged.lastSignal ?? current.lastSignal;
  }
  if (merged.receivedAt !== current.receivedAt) {
    displayPatch.receivedAt = merged.receivedAt ?? null;
  }

  return mergeFreshnessFields(current, displayPatch);
}

/** Reject stale GPS coordinates based on provider measurement time. */
export function canApplyGpsCoordinates(
  current: Pick<VehicleLiveMapData, 'measuredAt' | 'lastSignal'>,
  incomingMeasuredAt: string | null | undefined,
): boolean {
  return (
    incomingMeasuredAt == null ||
    shouldAcceptNewerMeasurement(
      current.measuredAt ?? current.lastSignal,
      incomingMeasuredAt,
    )
  );
}
