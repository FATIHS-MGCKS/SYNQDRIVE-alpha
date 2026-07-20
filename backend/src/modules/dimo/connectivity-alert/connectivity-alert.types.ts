/**
 * Structured connectivity alert vocabulary.
 * Separates device, telemetry, authorization, data quality, and integration alerts.
 */

export const ConnectivityAlertType = {
  DEVICE_UNPLUGGED: 'DEVICE_UNPLUGGED',
  DEVICE_RECONNECTED: 'DEVICE_RECONNECTED',
  TELEMETRY_SOFT_OFFLINE: 'TELEMETRY_SOFT_OFFLINE',
  TELEMETRY_OFFLINE: 'TELEMETRY_OFFLINE',
  AUTHORIZATION_REQUIRED: 'AUTHORIZATION_REQUIRED',
  DATA_SOURCE_DISCONNECTED: 'DATA_SOURCE_DISCONNECTED',
  DATA_COVERAGE_INSUFFICIENT: 'DATA_COVERAGE_INSUFFICIENT',
  WEBHOOK_PROCESSING_FAILED: 'WEBHOOK_PROCESSING_FAILED',
  DEVICE_BINDING_CHANGED: 'DEVICE_BINDING_CHANGED',
  CONNECTIVITY_STATE_UNKNOWN: 'CONNECTIVITY_STATE_UNKNOWN',
} as const;
export type ConnectivityAlertType =
  (typeof ConnectivityAlertType)[keyof typeof ConnectivityAlertType];

export const ConnectivityAlertCategory = {
  DEVICE: 'DEVICE',
  TELEMETRY: 'TELEMETRY',
  AUTHORIZATION: 'AUTHORIZATION',
  DATA_QUALITY: 'DATA_QUALITY',
  INTEGRATION: 'INTEGRATION',
} as const;
export type ConnectivityAlertCategory =
  (typeof ConnectivityAlertCategory)[keyof typeof ConnectivityAlertCategory];

export type DeviceRecoverySource =
  | 'plug_webhook'
  | 'snapshot_obd'
  | 'telemetry_resumed'
  | 'duplicate_recovery'
  | 'binding_change';

export interface ConnectivityAlertDedupeParts {
  organizationId: string;
  vehicleId: string;
  provider: string;
  deviceBindingId?: string | null;
  episodeId?: string | null;
  alertType: ConnectivityAlertType;
  stateVersion?: number | null;
}

export interface ConnectivityAlertVehicleContext {
  organizationId: string;
  vehicleId: string;
  provider: string;
  deviceBindingId?: string | null;
  label: string;
  licensePlate?: string | null;
}

export interface DeviceUnplugAlertInput extends ConnectivityAlertVehicleContext {
  episodeId: string;
  stateVersion: number;
  observedAt: Date;
}

export interface DeviceReconnectAlertInput extends ConnectivityAlertVehicleContext {
  episodeId: string;
  stateVersion: number;
  recoverySource: DeviceRecoverySource;
  resolutionMethod?: string | null;
  observedAt: Date;
}

export interface RuntimeConnectivityAlertSyncInput extends ConnectivityAlertVehicleContext {
  telemetryFreshness:
    | 'live'
    | 'standby'
    | 'signal_delayed'
    | 'offline'
    | 'no_signal';
  providerLinkState:
    | 'ACTIVE'
    | 'REAUTH_REQUIRED'
    | 'REVOKED'
    | 'NO_LINK'
    | 'ERROR'
    | 'UNKNOWN';
  hasProviderLink: boolean;
  coverageState:
    | 'GOOD'
    | 'PARTIAL'
    | 'INSUFFICIENT'
    | 'UNKNOWN'
    | 'NOT_APPLICABLE';
  webhookProcessingFailed?: boolean;
  bindingChanged?: boolean;
  connectivityStateUnknown?: boolean;
  observedAt: Date;
}

export const ALERT_TYPE_CATEGORY: Record<
  ConnectivityAlertType,
  ConnectivityAlertCategory
> = {
  [ConnectivityAlertType.DEVICE_UNPLUGGED]: ConnectivityAlertCategory.DEVICE,
  [ConnectivityAlertType.DEVICE_RECONNECTED]: ConnectivityAlertCategory.DEVICE,
  [ConnectivityAlertType.TELEMETRY_SOFT_OFFLINE]: ConnectivityAlertCategory.TELEMETRY,
  [ConnectivityAlertType.TELEMETRY_OFFLINE]: ConnectivityAlertCategory.TELEMETRY,
  [ConnectivityAlertType.AUTHORIZATION_REQUIRED]:
    ConnectivityAlertCategory.AUTHORIZATION,
  [ConnectivityAlertType.DATA_SOURCE_DISCONNECTED]:
    ConnectivityAlertCategory.AUTHORIZATION,
  [ConnectivityAlertType.DATA_COVERAGE_INSUFFICIENT]:
    ConnectivityAlertCategory.DATA_QUALITY,
  [ConnectivityAlertType.WEBHOOK_PROCESSING_FAILED]:
    ConnectivityAlertCategory.INTEGRATION,
  [ConnectivityAlertType.DEVICE_BINDING_CHANGED]: ConnectivityAlertCategory.DEVICE,
  [ConnectivityAlertType.CONNECTIVITY_STATE_UNKNOWN]:
    ConnectivityAlertCategory.INTEGRATION,
};
