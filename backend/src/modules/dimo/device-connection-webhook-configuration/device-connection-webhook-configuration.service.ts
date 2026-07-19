import { Injectable } from '@nestjs/common';
import { WebhookConfigurationStateEnum } from './device-connection-webhook-configuration.types';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTriggersService } from '../dimo-triggers.service';
import { isLteR1Hardware } from '../device-connection-read-model';
import {
  DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES,
  EMPTY_TRIGGER_STATE,
  type DeviceConnectionRecoveryPolicy,
  type DeviceConnectionTriggerStateView,
  type DeviceConnectionWebhookConfigurationView,
} from './device-connection-webhook-configuration.types';
import { DEVICE_CONNECTION_DEFAULT_RECOVERY_POLICY } from './device-connection-webhook-configuration.policy';
import {
  DimoTriggerRegistryService,
  type TriggerRegistrySnapshot,
} from './dimo-trigger-registry.service';
import {
  pickBestTrigger,
  vehicleSubscribedToObdSignal,
} from './dimo-trigger-webhook.classifier';
import type { NormalizedDimoTriggerWebhook } from './device-connection-webhook-configuration.types';

export interface VehicleWebhookConfigurationInput {
  organizationId: string;
  vehicleId: string;
  hardwareType: string | null;
  dimoLinked: boolean;
  tokenId: number | null;
}

@Injectable()
export class DeviceConnectionWebhookConfigurationService {
  constructor(
    private readonly registry: DimoTriggerRegistryService,
    private readonly triggers: DimoTriggersService,
    private readonly prisma: PrismaService,
  ) {}

  async getForVehicle(
    input: VehicleWebhookConfigurationInput,
  ): Promise<DeviceConnectionWebhookConfigurationView> {
    const recoveryPolicy = DEVICE_CONNECTION_DEFAULT_RECOVERY_POLICY;

    if (!input.dimoLinked || input.tokenId == null) {
      return this.notApplicableView(recoveryPolicy, DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.NOT_DIMO_LINKED);
    }

    if (!isLteR1Hardware(input.hardwareType)) {
      return this.notApplicableView(recoveryPolicy, DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.NOT_LTE_R1_CAPABLE);
    }

    const [registry, delivery, vehicleSubs] = await Promise.all([
      this.registry.getRegistrySnapshot(),
      this.loadDeliveryEvidence(input.vehicleId),
      this.triggers.getVehicleWebhookSubscriptions(input.tokenId),
    ]);

    const vehicleSubscribed =
      !vehicleSubs.error && vehicleSubscribedToObdSignal(vehicleSubs.subscriptions);

    const unplugTriggerState = this.resolveUnplugState(registry, vehicleSubscribed, vehicleSubs.error);
    const plugTriggerState = this.resolvePlugState(registry, recoveryPolicy, vehicleSubscribed, vehicleSubs.error);

    return {
      unplugTriggerState,
      plugTriggerState,
      recoveryPolicy,
      lastSuccessfulDeliveryAt: delivery.lastSuccessfulDeliveryAt,
      lastDeliveryErrorAt: delivery.lastDeliveryErrorAt,
      configSyncedAt: registry.syncedAt.toISOString(),
      configSource: registry.source,
    };
  }

  async getForVehicles(
    inputs: VehicleWebhookConfigurationInput[],
  ): Promise<Map<string, DeviceConnectionWebhookConfigurationView>> {
    const registry = await this.registry.getRegistrySnapshot();
    const vehicleIds = inputs.map((i) => i.vehicleId);
    const deliveryByVehicle = await this.loadDeliveryEvidenceBatch(vehicleIds);

    const out = new Map<string, DeviceConnectionWebhookConfigurationView>();
    for (const input of inputs) {
      if (!input.dimoLinked || input.tokenId == null) {
        out.set(
          input.vehicleId,
          this.notApplicableView(
            DEVICE_CONNECTION_DEFAULT_RECOVERY_POLICY,
            DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.NOT_DIMO_LINKED,
          ),
        );
        continue;
      }
      if (!isLteR1Hardware(input.hardwareType)) {
        out.set(
          input.vehicleId,
          this.notApplicableView(
            DEVICE_CONNECTION_DEFAULT_RECOVERY_POLICY,
            DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.NOT_LTE_R1_CAPABLE,
          ),
        );
        continue;
      }

      const vehicleSubs = await this.triggers.getVehicleWebhookSubscriptions(input.tokenId);
      const vehicleSubscribed =
        !vehicleSubs.error && vehicleSubscribedToObdSignal(vehicleSubs.subscriptions);
      const delivery = deliveryByVehicle.get(input.vehicleId) ?? {
        lastSuccessfulDeliveryAt: null,
        lastDeliveryErrorAt: null,
      };

      out.set(input.vehicleId, {
        unplugTriggerState: this.resolveUnplugState(registry, vehicleSubscribed, vehicleSubs.error),
        plugTriggerState: this.resolvePlugState(
          registry,
          DEVICE_CONNECTION_DEFAULT_RECOVERY_POLICY,
          vehicleSubscribed,
          vehicleSubs.error,
        ),
        recoveryPolicy: DEVICE_CONNECTION_DEFAULT_RECOVERY_POLICY,
        lastSuccessfulDeliveryAt: delivery.lastSuccessfulDeliveryAt,
        lastDeliveryErrorAt: delivery.lastDeliveryErrorAt,
        configSyncedAt: registry.syncedAt.toISOString(),
        configSource: registry.source,
      });
    }
    return out;
  }

  private resolveUnplugState(
    registry: TriggerRegistrySnapshot,
    vehicleSubscribed: boolean,
    subscriptionError: { code: string; message: string } | null,
  ): DeviceConnectionTriggerStateView {
    if (registry.syncError && registry.webhooks.length === 0) {
      return {
        ...EMPTY_TRIGGER_STATE,
        state: WebhookConfigurationStateEnum.ERROR,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.DIMO_API_UNAVAILABLE,
        eventType: 'OBD_DEVICE_UNPLUGGED',
      };
    }

    const trigger = pickBestTrigger(registry.webhooks, 'OBD_UNPLUG');
    if (!trigger) {
      return {
        ...EMPTY_TRIGGER_STATE,
        state: WebhookConfigurationStateEnum.NOT_CONFIGURED,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.UNPLUG_TRIGGER_MISSING,
        eventType: 'OBD_DEVICE_UNPLUGGED',
      };
    }

    if (!trigger.enabled) {
      return {
        state: WebhookConfigurationStateEnum.NOT_CONFIGURED,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.UNPLUG_TRIGGER_DISABLED,
        triggerId: trigger.id,
        eventType: 'OBD_DEVICE_UNPLUGGED',
        active: false,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }

    if (!trigger.pointsToCallback) {
      return {
        state: WebhookConfigurationStateEnum.ERROR,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.CALLBACK_URL_MISMATCH,
        triggerId: trigger.id,
        eventType: 'OBD_DEVICE_UNPLUGGED',
        active: true,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }

    if (subscriptionError) {
      return {
        state: WebhookConfigurationStateEnum.UNKNOWN,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.DIMO_API_UNAVAILABLE,
        triggerId: trigger.id,
        eventType: 'OBD_DEVICE_UNPLUGGED',
        active: true,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }

    if (!vehicleSubscribed) {
      return {
        state: WebhookConfigurationStateEnum.NOT_CONFIGURED,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.VEHICLE_NOT_SUBSCRIBED,
        triggerId: trigger.id,
        eventType: 'OBD_DEVICE_UNPLUGGED',
        active: true,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }

    if (trigger.failureCount > 0) {
      return {
        state: WebhookConfigurationStateEnum.ERROR,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.TRIGGER_DELIVERY_ERRORS,
        triggerId: trigger.id,
        eventType: 'OBD_DEVICE_UNPLUGGED',
        active: true,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }

    return {
      state: WebhookConfigurationStateEnum.CONFIGURED,
      reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.UNPLUG_TRIGGER_ENABLED,
      triggerId: trigger.id,
      eventType: 'OBD_DEVICE_UNPLUGGED',
      active: true,
      callbackUrl: trigger.targetUrl,
      failureCount: trigger.failureCount,
    };
  }

  private resolvePlugState(
    registry: TriggerRegistrySnapshot,
    recoveryPolicy: DeviceConnectionRecoveryPolicy,
    vehicleSubscribed: boolean,
    subscriptionError: { code: string; message: string } | null,
  ): DeviceConnectionTriggerStateView {
    if (recoveryPolicy === 'UNPLUG_WEBHOOK_PLUG_SNAPSHOT') {
      const enabledPlug = pickBestTrigger(registry.webhooks, 'OBD_PLUG');
      if (!enabledPlug || !enabledPlug.enabled) {
        return {
          state: WebhookConfigurationStateEnum.NOT_APPLICABLE,
          reasonCode:
            DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.PLUG_TRIGGER_NOT_REQUIRED_SNAPSHOT_RECOVERY,
          triggerId: enabledPlug?.id ?? null,
          eventType: 'OBD_DEVICE_PLUGGED_IN',
          active: enabledPlug?.enabled ?? false,
          callbackUrl: enabledPlug?.targetUrl ?? null,
          failureCount: enabledPlug?.failureCount ?? null,
        };
      }
    }

    const trigger = pickBestTrigger(registry.webhooks, 'OBD_PLUG');
    if (!trigger) {
      return {
        ...EMPTY_TRIGGER_STATE,
        state: WebhookConfigurationStateEnum.NOT_CONFIGURED,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.PLUG_TRIGGER_DISABLED_BY_POLICY,
        eventType: 'OBD_DEVICE_PLUGGED_IN',
      };
    }

    return this.mapTriggerToState(
      trigger,
      'OBD_DEVICE_PLUGGED_IN',
      vehicleSubscribed,
      subscriptionError,
      DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.PLUG_TRIGGER_ENABLED,
    );
  }

  private mapTriggerToState(
    trigger: NormalizedDimoTriggerWebhook,
    eventType: 'OBD_DEVICE_UNPLUGGED' | 'OBD_DEVICE_PLUGGED_IN',
    vehicleSubscribed: boolean,
    subscriptionError: { code: string; message: string } | null,
    configuredReason: (typeof DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES)[keyof typeof DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES],
  ): DeviceConnectionTriggerStateView {
    if (!trigger.enabled) {
      return {
        state: WebhookConfigurationStateEnum.NOT_CONFIGURED,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.TRIGGER_INACTIVE,
        triggerId: trigger.id,
        eventType,
        active: false,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }
    if (!trigger.pointsToCallback) {
      return {
        state: WebhookConfigurationStateEnum.ERROR,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.CALLBACK_URL_MISMATCH,
        triggerId: trigger.id,
        eventType,
        active: true,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }
    if (subscriptionError) {
      return {
        state: WebhookConfigurationStateEnum.UNKNOWN,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.DIMO_API_UNAVAILABLE,
        triggerId: trigger.id,
        eventType,
        active: true,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }
    if (!vehicleSubscribed) {
      return {
        state: WebhookConfigurationStateEnum.NOT_CONFIGURED,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.VEHICLE_NOT_SUBSCRIBED,
        triggerId: trigger.id,
        eventType,
        active: true,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }
    if (trigger.failureCount > 0) {
      return {
        state: WebhookConfigurationStateEnum.ERROR,
        reasonCode: DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.TRIGGER_DELIVERY_ERRORS,
        triggerId: trigger.id,
        eventType,
        active: true,
        callbackUrl: trigger.targetUrl,
        failureCount: trigger.failureCount,
      };
    }
    return {
      state: WebhookConfigurationStateEnum.CONFIGURED,
      reasonCode: configuredReason,
      triggerId: trigger.id,
      eventType,
      active: true,
      callbackUrl: trigger.targetUrl,
      failureCount: trigger.failureCount,
    };
  }

  private notApplicableView(
    recoveryPolicy: DeviceConnectionRecoveryPolicy,
    reasonCode: (typeof DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES)[keyof typeof DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES],
  ): DeviceConnectionWebhookConfigurationView {
    const base: DeviceConnectionTriggerStateView = {
      ...EMPTY_TRIGGER_STATE,
      state: WebhookConfigurationStateEnum.NOT_APPLICABLE,
      reasonCode,
    };
    return {
      unplugTriggerState: { ...base, eventType: 'OBD_DEVICE_UNPLUGGED' },
      plugTriggerState: {
        ...base,
        eventType: 'OBD_DEVICE_PLUGGED_IN',
        reasonCode:
          DEVICE_CONNECTION_WEBHOOK_CONFIG_REASON_CODES.PLUG_TRIGGER_NOT_REQUIRED_SNAPSHOT_RECOVERY,
        state: WebhookConfigurationStateEnum.NOT_APPLICABLE,
      },
      recoveryPolicy,
      lastSuccessfulDeliveryAt: null,
      lastDeliveryErrorAt: null,
      configSyncedAt: null,
      configSource: 'DEPLOYMENT_POLICY',
    };
  }

  private async loadDeliveryEvidence(vehicleId: string): Promise<{
    lastSuccessfulDeliveryAt: string | null;
    lastDeliveryErrorAt: string | null;
  }> {
    const batch = await this.loadDeliveryEvidenceBatch([vehicleId]);
    return (
      batch.get(vehicleId) ?? {
        lastSuccessfulDeliveryAt: null,
        lastDeliveryErrorAt: null,
      }
    );
  }

  private async loadDeliveryEvidenceBatch(vehicleIds: string[]): Promise<
    Map<
      string,
      { lastSuccessfulDeliveryAt: string | null; lastDeliveryErrorAt: string | null }
    >
  > {
    const out = new Map<
      string,
      { lastSuccessfulDeliveryAt: string | null; lastDeliveryErrorAt: string | null }
    >();
    if (vehicleIds.length === 0) return out;

    const errorRows = await this.prisma.deviceConnectionWebhookInbox.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        lastErrorCode: { not: null },
      },
      select: { vehicleId: true, receivedAt: true },
      orderBy: { receivedAt: 'desc' },
      distinct: ['vehicleId'],
    });

    const successRows = await this.prisma.deviceConnectionWebhookInbox.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        processingStatus: { in: ['PROCESSED', 'IGNORED_BY_POLICY'] },
      },
      select: { vehicleId: true, receivedAt: true },
      orderBy: { receivedAt: 'desc' },
      distinct: ['vehicleId'],
    });

    for (const vehicleId of vehicleIds) {
      out.set(vehicleId, {
        lastSuccessfulDeliveryAt: null,
        lastDeliveryErrorAt: null,
      });
    }

    for (const row of successRows) {
      if (!row.vehicleId) continue;
      const current = out.get(row.vehicleId)!;
      current.lastSuccessfulDeliveryAt = row.receivedAt.toISOString();
    }

    for (const row of errorRows) {
      if (!row.vehicleId) continue;
      const current = out.get(row.vehicleId)!;
      current.lastDeliveryErrorAt = row.receivedAt.toISOString();
    }

    return out;
  }
}
