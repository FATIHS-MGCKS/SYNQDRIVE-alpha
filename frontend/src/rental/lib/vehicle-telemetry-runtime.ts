import type { TelemetryConnectionState } from '../components/dashboard/runtime/dashboardRuntimeTypes';
import type { VehicleData } from '../data/vehicles';
import {
  resolveTelemetryFreshness,
  type TelemetryFreshness,
} from './telemetryFreshness';

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
  vehicle: Pick<VehicleData, 'signalAgeMs' | 'lastSignal' | 'onlineStatus'>,
  now: Date | number = Date.now(),
): TelemetryConnectionState {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const fresh = resolveTelemetryFreshness(vehicle, { now: nowMs });
  return mapTelemetryFreshnessToRuntimeState(fresh.freshness);
}
