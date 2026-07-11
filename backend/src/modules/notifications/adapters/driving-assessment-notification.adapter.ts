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
 * Shadow-mode test adapter — maps driving assessment runtime state to registry candidate.
 * Does not duplicate detector logic; expects pre-classified degraded/recovered input.
 */
@Injectable()
export class DrivingAssessmentNotificationAdapter
  implements NotificationProducerAdapter<DrivingAssessmentAdapterSource>
{
  readonly adapterId = 'driving-assessment';
  readonly supportedEventTypes = ['DRIVING_ASSESSMENT_DEVICE_QUALITY'] as const;
  readonly shadowModeOnly = true;

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
      sourceRef: source.sourceRef ?? context.sourceRef,
      occurredAt: context.occurredAt,
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
