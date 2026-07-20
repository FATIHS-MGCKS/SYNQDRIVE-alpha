import { WebhookConfigurationStateEnum } from './device-connection-webhook-configuration.types';
import {
  classifyDimoTriggerWebhook,
  pickBestTrigger,
  vehicleSubscribedToObdSignal,
} from './dimo-trigger-webhook.classifier';
import { DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES } from './device-connection-webhook-configuration.types';
import { legacyWebhookConfiguredFromConfiguration } from './device-connection-webhook-configuration.types';
import { configuredUnplugWebhookConfiguration, mockWebhookConfiguration } from './device-connection-webhook-configuration.test-helpers';
import { DeviceConnectionWebhookConfigurationService } from './device-connection-webhook-configuration.service';
import type { TriggerRegistrySnapshot } from './dimo-trigger-registry.service';

const CALLBACK = 'https://app.synqdrive.eu/api/v1/webhooks/dimo';

describe('dimo-trigger-webhook.classifier', () => {
  it('classifies OBD unplug trigger from metric and condition', () => {
    const webhook = classifyDimoTriggerWebhook(
      {
        id: 'wh-1',
        displayName: 'OBD Device unplugged',
        metricName: 'vss.obdIsPluggedIn',
        condition: 'valueNumber == 0',
        targetURL: CALLBACK,
        status: 'enabled',
        failureCount: 0,
      },
      CALLBACK,
    );
    expect(webhook.classification).toBe('OBD_UNPLUG');
    expect(webhook.enabled).toBe(true);
    expect(webhook.pointsToCallback).toBe(true);
  });

  it('classifies plug trigger separately', () => {
    const webhook = classifyDimoTriggerWebhook(
      {
        id: 'wh-plug',
        displayName: 'OBD plugged in',
        metricName: 'vss.obdIsPluggedIn',
        condition: 'valueNumber == 1',
        targetURL: CALLBACK,
        status: 'disabled',
      },
      CALLBACK,
    );
    expect(webhook.classification).toBe('OBD_PLUG');
    expect(webhook.enabled).toBe(false);
  });
});

describe('DeviceConnectionWebhookConfigurationService', () => {
  const registry = {
    getRegistrySnapshot: jest.fn(),
  };
  const triggers = {
    getVehicleWebhookSubscriptions: jest.fn(),
  };
  const prisma = {
    deviceConnectionWebhookInbox: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  function makeService() {
    return new DeviceConnectionWebhookConfigurationService(
      registry as never,
      triggers as never,
      prisma as never,
    );
  }

  function registrySnapshot(
    webhooks: Record<string, unknown>[],
    syncError: string | null = null,
  ): TriggerRegistrySnapshot {
    return {
      webhooks: webhooks.map((w) => classifyDimoTriggerWebhook(w, CALLBACK)),
      callbackUrl: CALLBACK,
      syncedAt: new Date('2026-06-28T12:00:00Z'),
      expiresAt: new Date('2026-06-28T12:30:00Z'),
      source: 'REGISTRY_CACHE',
      syncError,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    triggers.getVehicleWebhookSubscriptions.mockResolvedValue({
      subscriptions: { signals: ['obdIsPluggedIn'] },
      error: null,
    });
  });

  it('configured with no events — unplug trigger enabled and vehicle subscribed', async () => {
    registry.getRegistrySnapshot.mockResolvedValue(
      registrySnapshot([
        {
          id: 'wh-unplug',
          displayName: 'OBD Device unplugged',
          metricName: 'vss.obdIsPluggedIn',
          condition: 'valueNumber == 0',
          targetURL: CALLBACK,
          status: 'enabled',
        },
      ]),
    );

    const result = await makeService().getForVehicle({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      tokenId: 42,
    });

    expect(result.unplugTriggerState.state).toBe(WebhookConfigurationStateEnum.CONFIGURED);
    expect(result.plugTriggerState.state).toBe(WebhookConfigurationStateEnum.NOT_APPLICABLE);
    expect(legacyWebhookConfiguredFromConfiguration(result)).toBe('active');
  });

  it('not configured when unplug trigger missing', async () => {
    registry.getRegistrySnapshot.mockResolvedValue(registrySnapshot([]));

    const result = await makeService().getForVehicle({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      tokenId: 42,
    });

    expect(result.unplugTriggerState.state).toBe(WebhookConfigurationStateEnum.NOT_CONFIGURED);
    expect(result.unplugTriggerState.reasonCode).toBe(
      DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.UNPLUG_TRIGGER_MISSING,
    );
  });

  it('error when trigger has delivery failures', async () => {
    registry.getRegistrySnapshot.mockResolvedValue(
      registrySnapshot([
        {
          id: 'wh-unplug',
          metricName: 'vss.obdIsPluggedIn',
          condition: 'valueNumber == 0',
          targetURL: CALLBACK,
          status: 'enabled',
          failureCount: 3,
        },
      ]),
    );

    const result = await makeService().getForVehicle({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      tokenId: 42,
    });

    expect(result.unplugTriggerState.state).toBe(WebhookConfigurationStateEnum.ERROR);
    expect(result.unplugTriggerState.reasonCode).toBe(
      DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.TRIGGER_DELIVERY_ERRORS,
    );
  });

  it('unknown when DIMO API unavailable and no cache', async () => {
    registry.getRegistrySnapshot.mockResolvedValue(
      registrySnapshot([], 'timeout'),
    );

    const result = await makeService().getForVehicle({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      tokenId: 42,
    });

    expect(result.unplugTriggerState.state).toBe(WebhookConfigurationStateEnum.ERROR);
    expect(result.unplugTriggerState.reasonCode).toBe(
      DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.DIMO_API_UNAVAILABLE,
    );
  });

  it('plug deliberately disabled is NOT_APPLICABLE under snapshot recovery policy', async () => {
    registry.getRegistrySnapshot.mockResolvedValue(
      registrySnapshot([
        {
          id: 'wh-unplug',
          metricName: 'vss.obdIsPluggedIn',
          condition: 'valueNumber == 0',
          targetURL: CALLBACK,
          status: 'enabled',
        },
      ]),
    );

    const result = await makeService().getForVehicle({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      tokenId: 42,
    });

    expect(result.plugTriggerState.state).toBe(WebhookConfigurationStateEnum.NOT_APPLICABLE);
    expect(result.plugTriggerState.reasonCode).toBe(
      DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.PLUG_TRIGGER_NOT_REQUIRED_SNAPSHOT_RECOVERY,
    );
    expect(result.recoveryPolicy).toBe('UNPLUG_WEBHOOK_PLUG_SNAPSHOT');
  });

  it('vehicle not subscribed → NOT_CONFIGURED even when org trigger exists', async () => {
    registry.getRegistrySnapshot.mockResolvedValue(
      registrySnapshot([
        {
          id: 'wh-unplug',
          metricName: 'vss.obdIsPluggedIn',
          condition: 'valueNumber == 0',
          targetURL: CALLBACK,
          status: 'enabled',
        },
      ]),
    );
    triggers.getVehicleWebhookSubscriptions.mockResolvedValue({
      subscriptions: { signals: [] },
      error: null,
    });

    const result = await makeService().getForVehicle({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      tokenId: 42,
    });

    expect(result.unplugTriggerState.state).toBe(WebhookConfigurationStateEnum.NOT_CONFIGURED);
    expect(result.unplugTriggerState.reasonCode).toBe(
      DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.VEHICLE_NOT_SUBSCRIBED,
    );
  });

  it('NOT_APPLICABLE for non LTE_R1 hardware', async () => {
    const result = await makeService().getForVehicle({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      hardwareType: 'OEM_ONLY',
      dimoLinked: true,
      tokenId: 42,
    });

    expect(result.unplugTriggerState.state).toBe(WebhookConfigurationStateEnum.NOT_APPLICABLE);
    expect(registry.getRegistrySnapshot).not.toHaveBeenCalled();
  });

  it('reads delivery evidence from inbox — not connection events', async () => {
    registry.getRegistrySnapshot.mockResolvedValue(
      registrySnapshot([
        {
          id: 'wh-unplug',
          metricName: 'vss.obdIsPluggedIn',
          condition: 'valueNumber == 0',
          targetURL: CALLBACK,
          status: 'enabled',
        },
      ]),
    );
    prisma.deviceConnectionWebhookInbox.findMany.mockImplementation(async (args: {
      where?: { lastErrorCode?: unknown; processingStatus?: unknown };
    }) => {
      if (args.where?.lastErrorCode) {
        return [
          {
            vehicleId: 'veh-1',
            receivedAt: new Date('2026-06-28T10:00:00Z'),
          },
        ];
      }
      return [
        {
          vehicleId: 'veh-1',
          receivedAt: new Date('2026-06-28T11:00:00Z'),
        },
      ];
    });

    const result = await makeService().getForVehicle({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      hardwareType: 'LTE_R1',
      dimoLinked: true,
      tokenId: 42,
    });

    expect(result.lastSuccessfulDeliveryAt).toBe('2026-06-28T11:00:00.000Z');
    expect(result.lastDeliveryErrorAt).toBe('2026-06-28T10:00:00.000Z');
  });
});

describe('legacyWebhookConfiguredFromConfiguration', () => {
  it('maps CONFIGURED unplug to active without requiring events', () => {
    expect(legacyWebhookConfiguredFromConfiguration(configuredUnplugWebhookConfiguration())).toBe(
      'active',
    );
  });

  it('maps NOT_CONFIGURED to not_configured', () => {
    expect(
      legacyWebhookConfiguredFromConfiguration(
        mockWebhookConfiguration({
          unplugTriggerState: {
            state: WebhookConfigurationStateEnum.NOT_CONFIGURED,
            reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.UNPLUG_TRIGGER_MISSING,
            triggerId: null,
            eventType: 'OBD_DEVICE_UNPLUGGED',
            active: false,
            callbackUrl: null,
            failureCount: null,
          },
        }),
      ),
    ).toBe('not_configured');
  });
});

describe('vehicleSubscribedToObdSignal', () => {
  it('detects obd signal in subscription payload', () => {
    expect(vehicleSubscribedToObdSignal({ signals: ['obdIsPluggedIn'] })).toBe(true);
    expect(vehicleSubscribedToObdSignal({ signals: ['speed'] })).toBe(false);
  });
});

describe('pickBestTrigger', () => {
  const webhooks = [
    classifyDimoTriggerWebhook(
      {
        id: 'u1',
        metricName: 'vss.obdIsPluggedIn',
        condition: 'valueNumber == 0',
        targetURL: CALLBACK,
        status: 'enabled',
      },
      CALLBACK,
    ),
    classifyDimoTriggerWebhook(
      {
        id: 'p1',
        metricName: 'vss.obdIsPluggedIn',
        condition: 'valueNumber == 1',
        targetURL: CALLBACK,
        status: 'disabled',
      },
      CALLBACK,
    ),
  ];

  it('picks enabled unplug trigger', () => {
    expect(pickBestTrigger(webhooks, 'OBD_UNPLUG')?.id).toBe('u1');
  });
});
