import { Injectable } from '@nestjs/common';
import { BookingPaymentRequestStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PaymentEmailEnqueueService } from '@modules/payments/email/payment-email-enqueue.service';
import { BOOKING_DOMAIN_EVENT_TYPES } from '../booking-domain-event.types';
import {
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS,
  buildBookingDomainEventConsumerBusinessKey,
} from './booking-domain-event-consumer.constants';
import { BookingDomainEventConsumerBase } from './booking-domain-event-consumer.base';
import type {
  BookingDomainEventConsumerContext,
  BookingDomainEventConsumerHandler,
  BookingDomainEventConsumerResult,
} from './booking-domain-event-consumer.types';

const SUPPORTED = new Set<string>([
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
]);

@Injectable()
export class BookingPaymentLinkConsumer
  extends BookingDomainEventConsumerBase
  implements BookingDomainEventConsumerHandler
{
  readonly consumerId = BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PAYMENT_LINK;

  constructor(
    prisma: PrismaService,
    private readonly paymentEmailEnqueue: PaymentEmailEnqueueService,
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
      'payment-link',
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

    if (!this.paymentEmailEnqueue.isEnabled()) {
      return this.skipped(businessKey, 'PAYMENT_EMAIL_DISABLED');
    }

    const paymentRequest = await this.prisma.bookingPaymentRequest.findFirst({
      where: {
        organizationId: ctx.envelope.organizationId,
        bookingId: booking.id,
        sendEmailOnLink: true,
        status: {
          in: [
            BookingPaymentRequestStatus.LINK_PENDING,
            BookingPaymentRequestStatus.CHECKOUT_READY,
            BookingPaymentRequestStatus.LINK_SENT,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!paymentRequest) {
      return this.skipped(businessKey, 'NO_PAYMENT_REQUEST');
    }

    if (!paymentRequest.checkoutUrl) {
      return this.skipped(businessKey, 'CHECKOUT_URL_MISSING', {
        paymentRequestId: paymentRequest.id,
      });
    }

    const outboxId = await this.paymentEmailEnqueue.maybeEnqueueAfterCheckout({
      organizationId: ctx.envelope.organizationId,
      paymentRequestId: paymentRequest.id,
    });

    if (!outboxId) {
      return this.skipped(businessKey, 'NOT_ENQUEUED', { paymentRequestId: paymentRequest.id });
    }

    return this.succeeded(businessKey, {
      paymentRequestId: paymentRequest.id,
      paymentEmailOutboxId: outboxId,
      idempotencyKey: `payment-link:${paymentRequest.id}`,
    });
  }
}
