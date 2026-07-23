import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingInternalNotificationEmailService } from '@modules/outbound-email/booking-internal-notification-email.service';
import { BOOKING_DOMAIN_EVENT_TYPES } from '../booking-domain-event.types';
import {
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS,
  buildBookingDomainEventConsumerBusinessKey,
} from './booking-domain-event-consumer.constants';
import { BookingDomainEventConsumerBase } from './booking-domain-event-consumer.base';
import {
  BookingDomainEventConsumerError,
} from './booking-domain-event-consumer.errors';
import type {
  BookingDomainEventConsumerContext,
  BookingDomainEventConsumerHandler,
  BookingDomainEventConsumerResult,
} from './booking-domain-event-consumer.types';

const SUPPORTED = new Set<string>([
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
]);

@Injectable()
export class BookingInternalEmailConsumer
  extends BookingDomainEventConsumerBase
  implements BookingDomainEventConsumerHandler
{
  readonly consumerId = BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INTERNAL_EMAIL;

  constructor(
    prisma: PrismaService,
    private readonly internalEmail: BookingInternalNotificationEmailService,
  ) {
    super(prisma);
  }

  supportsEvent(eventType: string): boolean {
    return SUPPORTED.has(eventType);
  }

  buildBusinessKey(ctx: BookingDomainEventConsumerContext): string {
    return buildBookingDomainEventConsumerBusinessKey(this.consumerId, [
      ctx.envelope.organizationId,
      ctx.envelope.aggregateId,
      ctx.envelope.eventType,
    ]);
  }

  async handle(ctx: BookingDomainEventConsumerContext): Promise<BookingDomainEventConsumerResult> {
    const businessKey = this.buildBusinessKey(ctx);
    const booking = await this.loadBooking(
      ctx.envelope.organizationId,
      ctx.envelope.aggregateId,
      ctx.envelope.organizationId,
    );
    this.assertNotStale(ctx, await this.latestAggregateVersion(booking.id));

    const idempotencyKey = `booking-internal:${ctx.envelope.organizationId}:${booking.id}:${ctx.envelope.eventType}`;
    const result = await this.internalEmail.maybeSendBookingInternalNotification({
      organizationId: ctx.envelope.organizationId,
      bookingId: booking.id,
      eventType: ctx.envelope.eventType,
      idempotencyKey,
      actorUserId: ctx.actorUserId ?? null,
    });

    if (!result.sent) {
      if (result.reason === 'NO_INTERNAL_RECIPIENT' || result.reason === 'BOOKING_NOT_FOUND') {
        return this.skipped(businessKey, result.reason);
      }
      throw new BookingDomainEventConsumerError(result.reason ?? 'Internal email failed', {
        retryable: true,
        code: 'RETRYABLE_EXTERNAL',
      });
    }

    return this.succeeded(businessKey, {
      bookingId: booking.id,
      recipientEmail: result.recipientEmail,
      templateVersion: 'booking-internal-notification-v1',
      documentReferences: [],
      idempotencyKey,
      outboundEmailId: result.outboundEmailId ?? null,
      deduplicated: result.deduplicated ?? false,
    });
  }
}
