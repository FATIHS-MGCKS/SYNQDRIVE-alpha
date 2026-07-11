import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '../notification.enums';
import type { NotificationTemplateParams } from '../notification.types';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  NotificationAdapterContext,
  NotificationProducerAdapter,
  VehicleHealthAdapterSource,
} from './notification-adapter.types';

const MODULE_BY_EVENT: Record<string, string> = {
  ACTIVE_DTC: 'health',
  BATTERY_CRITICAL: 'battery',
  TIRE_CRITICAL: 'tires',
  BRAKE_CRITICAL: 'brakes',
};

/** Live producer — materializes Rental Health V1 warnings as V2 notifications. */
@Injectable()
export class VehicleHealthNotificationAdapter
  implements NotificationProducerAdapter<VehicleHealthAdapterSource>
{
  readonly adapterId = 'vehicle-health';
  readonly supportedEventTypes = [
    'ACTIVE_DTC',
    'BATTERY_CRITICAL',
    'TIRE_CRITICAL',
    'BRAKE_CRITICAL',
  ] as const;
  readonly shadowModeOnly = false;

  canHandle(source: VehicleHealthAdapterSource): boolean {
    return Boolean(source.vehicleId && source.eventType && source.label);
  }

  toCandidate(source: VehicleHealthAdapterSource, context: NotificationAdapterContext) {
    const severity = this.resolveSeverity(source);
    const templateParams: NotificationTemplateParams = { label: source.label };
    if (source.code) templateParams.code = source.code;
    if (source.reason) templateParams.reason = source.reason;

    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: source.eventType,
      entityId: source.vehicleId,
      conditionCodeVariant: source.code,
      sourceRef: context.sourceRef,
      occurredAt: context.occurredAt,
      severity,
      templateParams,
      actionTargetContext: {
        vehicleId: source.vehicleId,
        module: MODULE_BY_EVENT[source.eventType] ?? 'health',
      },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        reason: source.reason,
        cleared: source.cleared ?? false,
      },
    });

    return validateRegistryCandidate(candidate);
  }

  private resolveSeverity(source: VehicleHealthAdapterSource): NotificationSeverity {
    if (source.cleared) return NotificationSeverity.SUCCESS;
    if (source.severity === 'critical') return NotificationSeverity.CRITICAL;
    return NotificationSeverity.WARNING;
  }
}
