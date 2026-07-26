import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '../notification.enums';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  DrivingAssessmentAdapterSource,
  NotificationAdapterContext,
  NotificationProducerAdapter,
} from './notification-adapter.types';

/**
 * Live adapter — maps driving assessment runtime state to registry candidate.
 */
@Injectable()
export class DrivingAssessmentNotificationAdapter
  implements NotificationProducerAdapter<DrivingAssessmentAdapterSource>
{
  readonly adapterId = 'driving-assessment';
  readonly supportedEventTypes = ['DRIVING_ASSESSMENT_DEVICE_QUALITY'] as const;
  readonly shadowModeOnly = false;

  canHandle(source: DrivingAssessmentAdapterSource): boolean {
    return Boolean(source.vehicleId);
  }

  toCandidate(
    source: DrivingAssessmentAdapterSource,
    context: NotificationAdapterContext,
  ) {
    const severity = source.degraded
      ? NotificationSeverity.WARNING
      : NotificationSeverity.SUCCESS;

    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      entityId: source.vehicleId,
      sourceEventId: source.sourceRef ?? context.sourceEventId ?? context.sourceRef,
      sourceRef: source.sourceRef ?? context.sourceEventId ?? context.sourceRef,
      occurredAt: context.occurredAt,
      observedAt: context.observedAt ?? context.occurredAt,
      severity,
      templateParams: { label: source.label },
      actionTargetContext: { vehicleId: source.vehicleId, module: 'health' },
      metadata: { runId: context.runId, adapterId: this.adapterId },
    });

    if (!source.degraded) {
      candidate.titleKey = 'notification.title.drivingAssessmentRecovering';
      candidate.bodyKey = 'notification.body.drivingAssessmentRecovering';
    }

    return validateRegistryCandidate(candidate);
  }
}
