import { Injectable } from '@nestjs/common';
import { InsightSeverity } from '@modules/business-insights/insight.types';
import { NotificationEntityType, NotificationSeverity } from '../notification.enums';
import type { NotificationTemplateParams } from '../notification.types';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import type {
  BookingHandoverAdapterSource,
  NotificationAdapterContext,
  NotificationProducerAdapter,
} from './notification-adapter.types';

const BOOKING_HANDOVER_EVENT_TYPES = [
  'PICKUP_OVERDUE',
  'RETURN_OVERDUE',
  'TIGHT_HANDOVER',
  'RETURN_NEEDS_INSPECTION',
] as const;

/** Maps booking/handover BI and runtime sources to registry notification candidates. */
@Injectable()
export class BookingHandoverNotificationAdapter
  implements NotificationProducerAdapter<BookingHandoverAdapterSource>
{
  readonly adapterId = 'booking-handover';
  readonly supportedEventTypes = BOOKING_HANDOVER_EVENT_TYPES;
  readonly shadowModeOnly = false;

  canHandle(source: BookingHandoverAdapterSource): boolean {
    return Boolean(source.bookingId && source.eventType && source.label && source.bookingRef);
  }

  toCandidate(source: BookingHandoverAdapterSource, context: NotificationAdapterContext) {
    const severity = source.cleared
      ? NotificationSeverity.SUCCESS
      : this.mapSeverity(source.insightSeverity);

    const templateParams: NotificationTemplateParams = {
      label: source.label,
      bookingRef: source.bookingRef,
    };
    if (source.minutesOverdue != null) {
      templateParams.minutesOverdue = source.minutesOverdue;
    }

    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: source.eventType,
      entityId: source.bookingId,
      entityType: NotificationEntityType.BOOKING,
      conditionCodeVariant: source.conditionCodeVariant,
      sourceEventId: source.sourceEventId ?? context.sourceEventId ?? context.sourceRef,
      sourceRef: source.sourceEventId ?? context.sourceRef,
      occurredAt: source.occurredAt ?? context.occurredAt,
      observedAt: context.observedAt ?? source.occurredAt ?? context.occurredAt,
      severity,
      templateParams,
      actionTargetContext: {
        bookingId: source.bookingId,
        vehicleId: source.vehicleId,
      },
      metadata: {
        runId: context.runId,
        adapterId: this.adapterId,
        dedupeKey: source.dedupeKey,
        cleared: source.cleared ?? false,
      },
    });

    return validateRegistryCandidate(candidate);
  }

  private mapSeverity(severity: InsightSeverity | string): NotificationSeverity {
    if (severity === InsightSeverity.CRITICAL || severity === 'CRITICAL') {
      return NotificationSeverity.CRITICAL;
    }
    if (severity === InsightSeverity.WARNING || severity === 'WARNING') {
      return NotificationSeverity.WARNING;
    }
    return NotificationSeverity.INFO;
  }
}
