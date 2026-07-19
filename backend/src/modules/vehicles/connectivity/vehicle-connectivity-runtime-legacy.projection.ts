/**
 * Derives transitional legacy fleet-connectivity fields from canonical runtime state.
 * Consumers must read runtime dimensions directly — never re-derive from raw signals.
 */
import type { TelemetryFreshness } from '../vehicle-state-interpreter';
import {
  legacyConnectionStatusNote,
  mapTelemetryFreshnessToLegacyConnectionStatus,
} from '../telemetry-freshness.resolver';
import type { FleetConnectionStatus } from '../fleet-connectivity.types';
import type {
  OverallConnectivityState,
  ProviderLinkState,
  VehicleConnectivityRuntimeState,
} from './domain/connectivity-domain.types';

export interface LegacyFleetConnectivityProjection {
  connectionStatus: FleetConnectionStatus;
  telemetryFreshness: TelemetryFreshness;
  statusNote: string;
  online: boolean;
}

function hasActiveProviderLink(providerLinkState: ProviderLinkState): boolean {
  return (
    providerLinkState === 'ACTIVE' ||
    providerLinkState === 'ERROR' ||
    providerLinkState === 'UNKNOWN'
  );
}

export function mapOverallStateToLegacyConnectionStatus(
  overallState: OverallConnectivityState,
  telemetryState: TelemetryFreshness,
  providerLinkState: ProviderLinkState,
): FleetConnectionStatus {
  const hasLink = hasActiveProviderLink(providerLinkState);

  if (
    !hasLink ||
    overallState === 'NO_ACTIVE_DATA_SOURCE' ||
    overallState === 'AUTHORIZATION_REQUIRED' ||
    providerLinkState === 'NO_LINK' ||
    providerLinkState === 'REVOKED' ||
    providerLinkState === 'REAUTH_REQUIRED'
  ) {
    return 'not_connected';
  }

  switch (overallState) {
    case 'TELEMETRY_ACTIVE':
      return 'online';
    case 'STANDBY':
      return 'standby';
    case 'SOFT_OFFLINE':
      return 'signal_delayed';
    case 'OFFLINE':
    case 'UNKNOWN':
    case 'INTEGRATION_ERROR':
      return telemetryState === 'no_signal' ? 'offline' : 'offline';
    case 'DEVICE_UNPLUGGED':
      // Incident state must not present as live even when telemetry is fresh.
      if (telemetryState === 'live' || telemetryState === 'standby') {
        return 'signal_delayed';
      }
      return mapTelemetryFreshnessToLegacyConnectionStatus(telemetryState, true);
    default:
      return mapTelemetryFreshnessToLegacyConnectionStatus(telemetryState, hasLink);
  }
}

export function projectLegacyFleetConnectivityFields(
  runtime: VehicleConnectivityRuntimeState,
  ageMs: number | null = null,
): LegacyFleetConnectivityProjection {
  const telemetryFreshness = runtime.telemetryState;
  const connectionStatus = mapOverallStateToLegacyConnectionStatus(
    runtime.overallState,
    telemetryFreshness,
    runtime.providerLinkState,
  );

  return {
    connectionStatus,
    telemetryFreshness,
    statusNote: legacyConnectionStatusNote(
      connectionStatus,
      telemetryFreshness,
      ageMs,
    ),
    online: runtime.overallState === 'TELEMETRY_ACTIVE',
  };
}
