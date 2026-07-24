import type { DeviceConnectionSummary } from './device-connection-read-model';
import type {
  DeviceConnectionTriggerStateView,
  DeviceConnectionWebhookConfigurationView,
} from './device-connection-webhook-configuration/device-connection-webhook-configuration.types';
import type { VehicleConnectivityRuntimeStateDto } from '@modules/vehicles/connectivity/vehicle-connectivity-runtime-state.dto';

/** Client-safe trigger state — no callback URLs or provider trigger ids. */
export type DeviceConnectionTriggerStateClientView = Omit<
  DeviceConnectionTriggerStateView,
  'callbackUrl' | 'triggerId'
> & {
  callbackConfigured: boolean;
};

export type DeviceConnectionWebhookConfigurationClientView = Omit<
  DeviceConnectionWebhookConfigurationView,
  'unplugTriggerState' | 'plugTriggerState'
> & {
  unplugTriggerState: DeviceConnectionTriggerStateClientView;
  plugTriggerState: DeviceConnectionTriggerStateClientView;
};

export type DeviceConnectionClientResponse = Omit<
  DeviceConnectionSummary,
  'webhookConfiguration'
> & {
  webhookConfiguration: DeviceConnectionWebhookConfigurationClientView;
  connectivityRuntime?: VehicleConnectivityRuntimeStateDto;
};

function sanitizeTriggerState(
  state: DeviceConnectionTriggerStateView,
): DeviceConnectionTriggerStateClientView {
  return {
    state: state.state,
    reasonCode: state.reasonCode,
    eventType: state.eventType,
    active: state.active,
    failureCount: state.failureCount,
    callbackConfigured: Boolean(state.callbackUrl),
  };
}

function sanitizeWebhookConfiguration(
  config: DeviceConnectionWebhookConfigurationView,
): DeviceConnectionWebhookConfigurationClientView {
  return {
    recoveryPolicy: config.recoveryPolicy,
    lastSuccessfulDeliveryAt: config.lastSuccessfulDeliveryAt,
    lastDeliveryErrorAt: config.lastDeliveryErrorAt,
    configSyncedAt: config.configSyncedAt,
    configSource: config.configSource,
    unplugTriggerState: sanitizeTriggerState(config.unplugTriggerState),
    plugTriggerState: sanitizeTriggerState(config.plugTriggerState),
  };
}

/**
 * Strips provider internals and debug payloads before API responses.
 * Never expose raw webhook payloads, callback URLs, or trigger ids to rental UI.
 */
export function sanitizeDeviceConnectionForClient(
  summary: DeviceConnectionSummary & {
    connectivityRuntime?: VehicleConnectivityRuntimeStateDto;
    rawEvents?: unknown[];
  },
): DeviceConnectionClientResponse {
  const { rawEvents: _raw, webhookConfiguration, ...rest } = summary;
  return {
    ...rest,
    webhookConfiguration: sanitizeWebhookConfiguration(webhookConfiguration),
    connectivityRuntime: summary.connectivityRuntime,
  };
}
