import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import { NotificationProducerRouter } from '@modules/notifications/adapters/notification-producer.router';
import { BookingNotificationAdapter } from '@modules/notifications/adapters/booking-notification.adapter';
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

const WORKFLOW_EVENT_TYPE_MAP: Record<string, string> = {
  BookingCreated: 'booking.created',
  BookingUpdated: 'booking.updated',
  BookingConfirmed: 'booking.confirmed',
  BookingCancelled: 'booking.cancelled',
  BookingMarkedNoShow: 'booking.no_show',
  BookingActivated: 'booking.activated',
  BookingCompleted: 'booking.completed',
  PickupCompleted: 'booking.pickup.completed',
  ReturnCompleted: 'booking.returned',
};

const NOTIFICATION_EVENT_TYPE_MAP: Record<string, string> = {
  BookingCreated: 'BOOKING_CREATED',
  BookingUpdated: 'BOOKING_UPDATED',
};

@Injectable()
export class BookingNotificationConsumer
  extends BookingDomainEventConsumerBase
  implements BookingDomainEventConsumerHandler
{
  readonly consumerId = BOOKING_DOMAIN_EVENT_CONSUMER_IDS.NOTIFICATIONS;

  constructor(
    prisma: PrismaService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly notificationRouter: NotificationProducerRouter,
    private readonly bookingNotificationAdapter: BookingNotificationAdapter,
  ) {
    super(prisma);
  }

  supportsEvent(eventType: string): boolean {
    return Boolean(WORKFLOW_EVENT_TYPE_MAP[eventType] || NOTIFICATION_EVENT_TYPE_MAP[eventType]);
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
    await this.loadBooking(
      ctx.envelope.organizationId,
      ctx.envelope.aggregateId,
      ctx.envelope.organizationId,
    );
    this.assertNotStale(ctx, await this.latestAggregateVersion(ctx.envelope.aggregateId));

    const workflowType = WORKFLOW_EVENT_TYPE_MAP[ctx.envelope.eventType];
    if (workflowType) {
      await this.workflowEvents.emitEvent({
        organizationId: ctx.envelope.organizationId,
        type: workflowType,
        entityType: 'booking',
        entityId: ctx.envelope.aggregateId,
        idempotencyKey: ctx.row.idempotencyKey,
        occurredAt: ctx.row.occurredAt,
        payload: {
          ...ctx.envelope.payload,
          eventId: ctx.envelope.eventId,
          aggregateVersion: ctx.envelope.aggregateVersion,
          correlationId: ctx.envelope.correlationId,
          causationId: ctx.envelope.causationId,
        },
      });
    }

    const notificationType = NOTIFICATION_EVENT_TYPE_MAP[ctx.envelope.eventType];
    if (notificationType) {
      const bookingRef = `BK-${ctx.envelope.aggregateId.slice(-6).toUpperCase()}`;
      await this.notificationRouter.ingestFromAdapter(
        this.bookingNotificationAdapter,
        {
          eventType: notificationType,
          bookingId: ctx.envelope.aggregateId,
          bookingRef,
          label: bookingRef,
        },
        {
          organizationId: ctx.envelope.organizationId,
          sourceRef: ctx.envelope.eventId,
          occurredAt: ctx.row.occurredAt,
          runId: ctx.envelope.correlationId,
        },
      );
    }

    return this.succeeded(businessKey, {
      workflowType: workflowType ?? null,
      notificationType: notificationType ?? null,
    });
  }
}
