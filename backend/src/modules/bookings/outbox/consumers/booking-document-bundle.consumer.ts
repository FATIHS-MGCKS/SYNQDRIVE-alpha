import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDocumentGenerationDispatcherService } from '@modules/documents/booking-document-generation/booking-document-generation.dispatcher.service';
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

const INITIAL_BUNDLE_EVENTS = new Set<string>([
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
]);

const HANDOVER_EVENTS = new Set<string>([
  BOOKING_DOMAIN_EVENT_TYPES.PICKUP_COMPLETED,
  BOOKING_DOMAIN_EVENT_TYPES.RETURN_COMPLETED,
]);

@Injectable()
export class BookingDocumentBundleConsumer
  extends BookingDomainEventConsumerBase
  implements BookingDomainEventConsumerHandler
{
  readonly consumerId = BOOKING_DOMAIN_EVENT_CONSUMER_IDS.DOCUMENT_BUNDLE;

  constructor(
    prisma: PrismaService,
    private readonly dispatcher: BookingDocumentGenerationDispatcherService,
  ) {
    super(prisma);
  }

  supportsEvent(eventType: string): boolean {
    return INITIAL_BUNDLE_EVENTS.has(eventType) || HANDOVER_EVENTS.has(eventType);
  }

  buildBusinessKey(ctx: BookingDomainEventConsumerContext): string {
    const suffix =
      ctx.envelope.eventType === BOOKING_DOMAIN_EVENT_TYPES.PICKUP_COMPLETED
        ? `pickup:${ctx.envelope.payload.protocolId ?? ctx.envelope.eventId}`
        : ctx.envelope.eventType === BOOKING_DOMAIN_EVENT_TYPES.RETURN_COMPLETED
          ? `return:${ctx.envelope.payload.protocolId ?? ctx.envelope.eventId}`
          : `initial:${ctx.envelope.eventId}`;
    return buildBookingDomainEventConsumerBusinessKey(this.consumerId, [
      ctx.envelope.organizationId,
      ctx.envelope.aggregateId,
      suffix,
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

    const orgId = ctx.envelope.organizationId;
    const actorUserId = ctx.actorUserId ?? null;

    if (INITIAL_BUNDLE_EVENTS.has(ctx.envelope.eventType)) {
      if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
        return this.skipped(businessKey, 'STATUS_NOT_ELIGIBLE', { status: booking.status });
      }
      const result = await this.dispatcher.enqueueInitialBundle(orgId, booking.id, actorUserId);
      return this.succeeded(businessKey, {
        jobId: result.jobId,
        idempotencyKey: result.idempotencyKey,
        enqueued: result.enqueued,
        status: result.status,
      });
    }

    const protocolId = ctx.envelope.payload.protocolId;
    if (!protocolId) {
      return this.skipped(businessKey, 'MISSING_PROTOCOL_ID');
    }

    if (ctx.envelope.eventType === BOOKING_DOMAIN_EVENT_TYPES.PICKUP_COMPLETED) {
      const result = await this.dispatcher.enqueuePickupProtocol(
        orgId,
        booking.id,
        protocolId,
        actorUserId,
      );
      return this.succeeded(businessKey, {
        jobId: result.jobId,
        idempotencyKey: result.idempotencyKey,
        enqueued: result.enqueued,
      });
    }

    const result = await this.dispatcher.enqueueReturnDocuments(
      orgId,
      booking.id,
      protocolId,
      actorUserId,
    );
    return this.succeeded(businessKey, {
      jobId: result.jobId,
      idempotencyKey: result.idempotencyKey,
      enqueued: result.enqueued,
    });
  }
}
