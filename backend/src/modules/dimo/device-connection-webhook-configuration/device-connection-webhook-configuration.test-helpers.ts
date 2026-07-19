import { WebhookConfigurationStateEnum } from './device-connection-webhook-configuration.types';
import type { DeviceConnectionWebhookConfigurationView } from './device-connection-webhook-configuration.types';
import { DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES } from './device-connection-webhook-configuration.types';

export function mockWebhookConfiguration(
  overrides: Partial<DeviceConnectionWebhookConfigurationView> = {},
): DeviceConnectionWebhookConfigurationView {
  return {
    unplugTriggerState: {
      state: WebhookConfigurationStateEnum.UNKNOWN,
      reasonCode: null,
      triggerId: null,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      active: null,
      callbackUrl: null,
      failureCount: null,
    },
    plugTriggerState: {
      state: WebhookConfigurationStateEnum.NOT_APPLICABLE,
      reasonCode:
        DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.PLUG_TRIGGER_NOT_REQUIRED_SNAPSHOT_RECOVERY,
      triggerId: null,
      eventType: 'OBD_DEVICE_PLUGGED_IN',
      active: false,
      callbackUrl: null,
      failureCount: null,
    },
    recoveryPolicy: 'UNPLUG_WEBHOOK_PLUG_SNAPSHOT',
    lastSuccessfulDeliveryAt: null,
    lastDeliveryErrorAt: null,
    configSyncedAt: null,
    configSource: 'DEPLOYMENT_POLICY',
    ...overrides,
  };
}

export function configuredUnplugWebhookConfiguration(): DeviceConnectionWebhookConfigurationView {
  return mockWebhookConfiguration({
    unplugTriggerState: {
      state: WebhookConfigurationStateEnum.CONFIGURED,
      reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.UNPLUG_TRIGGER_ENABLED,
      triggerId: 'wh-unplug',
      eventType: 'OBD_DEVICE_UNPLUGGED',
      active: true,
      callbackUrl: 'https://app.synqdrive.eu/api/v1/webhooks/dimo',
      failureCount: 0,
    },
    configSyncedAt: '2026-06-28T12:00:00.000Z',
    configSource: 'REGISTRY_CACHE',
  });
}
