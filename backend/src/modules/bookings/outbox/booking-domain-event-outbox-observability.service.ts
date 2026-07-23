import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { BookingDomainEventOutbox } from '@prisma/client';

@Injectable()
export class BookingDomainEventOutboxObservabilityService {
  private readonly logger = new Logger(BookingDomainEventOutboxObservabilityService.name);

  constructor(private readonly metrics: TripMetricsService) {}

  logProcessStarted(row: BookingDomainEventOutbox): void {
    this.logger.debug({
      msg: 'booking.domain_event.outbox.process_started',
      outboxId: row.id,
      eventType: row.eventType,
      organizationId: row.organizationId,
      aggregateId: row.aggregateId,
    });
  }

  logCompleted(row: BookingDomainEventOutbox): void {
    this.logger.log({
      msg: 'booking.domain_event.outbox.published',
      outboxId: row.id,
      eventType: row.eventType,
      organizationId: row.organizationId,
    });
  }

  logRetry(row: BookingDomainEventOutbox, error: string): void {
    this.logger.warn({
      msg: 'booking.domain_event.outbox.retry',
      outboxId: row.id,
      eventType: row.eventType,
      retryCount: row.retryCount,
      error,
    });
  }

  logDeadLetter(row: BookingDomainEventOutbox, error: string): void {
    this.logger.error({
      msg: 'booking.domain_event.outbox.dead_letter',
      outboxId: row.id,
      eventType: row.eventType,
      error,
    });
  }

  recordPublished(eventType: string): void {
    this.metrics.bookingDomainEventOutboxPublished.inc({ event_type: eventType });
  }

  recordRetry(eventType: string): void {
    this.metrics.bookingDomainEventOutboxRetry.inc({ event_type: eventType });
  }

  recordDeadLetter(eventType: string, errorCode: string): void {
    this.metrics.bookingDomainEventOutboxDeadLetter.inc({
      event_type: eventType,
      error_code: errorCode.slice(0, 64),
    });
  }

  recordEnqueued(eventType: string): void {
    this.metrics.bookingDomainEventOutboxEnqueued.inc({ event_type: eventType });
  }

  setQueueBacklog(count: number): void {
    this.metrics.bookingDomainEventOutboxBacklog.set(count);
  }

  observeProcessingDuration(seconds: number): void {
    this.metrics.bookingDomainEventOutboxProcessingDuration.observe(seconds);
  }
}
