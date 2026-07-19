import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { NotificationRepository } from '@modules/notifications/notification.repository';
import {
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
} from '@modules/notifications/notification.enums';
import { buildNotificationFingerprint } from '@modules/notifications/notification-fingerprint.factory';
import {
  buildCandidateFromRegistry,
  requireEventTypeDefinition,
} from '@modules/notifications/registry/notification-event-registry';
import {
  buildEpisodeScopedConditionCode,
  episodeConditionVariant,
  mapRecoverySourceToPolicy,
} from './connectivity-alert.dedupe';
import {
  evaluateDeviceAlertPolicy,
  shouldOpenAuthorizationAlert,
  shouldOpenCoverageInsufficientAlert,
  shouldOpenDataSourceDisconnectedAlert,
  shouldOpenTelemetryOfflineAlert,
  shouldOpenTelemetrySoftOfflineAlert,
  shouldResolveAuthorizationAlert,
  shouldResolveCoverageAlert,
  shouldResolveTelemetryAlerts,
} from './connectivity-alert.policy';
import {
  ConnectivityAlertType,
  type DeviceReconnectAlertInput,
  type DeviceUnplugAlertInput,
  type RuntimeConnectivityAlertSyncInput,
} from './connectivity-alert.types';

@Injectable()
export class ConnectivityAlertService {
  private readonly logger = new Logger(ConnectivityAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationCore: NotificationCoreService,
    @Optional() private readonly notificationRepository?: NotificationRepository,
  ) {}

  async onDeviceUnplugged(input: DeviceUnplugAlertInput): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;

    const prior = await this.loadEpisodeAlertHistory(
      input.organizationId,
      input.vehicleId,
      input.episodeId,
    );
    const policy = evaluateDeviceAlertPolicy({
      phase: 'open',
      priorNotifications: prior,
      recoverySource: 'snapshot_obd',
    });

    if (!policy.newNotifications.includes(ConnectivityAlertType.DEVICE_UNPLUGGED)) {
      return;
    }

    const candidate = buildCandidateFromRegistry({
      eventType: ConnectivityAlertType.DEVICE_UNPLUGGED,
      organizationId: input.organizationId,
      entityId: input.vehicleId,
      entityType: NotificationEntityType.VEHICLE,
      sourceType: NotificationSourceType.RUNTIME,
      sourceRef: `connectivity:episode:${input.episodeId}:unplug`,
      occurredAt: input.observedAt,
      templateParams: this.vehicleTemplateParams(input),
      conditionCodeVariant: episodeConditionVariant(input.episodeId),
      metadata: {
        episodeId: input.episodeId,
        deviceBindingId: input.deviceBindingId,
        stateVersion: input.stateVersion,
        provider: input.provider,
      },
    });

    await this.notificationCore.ingestCandidate(candidate);
  }

  async onEpisodeRecovered(input: DeviceReconnectAlertInput): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;

    const prior = await this.loadEpisodeAlertHistory(
      input.organizationId,
      input.vehicleId,
      input.episodeId,
    );
    const policy = evaluateDeviceAlertPolicy({
      phase: 'recovered',
      priorNotifications: prior,
      recoverySource: mapRecoverySourceToPolicy(input.recoverySource),
    });

    if (policy.resolveUnplug) {
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: ConnectivityAlertType.DEVICE_UNPLUGGED,
        episodeId: input.episodeId,
      });
    }

    if (!policy.newNotifications.includes(ConnectivityAlertType.DEVICE_RECONNECTED)) {
      return;
    }

    const def = requireEventTypeDefinition(ConnectivityAlertType.DEVICE_RECONNECTED);
    const candidate = buildCandidateFromRegistry({
      eventType: ConnectivityAlertType.DEVICE_RECONNECTED,
      organizationId: input.organizationId,
      entityId: input.vehicleId,
      entityType: NotificationEntityType.VEHICLE,
      sourceType: NotificationSourceType.RUNTIME,
      sourceRef: `connectivity:episode:${input.episodeId}:reconnect:${input.recoverySource}`,
      occurredAt: input.observedAt,
      severity: NotificationSeverity.INFO,
      templateParams: {
        ...this.vehicleTemplateParams(input),
        recoveryMethod: input.resolutionMethod ?? input.recoverySource,
      },
      conditionCodeVariant: episodeConditionVariant(input.episodeId),
      metadata: {
        episodeId: input.episodeId,
        recoverySource: input.recoverySource,
        resolutionMethod: input.resolutionMethod,
      },
    });

    await this.notificationCore.ingestCandidate({
      ...candidate,
      eventKind: NotificationEventKind.EVENT,
      resolutionPolicy: def.resolutionPolicy,
    });
  }

  async syncRuntimeAlerts(input: RuntimeConnectivityAlertSyncInput): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;

    const base = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      label: input.label,
      licensePlate: input.licensePlate,
      provider: input.provider,
      observedAt: input.observedAt,
    };

    if (shouldResolveTelemetryAlerts(input.telemetryFreshness)) {
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: ConnectivityAlertType.TELEMETRY_OFFLINE,
      });
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: ConnectivityAlertType.TELEMETRY_SOFT_OFFLINE,
      });
    } else if (shouldOpenTelemetrySoftOfflineAlert(input.telemetryFreshness)) {
      await this.ingestStateAlert({
        ...base,
        eventType: ConnectivityAlertType.TELEMETRY_SOFT_OFFLINE,
        severity: NotificationSeverity.WARNING,
        sourceRef: `connectivity:telemetry:soft:${input.vehicleId}`,
      });
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: ConnectivityAlertType.TELEMETRY_OFFLINE,
      });
    } else if (shouldOpenTelemetryOfflineAlert(input.telemetryFreshness)) {
      await this.ingestStateAlert({
        ...base,
        eventType: ConnectivityAlertType.TELEMETRY_OFFLINE,
        severity: NotificationSeverity.WARNING,
        sourceRef: `connectivity:telemetry:offline:${input.vehicleId}`,
      });
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: ConnectivityAlertType.TELEMETRY_SOFT_OFFLINE,
      });
    }

    if (shouldResolveAuthorizationAlert(input.providerLinkState)) {
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: ConnectivityAlertType.AUTHORIZATION_REQUIRED,
      });
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: ConnectivityAlertType.DATA_SOURCE_DISCONNECTED,
      });
    } else if (shouldOpenAuthorizationAlert(input.providerLinkState)) {
      await this.ingestStateAlert({
        ...base,
        eventType: ConnectivityAlertType.AUTHORIZATION_REQUIRED,
        severity: NotificationSeverity.WARNING,
        sourceRef: `connectivity:auth:${input.vehicleId}`,
      });
    } else if (
      shouldOpenDataSourceDisconnectedAlert({
        hasProviderLink: input.hasProviderLink,
        providerLinkState: input.providerLinkState,
      })
    ) {
      await this.ingestStateAlert({
        ...base,
        eventType: ConnectivityAlertType.DATA_SOURCE_DISCONNECTED,
        severity: NotificationSeverity.WARNING,
        sourceRef: `connectivity:source:${input.vehicleId}`,
      });
    }

    if (shouldResolveCoverageAlert(input.coverageState)) {
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: ConnectivityAlertType.DATA_COVERAGE_INSUFFICIENT,
      });
    } else if (shouldOpenCoverageInsufficientAlert(input.coverageState)) {
      await this.ingestStateAlert({
        ...base,
        eventType: ConnectivityAlertType.DATA_COVERAGE_INSUFFICIENT,
        severity: NotificationSeverity.INFO,
        sourceRef: `connectivity:coverage:${input.vehicleId}`,
      });
    }

    if (input.webhookProcessingFailed) {
      await this.ingestStateAlert({
        ...base,
        eventType: 'WEBHOOK_FAILURE',
        severity: NotificationSeverity.WARNING,
        sourceRef: `connectivity:webhook:${input.vehicleId}`,
      });
    } else {
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: 'WEBHOOK_FAILURE',
      });
    }

    if (input.bindingChanged) {
      await this.ingestStateAlert({
        ...base,
        eventType: ConnectivityAlertType.DEVICE_BINDING_CHANGED,
        severity: NotificationSeverity.INFO,
        sourceRef: `connectivity:binding:${input.vehicleId}:${input.observedAt.getTime()}`,
      });
    }

    if (input.connectivityStateUnknown) {
      await this.ingestStateAlert({
        ...base,
        eventType: ConnectivityAlertType.CONNECTIVITY_STATE_UNKNOWN,
        severity: NotificationSeverity.INFO,
        sourceRef: `connectivity:unknown:${input.vehicleId}`,
      });
    } else {
      await this.resolveStateAlert({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventType: ConnectivityAlertType.CONNECTIVITY_STATE_UNKNOWN,
      });
    }
  }

  private vehicleTemplateParams(input: {
    label: string;
    licensePlate?: string | null;
    vehicleId: string;
  }) {
    return {
      label: input.label,
      licensePlate: input.licensePlate ?? '',
      vehicleId: input.vehicleId,
    };
  }

  private async ingestStateAlert(input: {
    organizationId: string;
    vehicleId: string;
    provider: string;
    label: string;
    licensePlate?: string | null;
    eventType: string;
    severity: NotificationSeverity;
    sourceRef: string;
    observedAt: Date;
  }): Promise<void> {
    const candidate = buildCandidateFromRegistry({
      eventType: input.eventType,
      organizationId: input.organizationId,
      entityId: input.vehicleId,
      entityType: NotificationEntityType.VEHICLE,
      sourceType: NotificationSourceType.RUNTIME,
      sourceRef: input.sourceRef,
      occurredAt: input.observedAt,
      severity: input.severity,
      templateParams: this.vehicleTemplateParams(input),
      actionTargetContext: { vehicleId: input.vehicleId, module: 'connectivity' },
    });
    await this.notificationCore.ingestCandidate(candidate);
  }

  private async resolveStateAlert(input: {
    organizationId: string;
    vehicleId: string;
    eventType: string;
    episodeId?: string;
  }): Promise<void> {
    const def = requireEventTypeDefinition(input.eventType);
    const conditionCode = input.episodeId
      ? buildEpisodeScopedConditionCode(def.conditionCode, input.episodeId)
      : def.conditionCode;
    const { canonical } = buildNotificationFingerprint({
      organizationId: input.organizationId,
      eventType: def.eventType,
      entityType: def.defaultEntityType,
      entityId: input.vehicleId,
      conditionCode,
      scopeVersion: def.fingerprintVersion,
    });

    try {
      await this.notificationCore.resolveNotificationByFingerprint({
        organizationId: input.organizationId,
        fingerprint: canonical,
      });
    } catch {
      // No active notification — expected when condition was never opened.
    }
  }

  private async loadEpisodeAlertHistory(
    organizationId: string,
    vehicleId: string,
    episodeId: string,
  ): Promise<
    Array<
      | typeof ConnectivityAlertType.DEVICE_UNPLUGGED
      | typeof ConnectivityAlertType.DEVICE_RECONNECTED
    >
  > {
    if (!this.notificationRepository) return [];

    const unplugFingerprint = this.episodeFingerprint(
      organizationId,
      vehicleId,
      ConnectivityAlertType.DEVICE_UNPLUGGED,
      episodeId,
    );
    const reconnectFingerprint = this.episodeFingerprint(
      organizationId,
      vehicleId,
      ConnectivityAlertType.DEVICE_RECONNECTED,
      episodeId,
    );

    const prior: Array<
      | typeof ConnectivityAlertType.DEVICE_UNPLUGGED
      | typeof ConnectivityAlertType.DEVICE_RECONNECTED
    > = [];

    const unplug = await this.notificationRepository.findLatestByFingerprint(
      organizationId,
      unplugFingerprint,
    );
    if (unplug) {
      prior.push(ConnectivityAlertType.DEVICE_UNPLUGGED);
    }

    const reconnect = await this.notificationRepository.findLatestByFingerprint(
      organizationId,
      reconnectFingerprint,
    );
    if (reconnect) {
      prior.push(ConnectivityAlertType.DEVICE_RECONNECTED);
    }

    return prior;
  }

  private episodeFingerprint(
    organizationId: string,
    vehicleId: string,
    eventType: string,
    episodeId: string,
  ): string {
    const def = requireEventTypeDefinition(eventType);
    return buildNotificationFingerprint({
      organizationId,
      eventType: def.eventType,
      entityType: def.defaultEntityType,
      entityId: vehicleId,
      conditionCode: buildEpisodeScopedConditionCode(def.conditionCode, episodeId),
      scopeVersion: def.fingerprintVersion,
    }).canonical;
  }
}
