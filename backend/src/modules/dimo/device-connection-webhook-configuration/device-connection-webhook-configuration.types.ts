export type WebhookConfigurationState =
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'ERROR'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export const WebhookConfigurationStateEnum = {
  CONFIGURED: 'CONFIGURED',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
} as const satisfies Record<WebhookConfigurationState, WebhookConfigurationState>;

export type DeviceConnectionRecoveryPolicy =
  | 'UNPLUG_WEBHOOK_PLUG_SNAPSHOT'
  | 'UNPLUG_WEBHOOK_ONLY'
  | 'NONE';

export const DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES = {
  UNPLUG_TRIGGER_ENABLED: 'UNPLUG_TRIGGER_ENABLED',
  UNPLUG_TRIGGER_MISSING: 'UNPLUG_TRIGGER_MISSING',
  UNPLUG_TRIGGER_DISABLED: 'UNPLUG_TRIGGER_DISABLED',
  PLUG_TRIGGER_ENABLED: 'PLUG_TRIGGER_ENABLED',
  PLUG_TRIGGER_NOT_REQUIRED_SNAPSHOT_RECOVERY: 'PLUG_TRIGGER_NOT_REQUIRED_SNAPSHOT_RECOVERY',
  PLUG_TRIGGER_DISABLED_BY_POLICY: 'PLUG_TRIGGER_DISABLED_BY_POLICY',
  VEHICLE_NOT_SUBSCRIBED: 'VEHICLE_NOT_SUBSCRIBED',
  NOT_LTE_R1_CAPABLE: 'NOT_LTE_R1_CAPABLE',
  NOT_DIMO_LINKED: 'NOT_DIMO_LINKED',
  DIMO_API_UNAVAILABLE: 'DIMO_API_UNAVAILABLE',
  REGISTRY_STALE: 'REGISTRY_STALE',
  CALLBACK_URL_MISMATCH: 'CALLBACK_URL_MISMATCH',
  TRIGGER_DELIVERY_ERRORS: 'TRIGGER_DELIVERY_ERRORS',
  TRIGGER_INACTIVE: 'TRIGGER_INACTIVE',
} as const;

export type DeviceConnectionWebhookConfigReasonCode =
  (typeof DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES)[keyof typeof DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES];

export interface DeviceConnectionTriggerStateView {
  state: WebhookConfigurationState;
  reasonCode: DeviceConnectionWebhookConfigReasonCode | null;
  triggerId: string | null;
  eventType: 'OBD_DEVICE_UNPLUGGED' | 'OBD_DEVICE_PLUGGED_IN' | null;
  active: boolean | null;
  callbackUrl: string | null;
  failureCount: number | null;
}

export interface DeviceConnectionWebhookConfigurationView {
  unplugTriggerState: DeviceConnectionTriggerStateView;
  plugTriggerState: DeviceConnectionTriggerStateView;
  recoveryPolicy: DeviceConnectionRecoveryPolicy;
  lastSuccessfulDeliveryAt: string | null;
  lastDeliveryErrorAt: string | null;
  configSyncedAt: string | null;
  configSource: 'DIMO_TRIGGER_API' | 'REGISTRY_CACHE' | 'DEPLOYMENT_POLICY';
}

export interface NormalizedDimoTriggerWebhook {
  id: string;
  displayName: string;
  metricName: string;
  condition: string;
  targetUrl: string;
  status: string;
  failureCount: number;
  classification: 'OBD_UNPLUG' | 'OBD_PLUG' | 'OTHER';
  enabled: boolean;
  pointsToCallback: boolean;
}

export const EMPTY_TRIGGER_STATE: DeviceConnectionTriggerStateView = {
  state: 'UNKNOWN',
  reasonCode: null,
  triggerId: null,
  eventType: null,
  active: null,
  callbackUrl: null,
  failureCount: null,
};

export function legacyWebhookConfiguredFromConfiguration(
  config: DeviceConnectionWebhookConfigurationView,
): 'active' | 'not_configured' | 'unknown' {
  const unplug = config.unplugTriggerState.state;
  if (unplug === WebhookConfigurationStateEnum.CONFIGURED) return 'active';
  if (unplug === WebhookConfigurationStateEnum.NOT_CONFIGURED) return 'not_configured';
  if (unplug === WebhookConfigurationStateEnum.NOT_APPLICABLE) return 'unknown';
  return 'unknown';
}
