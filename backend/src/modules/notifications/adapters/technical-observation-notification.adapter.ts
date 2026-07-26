import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '../notification.enums';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
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
    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
      entityId: source.vehicleId,
      conditionCodeVariant: source.complaintId,
      sourceRef: source.complaintId ?? context.sourceRef,
      sourceEventId: source.complaintId ?? context.sourceEventId ?? context.sourceRef,
      occurredAt: context.occurredAt,
      observedAt: context.observedAt ?? context.occurredAt,
      severity: source.resolved ? NotificationSeverity.SUCCESS : undefined,
      templateParams: { label: source.label },
      actionTargetContext: { vehicleId: source.vehicleId, module: 'complaints' },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        complaintId: source.complaintId,
        resolved: source.resolved ?? false,
      },
    });
    return validateRegistryCandidate(candidate);
  }
}
