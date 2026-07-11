import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '../notification.enums';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  LowUtilizationAdapterSource,
  NotificationAdapterContext,
  NotificationProducerAdapter,
} from './notification-adapter.types';

/** Maps low-utilization detector output to registry candidates (live BI sync). */
@Injectable()
export class LowUtilizationNotificationAdapter
  implements NotificationProducerAdapter<LowUtilizationAdapterSource>
{
  readonly adapterId = 'low-utilization';
  readonly supportedEventTypes = ['LOW_UTILIZATION'] as const;
  readonly shadowModeOnly = false;

  canHandle(source: LowUtilizationAdapterSource): boolean {
    return Boolean(source.vehicleId && source.label);
  }

  toCandidate(source: LowUtilizationAdapterSource, context: NotificationAdapterContext) {
    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: 'LOW_UTILIZATION',
      entityId: source.vehicleId,
      sourceRef: context.sourceRef,
      occurredAt: context.occurredAt,
      severity: source.cleared ? NotificationSeverity.SUCCESS : NotificationSeverity.INFO,
      templateParams: {
        label: source.label,
        plate: source.label,
        idleDays: source.idleDays,
        lostRevenueEur: source.lostRevenueEur,
        vehicleId: source.vehicleId,
      },
      actionTargetContext: { vehicleId: source.vehicleId },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
      },
    });

    return validateRegistryCandidate(candidate);
  }
}
