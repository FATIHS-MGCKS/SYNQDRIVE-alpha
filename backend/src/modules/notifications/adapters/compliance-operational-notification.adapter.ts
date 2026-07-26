import { Injectable } from '@nestjs/common';
import { InsightSeverity } from '@modules/business-insights/insight.types';
import { NotificationSeverity } from '../notification.enums';
import type { NotificationTemplateParams } from '../notification.types';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  ComplianceOperationalAdapterSource,
  NotificationAdapterContext,
  NotificationProducerAdapter,
} from './notification-adapter.types';

const COMPLIANCE_EVENT_TYPES = [
  'SERVICE_OVERDUE',
  'TUV_OVERDUE',
  'BOKRAFT_OVERDUE',
] as const;

/** Maps compliance detector output to registry notification candidates. */
@Injectable()
export class ComplianceOperationalNotificationAdapter
  implements NotificationProducerAdapter<ComplianceOperationalAdapterSource>
{
  readonly adapterId = 'compliance-operational';
  readonly supportedEventTypes = COMPLIANCE_EVENT_TYPES;
  readonly shadowModeOnly = false;

  canHandle(source: ComplianceOperationalAdapterSource): boolean {
    return Boolean(source.vehicleId && source.eventType && source.label);
  }

  toCandidate(
    source: ComplianceOperationalAdapterSource,
    context: NotificationAdapterContext,
  ) {
    const severity = source.cleared
      ? NotificationSeverity.SUCCESS
      : this.mapSeverity(source.insightSeverity);

    const templateParams: NotificationTemplateParams = { label: source.label };
    if (source.remainingDays != null) templateParams.remainingDays = source.remainingDays;
    if (source.remainingKm != null) templateParams.remainingKm = source.remainingKm;
    if (source.complianceKind) templateParams.complianceKind = source.complianceKind;

    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: source.eventType,
      entityId: source.vehicleId,
      sourceEventId: source.sourceEventId ?? context.sourceEventId ?? context.sourceRef,
      sourceRef: source.sourceEventId ?? context.sourceRef,
      occurredAt: context.occurredAt,
      observedAt: context.observedAt ?? context.occurredAt,
      severity,
      templateParams,
      actionTargetContext: { vehicleId: source.vehicleId, module: 'service' },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        dedupeKey: source.dedupeKey,
        cleared: source.cleared ?? false,
      },
    });

    return validateRegistryCandidate(candidate);
  }

  private mapSeverity(severity: InsightSeverity): NotificationSeverity {
    if (severity === InsightSeverity.CRITICAL) return NotificationSeverity.CRITICAL;
    if (severity === InsightSeverity.WARNING) return NotificationSeverity.WARNING;
    return NotificationSeverity.INFO;
  }
}
