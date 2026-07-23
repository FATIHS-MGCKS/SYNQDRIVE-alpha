import { Injectable, Logger } from '@nestjs/common';
import type { BookingDomainEventOutbox } from '@prisma/client';
import type { BookingDomainEventEnvelope } from './booking-domain-event.types';

@Injectable()
export class BookingDomainEventConsumerService {
  private readonly logger = new Logger(BookingDomainEventConsumerService.name);

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

  /** @deprecated Use BookingDomainEventConsumerRouterService */
  async processPrimaryConsumer(row: BookingDomainEventOutbox): Promise<void> {
    this.logger.debug(`processPrimaryConsumer is deprecated for event ${row.id}`);
  }
}
