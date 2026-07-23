import { Injectable } from '@nestjs/common';
import { NotificationSeverity } from '@modules/notifications/notification.enums';
import { buildCandidateFromRegistry } from '@modules/notifications/registry/notification-event-registry';
import { validateRegistryCandidate } from '@modules/notifications/registry/notification-event-registry.validator';
import type {
  BookingAdapterSource,
  NotificationAdapterContext,
  NotificationProducerAdapter,
} from './notification-adapter.types';

@Injectable()
export class BookingNotificationAdapter implements NotificationProducerAdapter<BookingAdapterSource> {
  readonly adapterId = 'bookings';
  readonly supportedEventTypes = [
    'BOOKING_CREATED',
    'BOOKING_UPDATED',
  ] as const;
  readonly shadowModeOnly = false;

  canHandle(source: BookingAdapterSource): boolean {
    return Boolean(source.bookingId && source.eventType);
  }

  toCandidate(source: BookingAdapterSource, context: NotificationAdapterContext) {
    const candidate = buildCandidateFromRegistry({
      organizationId: context.organizationId,
      eventType: source.eventType,
      entityId: source.bookingId,
      sourceRef: context.sourceRef,
      occurredAt: context.occurredAt,
      severity: NotificationSeverity.INFO,
      templateParams: {
        bookingRef: source.bookingRef,
        label: source.label,
      },
      actionTargetContext: { bookingId: source.bookingId },
      metadata: { runId: context.runId, adapterId: this.adapterId },
    });

    return validateRegistryCandidate(candidate);
  }
}
