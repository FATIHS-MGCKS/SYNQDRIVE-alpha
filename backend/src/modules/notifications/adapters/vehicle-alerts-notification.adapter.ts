import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '../notification.enums';
import type { NotificationTemplateParams } from '../notification.types';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  NotificationAdapterContext,
  NotificationProducerAdapter,
  VehicleAlertsNotificationAdapterSource,
} from './notification-adapter.types';

@Injectable()
export class VehicleAlertsNotificationAdapter
  implements NotificationProducerAdapter<VehicleAlertsNotificationAdapterSource>
{
  readonly adapterId = 'vehicle-alerts';
  readonly supportedEventTypes = [
    'LIMP_MODE_ACTIVE',
    'ENGINE_OIL_LEVEL_LOW',
    'ENGINE_OIL_LEVEL_HIGH',
  ] as const;
  readonly shadowModeOnly = false;

  canHandle(source: VehicleAlertsNotificationAdapterSource): boolean {
    return Boolean(source.vehicleId && source.eventType && source.label);
  }

  toCandidate(source: VehicleAlertsNotificationAdapterSource, context: NotificationAdapterContext) {
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
        module: 'health',
      },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        telltaleKey: source.telltaleKey,
        blocksRental: source.blocksRental,
        canonicalState: source.canonicalState,
        cleared: source.cleared ?? false,
      },
    });

    return validateRegistryCandidate(candidate);
  }

  private resolveSeverity(source: VehicleAlertsNotificationAdapterSource): NotificationSeverity {
    if (source.cleared) return NotificationSeverity.SUCCESS;
    if (source.severity === 'critical') return NotificationSeverity.CRITICAL;
    return NotificationSeverity.WARNING;
  }
}
