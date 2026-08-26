import type {
  ConnectivityAttentionState,
  ConnectivityRecommendedAction,
  FleetDataCoverageState,
  FleetTelemetryFreshness,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
} from '../../../lib/api';

export function asConnectivityAttentionState(
  value: unknown,
): value is ConnectivityAttentionState {
  return (
    value === 'NONE' ||
    value === 'WATCH' ||
    value === 'ACTION_REQUIRED' ||
    value === 'CRITICAL'
  );
}

export function asConnectivityRecommendedAction(
  value: unknown,
): value is ConnectivityRecommendedAction {
  return (
    value === 'NONE' ||
    value === 'CHECK_DEVICE' ||
    value === 'REAUTHORIZE_PROVIDER' ||
    value === 'CONNECT_DATA_SOURCE' ||
    value === 'REVIEW_CONNECTIVITY' ||
    value === 'WAIT_FOR_TELEMETRY' ||
    value === 'CHECK_INTEGRATION'
  );
}

export function asOverallConnectivityState(
  value: unknown,
): value is OverallConnectivityState {
  const states: OverallConnectivityState[] = [
    'TELEMETRY_ACTIVE',
    'STANDBY',
    'SOFT_OFFLINE',
    'OFFLINE',
    'DEVICE_UNPLUGGED',
    'AUTHORIZATION_REQUIRED',
    'NO_ACTIVE_DATA_SOURCE',
    'INTEGRATION_ERROR',
    'UNKNOWN',
  ];
  return states.includes(value as OverallConnectivityState);
}

export function asProviderLinkState(value: unknown): value is ProviderLinkState {
  const states: ProviderLinkState[] = [
    'ACTIVE',
    'REAUTH_REQUIRED',
    'REVOKED',
    'NO_LINK',
    'ERROR',
    'UNKNOWN',
  ];
  return states.includes(value as ProviderLinkState);
}

export function asTelemetryState(value: unknown): value is FleetTelemetryFreshness {
  return (
    value === 'live' ||
    value === 'standby' ||
    value === 'signal_delayed' ||
    value === 'offline' ||
    value === 'no_signal'
  );
}

export function asPhysicalDeviceState(value: unknown): value is PhysicalDeviceState {
  const states: PhysicalDeviceState[] = [
    'PLUGGED_CONFIRMED',
    'PLUGGED_INFERRED',
    'UNPLUGGED_CONFIRMED',
    'UNKNOWN',
    'NOT_APPLICABLE',
  ];
  return states.includes(value as PhysicalDeviceState);
}

export function asDataCoverageState(value: unknown): value is FleetDataCoverageState {
  const states: FleetDataCoverageState[] = [
    'GOOD',
    'PARTIAL',
    'INSUFFICIENT',
    'UNKNOWN',
    'NOT_APPLICABLE',
  ];
  return states.includes(value as FleetDataCoverageState);
}
