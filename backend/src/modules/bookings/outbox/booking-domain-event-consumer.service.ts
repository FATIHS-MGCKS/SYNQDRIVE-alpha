import { Injectable, Logger } from '@nestjs/common';
import type { BookingDomainEventOutbox } from '@prisma/client';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import { BOOKING_DOMAIN_EVENT_PRIMARY_CONSUMER_ID } from './booking-domain-event-outbox.constants';
import type { BookingDomainEventEnvelope } from './booking-domain-event.types';
import { BookingDomainEventOutboxRepository } from './booking-domain-event-outbox.repository';

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

@Injectable()
export class BookingDomainEventConsumerService {
  private readonly logger = new Logger(BookingDomainEventConsumerService.name);

  constructor(
    private readonly outboxRepo: BookingDomainEventOutboxRepository,
    private readonly workflowEvents: WorkflowEventService,
  ) {}

  toEnvelope(row: BookingDomainEventOutbox): BookingDomainEventEnvelope {
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as BookingDomainEventEnvelope['payload'])
        : ({} as BookingDomainEventEnvelope['payload']);

    return {
      eventId: row.id,
      eventType: row.eventType as BookingDomainEventEnvelope['eventType'],
      aggregateId: row.aggregateId,
      organizationId: row.organizationId,
      aggregateVersion: row.aggregateVersion,
      occurredAt: row.occurredAt.toISOString(),
      payload,
      correlationId: row.correlationId,
      causationId: row.causationId,
    };
  }

  async processPrimaryConsumer(row: BookingDomainEventOutbox): Promise<void> {
    const existing = await this.outboxRepo.hasConsumerReceipt(
      row.id,
      BOOKING_DOMAIN_EVENT_PRIMARY_CONSUMER_ID,
    );
    if (existing) return;

    const envelope = this.toEnvelope(row);
    const workflowType = WORKFLOW_EVENT_TYPE_MAP[row.eventType];
    if (workflowType) {
      await this.workflowEvents.emitEvent({
        organizationId: row.organizationId,
        type: workflowType,
        entityType: 'booking',
        entityId: row.aggregateId,
        idempotencyKey: row.idempotencyKey,
        occurredAt: row.occurredAt,
        payload: {
          ...envelope.payload,
          eventId: envelope.eventId,
          aggregateVersion: envelope.aggregateVersion,
          correlationId: envelope.correlationId,
          causationId: envelope.causationId,
        },
      });
    } else {
      this.logger.debug(`No workflow mapping for booking event ${row.eventType}`);
    }

    await this.outboxRepo.recordConsumerReceipt(
      row.id,
      BOOKING_DOMAIN_EVENT_PRIMARY_CONSUMER_ID,
    );
  }
}
