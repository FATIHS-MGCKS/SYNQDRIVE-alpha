import type { BookingDomainEventOutbox } from '@prisma/client';
import type { BookingDomainEventEnvelope } from '../booking-domain-event.types';
import type { BookingDomainEventConsumerId } from './booking-domain-event-consumer.constants';

export type BookingDomainEventConsumerContext = {
  row: BookingDomainEventOutbox;
  envelope: BookingDomainEventEnvelope;
  actorUserId?: string | null;
};

export type BookingDomainEventConsumerResult = {
  status: 'SUCCEEDED' | 'SKIPPED' | 'STALE' | 'FAILED';
  businessKey: string;
  metadata?: Record<string, unknown>;
  lastError?: string;
};

export interface BookingDomainEventConsumerHandler {
  readonly consumerId: BookingDomainEventConsumerId;
  supportsEvent(eventType: string): boolean;
  buildBusinessKey(ctx: BookingDomainEventConsumerContext): string;
  handle(ctx: BookingDomainEventConsumerContext): Promise<BookingDomainEventConsumerResult>;
}
