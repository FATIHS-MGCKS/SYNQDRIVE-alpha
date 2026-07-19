import { ConnectivityAlertType } from './connectivity-alert.types';

type EpisodePhase = 'open' | 'recovered';

export interface DeviceAlertPolicyInput {
  phase: EpisodePhase;
  priorNotifications: Array<
    | typeof ConnectivityAlertType.DEVICE_UNPLUGGED
    | typeof ConnectivityAlertType.DEVICE_RECONNECTED
  >;
  recoverySource:
    | 'plug_webhook'
    | 'snapshot_obd'
    | 'telemetry_resumed'
    | 'duplicate_recovery';
}

export interface DeviceAlertPolicyResult {
  activeAlerts: Array<
    | typeof ConnectivityAlertType.DEVICE_UNPLUGGED
    | typeof ConnectivityAlertType.DEVICE_RECONNECTED
  >;
  newNotifications: Array<
    | typeof ConnectivityAlertType.DEVICE_UNPLUGGED
    | typeof ConnectivityAlertType.DEVICE_RECONNECTED
  >;
  resolveUnplug: boolean;
}

export function evaluateDeviceAlertPolicy(
  input: DeviceAlertPolicyInput,
): DeviceAlertPolicyResult {
  if (input.phase === 'open') {
    if (input.priorNotifications.includes(ConnectivityAlertType.DEVICE_UNPLUGGED)) {
      return {
        activeAlerts: [ConnectivityAlertType.DEVICE_UNPLUGGED],
        newNotifications: [],
        resolveUnplug: false,
      };
    }
    return {
      activeAlerts: [ConnectivityAlertType.DEVICE_UNPLUGGED],
      newNotifications: [ConnectivityAlertType.DEVICE_UNPLUGGED],
      resolveUnplug: false,
    };
  }

  const hadUnplug = input.priorNotifications.includes(
    ConnectivityAlertType.DEVICE_UNPLUGGED,
  );
  const hadReconnect = input.priorNotifications.includes(
    ConnectivityAlertType.DEVICE_RECONNECTED,
  );

  if (!hadUnplug) {
    return { activeAlerts: [], newNotifications: [], resolveUnplug: false };
  }

  if (hadReconnect || input.recoverySource === 'duplicate_recovery') {
    return {
      activeAlerts: [],
      newNotifications: [],
      resolveUnplug: true,
    };
  }

  return {
    activeAlerts: [],
    newNotifications: [ConnectivityAlertType.DEVICE_RECONNECTED],
    resolveUnplug: true,
  };
}

export function shouldOpenTelemetryOfflineAlert(
  telemetryFreshness: string,
): boolean {
  return telemetryFreshness === 'offline' || telemetryFreshness === 'no_signal';
}

export function shouldOpenTelemetrySoftOfflineAlert(
  telemetryFreshness: string,
): boolean {
  return telemetryFreshness === 'signal_delayed';
}

/** Standby is healthy idle — no error alert. */
export function shouldResolveTelemetryAlerts(
  telemetryFreshness: string,
): boolean {
  return (
    telemetryFreshness === 'live' || telemetryFreshness === 'standby'
  );
}

export function shouldOpenAuthorizationAlert(providerLinkState: string): boolean {
  return (
    providerLinkState === 'REAUTH_REQUIRED' ||
    providerLinkState === 'REVOKED' ||
    providerLinkState === 'ERROR'
  );
}

export function shouldResolveAuthorizationAlert(
  providerLinkState: string,
): boolean {
  return providerLinkState === 'ACTIVE';
}

export function shouldOpenDataSourceDisconnectedAlert(input: {
  hasProviderLink: boolean;
  providerLinkState: string;
}): boolean {
  return !input.hasProviderLink || input.providerLinkState === 'NO_LINK';
}

export function shouldOpenCoverageInsufficientAlert(
  coverageState: string,
): boolean {
  return coverageState === 'INSUFFICIENT' || coverageState === 'PARTIAL';
}

export function shouldResolveCoverageAlert(coverageState: string): boolean {
  return coverageState === 'GOOD' || coverageState === 'NOT_APPLICABLE';
}
