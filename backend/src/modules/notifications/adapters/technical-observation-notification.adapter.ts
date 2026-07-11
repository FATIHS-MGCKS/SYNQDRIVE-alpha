import { Injectable } from '@nestjs/common';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  NotificationAdapterContext,
  NotificationProducerAdapter,
  TechnicalObservationAdapterSource,
} from './notification-adapter.types';

/** Shadow-mode test adapter for active technical observations. */
@Injectable()
export class TechnicalObservationNotificationAdapter
  implements NotificationProducerAdapter<TechnicalObservationAdapterSource>
{
  readonly adapterId = 'technical-observation';
  readonly supportedEventTypes = ['TECHNICAL_OBSERVATION_ACTIVE'] as const;
  readonly shadowModeOnly = true;

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
      sourceRef: source.complaintId ?? context.sourceRef,
      occurredAt: context.occurredAt,
      templateParams: { label: source.label },
      actionTargetContext: { vehicleId: source.vehicleId, module: 'complaints' },
      metadata: { runId: context.runId, adapterId: this.adapterId, complaintId: source.complaintId },
    });
    return validateRegistryCandidate(candidate);
  }
}
