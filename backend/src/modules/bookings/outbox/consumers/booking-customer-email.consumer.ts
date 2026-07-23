import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingLegalDocumentEmailService } from '@modules/outbound-email/booking-legal-document-email.service';
import { buildLegalDocumentEmailSendIdempotencyKey } from '@modules/outbound-email/legal-document-email-send.contract';
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
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED,
]);

@Injectable()
export class BookingCustomerEmailConsumer
  extends BookingDomainEventConsumerBase
  implements BookingDomainEventConsumerHandler
{
  readonly consumerId = BOOKING_DOMAIN_EVENT_CONSUMER_IDS.CUSTOMER_EMAIL;

  constructor(
    prisma: PrismaService,
    private readonly legalEmail: BookingLegalDocumentEmailService,
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
      'auto-confirm',
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

    if (booking.status !== 'CONFIRMED') {
      return this.skipped(businessKey, 'NOT_CONFIRMED', { status: booking.status });
    }

    const idempotencyKey = buildLegalDocumentEmailSendIdempotencyKey({
      organizationId: ctx.envelope.organizationId,
      bookingId: booking.id,
      documentIds: [],
      toEmail: 'auto',
      clientRequestId: `auto-confirm:${booking.id}`,
    });

    const result = await this.legalEmail.maybeAutoSendFrozenBookingDocuments(
      ctx.envelope.organizationId,
      booking.id,
      ctx.actorUserId ?? null,
    );

    if (!result.sent) {
      if (result.reason === 'DISABLED' || result.reason === 'NO_CUSTOMER_EMAIL') {
        return this.skipped(businessKey, result.reason);
      }
      if (result.reason === 'NO_SENDABLE_DOCUMENTS') {
        throw new BookingDomainEventConsumerError(
          'Frozen booking documents not yet ready for customer email',
          { retryable: true, code: 'RETRYABLE_DEPENDENCY' },
        );
      }
      if (result.reason === 'FAILED') {
        throw new BookingDomainEventConsumerError(result.error ?? 'Customer email send failed', {
          retryable: true,
          code: 'RETRYABLE_EXTERNAL',
        });
      }
      return this.skipped(businessKey, result.reason ?? 'UNKNOWN');
    }

    return this.succeeded(businessKey, {
      bookingId: booking.id,
      recipientScope: 'customer',
      templateVersion: 'booking-documents-auto-confirm-v1',
      documentReferences: result.email?.attachments?.map((a) => a.generatedDocumentId) ?? [],
      idempotencyKey,
      outboundEmailId: result.email?.id ?? null,
      deduplicated: result.deduplicated ?? false,
    });
  }
}
