import { Injectable } from '@nestjs/common';
import { InsightSeverity } from '@modules/business-insights/insight.types';
import { NotificationSeverity } from '../notification.enums';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import { mapObservationUrgencyToNotificationSeverity } from './technical-observation-lifecycle.util';
import type {
  NotificationAdapterContext,
  NotificationProducerAdapter,
  TechnicalObservationAdapterSource,
} from './notification-adapter.types';

/** Live producer — materializes technical observations as V2 notifications. */
@Injectable()
export class TechnicalObservationNotificationAdapter
  implements NotificationProducerAdapter<TechnicalObservationAdapterSource>
{
  readonly adapterId = 'technical-observation';
  readonly supportedEventTypes = ['TECHNICAL_OBSERVATION_ACTIVE'] as const;
  readonly shadowModeOnly = false;

  canHandle(source: TechnicalObservationAdapterSource): boolean {
    return Boolean(source.vehicleId && source.complaintId);
  }

  toCandidate(
    source: TechnicalObservationAdapterSource,
    context: NotificationAdapterContext,
  ) {
    const observationId = source.observationId ?? source.complaintId;
    const severity = source.resolved
      ? NotificationSeverity.SUCCESS
      : this.resolveSeverity(source.severity);

    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
      entityId: source.vehicleId,
      conditionCodeVariant: source.complaintId,
      sourceRef: source.sourceEventId ?? source.complaintId ?? context.sourceRef,
      sourceEventId: source.sourceEventId ?? context.sourceEventId ?? context.sourceRef,
      occurredAt: context.occurredAt,
      observedAt: context.observedAt ?? context.occurredAt,
      severity,
      correlationId: source.correlationId ?? context.correlationId,
      causationId: source.causationId ?? context.causationId,
      templateParams: { label: source.label },
      actionTargetContext: { vehicleId: source.vehicleId, module: 'complaints' },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        complaintId: source.complaintId,
        observationId,
        resolved: source.resolved ?? false,
      },
    });
    return validateRegistryCandidate(candidate);
  }

  private resolveSeverity(
    severity?: InsightSeverity,
  ): NotificationSeverity {
    if (!severity) return NotificationSeverity.WARNING;
    if (severity === InsightSeverity.CRITICAL) return NotificationSeverity.CRITICAL;
    if (severity === InsightSeverity.WARNING) return NotificationSeverity.WARNING;
    return NotificationSeverity.INFO;
  }
}
