import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
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
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED,
]);

@Injectable()
export class BookingInvoiceConsumer
  extends BookingDomainEventConsumerBase
  implements BookingDomainEventConsumerHandler
{
  readonly consumerId = BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INVOICE;

  constructor(
    prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
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
      'bootstrap',
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

    const invoice = await this.invoicesService.bootstrapBookingInvoice(ctx.envelope.organizationId, {
      id: booking.id,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      totalPriceCents: booking.totalPriceCents,
      dailyRateCents: booking.dailyRateCents,
      startDate: booking.startDate,
      endDate: booking.endDate,
      currency: booking.currency,
      kmIncluded: booking.kmIncluded,
    });

    return this.succeeded(businessKey, { invoiceId: invoice?.id ?? null });
  }
}
