import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { RentalContractService } from '@modules/documents/rental-contract.service';
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
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
]);

@Injectable()
export class BookingRentalAgreementConsumer
  extends BookingDomainEventConsumerBase
  implements BookingDomainEventConsumerHandler
{
  readonly consumerId = BOOKING_DOMAIN_EVENT_CONSUMER_IDS.RENTAL_AGREEMENT;

  constructor(
    prisma: PrismaService,
    private readonly rentalContract: RentalContractService,
    private readonly bundleService: BookingDocumentBundleService,
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
      ctx.envelope.eventId,
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

    if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
      return this.skipped(businessKey, 'STATUS_NOT_ELIGIBLE', { status: booking.status });
    }

    const contract = await this.rentalContract.ensureDraftRecordForBooking(
      ctx.envelope.organizationId,
      booking,
    );
    const bundle = await this.bundleService.getOrCreateBundle(
      ctx.envelope.organizationId,
      booking.id,
    );

    return this.succeeded(businessKey, {
      rentalContractId: contract.id,
      bundleId: bundle.id,
      contractStatus: contract.status,
    });
  }
}
