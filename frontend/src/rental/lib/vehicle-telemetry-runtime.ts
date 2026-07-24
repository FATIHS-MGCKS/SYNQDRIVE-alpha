import type { TelemetryConnectionState } from '../components/dashboard/runtime/dashboardRuntimeTypes';
import type { VehicleData } from '../data/vehicles';
import { toTelemetryFreshnessInput } from './telemetry-timestamp-semantics';
import {
  resolveTelemetryFreshness,
  type TelemetryFreshness,
  type TelemetryFreshnessState,
  type ResolveTelemetryFreshnessOptions,
} from './telemetryFreshness';

/** Canonical vehicle-detail / fleet telemetry presentation states. */
export type VehicleTelemetryDisplayState =
  | 'unknown'
  | 'live'
  | 'standby'
  | 'soft_offline'
  | 'offline';

export interface VehicleDetailTelemetryFields {
  measuredAt?: string | null;
  receivedAt?: string | null;
  cachedAt?: string | null;
  lastSignal?: string | null;
  signalAgeMs?: number | null;
  onlineStatus?: string | null;
}

/**
 * Single resolver for Vehicle Detail header, overview map, and fleet parity.
 * Never uses cache receipt time (`cachedAt`) for freshness — only provider observation.
 */
export function resolveVehicleDetailTelemetryState(
  fields: VehicleDetailTelemetryFields,
  options: ResolveTelemetryFreshnessOptions = {},
): TelemetryFreshnessState {
  return resolveTelemetryFreshness(toTelemetryFreshnessInput(fields), options);
}

export function mapTelemetryFreshnessToDisplayState(
  freshness: TelemetryFreshness,
): VehicleTelemetryDisplayState {
  switch (freshness) {
    case 'live':
      return 'live';
    case 'standby':
      return 'standby';
    case 'signal_delayed':
      return 'soft_offline';
    case 'offline':
      return 'offline';
    case 'no_signal':
    default:
      return 'unknown';
  }
}

export function isCanonicalTelemetryLive(
  fields: VehicleDetailTelemetryFields,
  options: ResolveTelemetryFreshnessOptions = {},
): boolean {
  return resolveVehicleDetailTelemetryState(fields, options).isLive;
}

/**
 * Maps canonical telemetry freshness to dashboard runtime telemetry state.
 * `no_signal` maps to `offline` so readiness gates align with `isVehicleOffline`.
 */
export function mapTelemetryFreshnessToRuntimeState(
  freshness: TelemetryFreshness,
): TelemetryConnectionState {
  switch (freshness) {
    case 'live':
      return 'live';
    case 'standby':
      return 'standby';
    case 'signal_delayed':
      return 'soft_offline';
    case 'offline':
    case 'no_signal':
      return 'offline';
    default:
      return 'unknown';
  }
}

export function deriveRuntimeTelemetryState(
  vehicle: Pick<
    VehicleData,
    'signalAgeMs' | 'lastSignal' | 'onlineStatus' | 'measuredAt' | 'receivedAt'
  >,
  now: Date | number = Date.now(),
): TelemetryConnectionState {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const fresh = resolveVehicleDetailTelemetryState(vehicle, { now: nowMs });
  return mapTelemetryFreshnessToRuntimeState(fresh.freshness);
}

/** Build fleet-parity input from live map store fields. */
export function vehicleDetailTelemetryFromStore(fields: VehicleDetailTelemetryFields): VehicleDetailTelemetryFields {
  return {
    measuredAt: fields.measuredAt,
    receivedAt: fields.receivedAt,
    lastSignal: fields.lastSignal,
    signalAgeMs: fields.signalAgeMs,
    onlineStatus: fields.onlineStatus,
  };
}
