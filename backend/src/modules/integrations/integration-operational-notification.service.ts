import { Injectable, Logger } from '@nestjs/common';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import {
  NotificationEntityType,
  NotificationSeverity,
  NotificationSourceType,
} from '@modules/notifications/notification.enums';
import { buildCandidateFromRegistry } from '@modules/notifications/registry/notification-event-registry';

export interface IntegrationNotificationSyncInput {
  organizationId: string;
  organizationIntegrationId: string;
  integrationName: string;
  integrationType: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  sourceEventId: string;
  occurredAt?: Date;
}

@Injectable()
export class IntegrationOperationalNotificationService {
  private readonly logger = new Logger(IntegrationOperationalNotificationService.name);

  constructor(private readonly notificationCore: NotificationCoreService) {}

  async syncOrganizationIntegration(input: IntegrationNotificationSyncInput): Promise<void> {
    if (!this.notificationCore.isEnabled()) return;

    const occurredAt = input.occurredAt ?? new Date();
    const entityId = input.organizationId;
    const integrationName = input.integrationName.trim() || input.integrationType;

    if (input.status === 'INACTIVE' || input.status === 'ERROR') {
      const severity =
        input.status === 'ERROR' ? NotificationSeverity.CRITICAL : NotificationSeverity.WARNING;
      try {
        const candidate = buildCandidateFromRegistry({
          organizationId: input.organizationId,
          eventType: 'INTEGRATION_DISCONNECTED',
          entityType: NotificationEntityType.ORGANIZATION,
          entityId,
          conditionCodeVariant: input.organizationIntegrationId,
          sourceType: NotificationSourceType.SYSTEM,
          sourceEventId: input.sourceEventId,
          sourceRef: `integration:${input.organizationIntegrationId}:${input.status.toLowerCase()}`,
          occurredAt,
          severity,
          templateParams: { integrationName },
          metadata: {
            integrationName,
            correlationId: input.sourceEventId,
          },
        });
        await this.notificationCore.ingestCandidate(candidate);
      } catch (err: unknown) {
        this.logger.warn(
          `Integration disconnect notification failed (${input.organizationIntegrationId}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }

    try {
      const candidate = buildCandidateFromRegistry({
        organizationId: input.organizationId,
        eventType: 'INTEGRATION_DISCONNECTED',
        entityType: NotificationEntityType.ORGANIZATION,
        entityId,
        conditionCodeVariant: input.organizationIntegrationId,
        sourceType: NotificationSourceType.SYSTEM,
        sourceEventId: `${input.sourceEventId}:recovered`,
        sourceRef: `integration:${input.organizationIntegrationId}:active`,
        occurredAt,
        severity: NotificationSeverity.SUCCESS,
        templateParams: { integrationName },
        metadata: {
          integrationName,
          correlationId: input.sourceEventId,
          cleared: true,
        },
      });
      await this.notificationCore.ingestCandidate(candidate);
    } catch (err: unknown) {
      this.logger.warn(
        `Integration reconnect notification resolve failed (${input.organizationIntegrationId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
