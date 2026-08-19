import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '../notification.enums';
import type { NotificationTemplateParams } from '../notification.types';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  NotificationAdapterContext,
  NotificationProducerAdapter,
  VehicleDamageNotificationAdapterSource,
} from './notification-adapter.types';

/** Live producer — materializes blocking vehicle damage as V2 notifications. */
@Injectable()
export class VehicleDamageNotificationAdapter
  implements NotificationProducerAdapter<VehicleDamageNotificationAdapterSource>
{
  readonly adapterId = 'vehicle-damage';
  readonly supportedEventTypes = ['VEHICLE_DAMAGE_BLOCKING'] as const;
  readonly shadowModeOnly = false;

  canHandle(source: VehicleDamageNotificationAdapterSource): boolean {
    return Boolean(source.vehicleId && source.damageId && source.eventType);
  }

  toCandidate(source: VehicleDamageNotificationAdapterSource, context: NotificationAdapterContext) {
    const severity = this.resolveSeverity(source);
    const templateParams: NotificationTemplateParams = { label: source.label };
    if (source.reason) templateParams.reason = source.reason;

    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: source.eventType,
      entityId: source.vehicleId,
      conditionCodeVariant: source.damageId,
      sourceRef: source.damageId ?? context.sourceRef,
      occurredAt: context.occurredAt,
      severity,
      templateParams,
      actionTargetContext: {
        vehicleId: source.vehicleId,
        module: 'damages',
      },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        damageId: source.damageId,
        rentalImpact: source.rentalImpact,
        cleared: source.cleared ?? false,
      },
    });

    return validateRegistryCandidate(candidate);
  }

  private resolveSeverity(source: VehicleDamageNotificationAdapterSource): NotificationSeverity {
    if (source.cleared) return NotificationSeverity.SUCCESS;
    if (source.severity === 'critical') return NotificationSeverity.CRITICAL;
    return NotificationSeverity.WARNING;
  }
}
