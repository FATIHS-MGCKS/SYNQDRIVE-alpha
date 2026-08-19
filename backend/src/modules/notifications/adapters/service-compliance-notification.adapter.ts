import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '../notification.enums';
import type { NotificationTemplateParams } from '../notification.types';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  NotificationAdapterContext,
  NotificationProducerAdapter,
  ServiceComplianceAdapterSource,
} from './notification-adapter.types';

/** Live producer — materializes canonical service_compliance state as V2 notifications. */
@Injectable()
export class ServiceComplianceNotificationAdapter
  implements NotificationProducerAdapter<ServiceComplianceAdapterSource>
{
  readonly adapterId = 'service-compliance';
  readonly supportedEventTypes = [
    'TUV_OVERDUE',
    'BOKRAFT_OVERDUE',
    'SERVICE_OVERDUE',
  ] as const;
  readonly shadowModeOnly = false;

  canHandle(source: ServiceComplianceAdapterSource): boolean {
    return Boolean(source.vehicleId && source.eventType && source.label);
  }

  toCandidate(source: ServiceComplianceAdapterSource, context: NotificationAdapterContext) {
    const severity = this.resolveSeverity(source);
    const templateParams: NotificationTemplateParams = { label: source.label };
    if (source.reason) templateParams.reason = source.reason;

    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: source.eventType,
      entityId: source.vehicleId,
      sourceRef: context.sourceRef,
      occurredAt: context.occurredAt,
      severity,
      templateParams,
      actionTargetContext: {
        vehicleId: source.vehicleId,
        module: 'service',
      },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        reason: source.reason,
        blocksRental: source.blocksRental,
        cleared: source.cleared ?? false,
      },
    });

    return validateRegistryCandidate(candidate);
  }

  private resolveSeverity(source: ServiceComplianceAdapterSource): NotificationSeverity {
    if (source.cleared) return NotificationSeverity.SUCCESS;
    if (source.severity === 'critical') return NotificationSeverity.CRITICAL;
    return NotificationSeverity.WARNING;
  }
}
