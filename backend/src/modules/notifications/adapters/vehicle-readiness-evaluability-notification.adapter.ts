import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '../notification.enums';
import type { NotificationTemplateParams } from '../notification.types';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  NotificationAdapterContext,
  NotificationProducerAdapter,
  VehicleReadinessEvaluabilityNotificationAdapterSource,
} from './notification-adapter.types';
import { VEHICLE_READINESS_EVALUABILITY_EVENT_TYPE } from './vehicle-readiness-evaluability-notification.projector';

@Injectable()
export class VehicleReadinessEvaluabilityNotificationAdapter
  implements NotificationProducerAdapter<VehicleReadinessEvaluabilityNotificationAdapterSource>
{
  readonly adapterId = 'vehicle-readiness-evaluability-aggregate';
  readonly supportedEventTypes = [VEHICLE_READINESS_EVALUABILITY_EVENT_TYPE] as const;
  readonly shadowModeOnly = false;

  canHandle(source: VehicleReadinessEvaluabilityNotificationAdapterSource): boolean {
    return Boolean(
      source.vehicleId &&
        source.label &&
        source.eventType === VEHICLE_READINESS_EVALUABILITY_EVENT_TYPE,
    );
  }

  toCandidate(
    source: VehicleReadinessEvaluabilityNotificationAdapterSource,
    context: NotificationAdapterContext,
  ) {
    const templateParams: NotificationTemplateParams = { label: source.label };

    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: source.eventType,
      entityId: source.vehicleId,
      sourceRef: context.sourceRef,
      occurredAt: context.occurredAt,
      severity: source.cleared ? NotificationSeverity.SUCCESS : NotificationSeverity.WARNING,
      templateParams,
      actionTargetContext: {
        vehicleId: source.vehicleId,
      },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        rentalReadiness: source.rentalReadiness,
        availability: source.availability,
        projectionVersion: source.projectionVersion,
        cleared: source.cleared ?? false,
      },
    });

    return validateRegistryCandidate(candidate);
  }
}
