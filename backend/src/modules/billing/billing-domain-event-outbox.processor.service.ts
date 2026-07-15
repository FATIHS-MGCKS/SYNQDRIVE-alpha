import { Injectable, Logger } from '@nestjs/common';
import { BillingDomainEvent } from './domain/billing-domain.events';
import { BillingEventPublisher } from './events/billing-event.publisher';
import { BillingDomainEventOutboxRepository } from './billing-domain-event-outbox.repository';

export type BillingOutboxProcessOutcome =
  | 'delivered'
  | 'retry'
  | 'dead_letter'
  | 'skipped';

@Injectable()
export class BillingDomainEventOutboxProcessorService {
  private readonly logger = new Logger(BillingDomainEventOutboxProcessorService.name);

  constructor(
    private readonly repository: BillingDomainEventOutboxRepository,
    private readonly publisher: BillingEventPublisher,
  ) {}

  async processPendingBatch(workerId: string, limit?: number) {
    const claimed = await this.repository.claimPendingDeliveries(limit, workerId);
    const results: Array<{ deliveryId: string; outcome: BillingOutboxProcessOutcome }> = [];

    for (const delivery of claimed) {
      results.push({
        deliveryId: delivery.id,
        outcome: await this.processClaimedDelivery(delivery),
      });
    }

    return results;
  }

  async processClaimedDelivery(
    delivery: Awaited<
      ReturnType<BillingDomainEventOutboxRepository['claimPendingDeliveries']>
    >[number],
  ): Promise<BillingOutboxProcessOutcome> {
    if (delivery.outboxEvent.status === 'PUBLISHED') {
      return 'skipped';
    }

    try {
      const payload =
        delivery.outboxEvent.payload &&
        typeof delivery.outboxEvent.payload === 'object' &&
        !Array.isArray(delivery.outboxEvent.payload)
          ? (delivery.outboxEvent.payload as Record<string, unknown>)
          : {};

      const event: BillingDomainEvent = {
        type: delivery.outboxEvent.eventType as BillingDomainEvent['type'],
        organizationId: delivery.outboxEvent.organizationId,
        occurredAt: delivery.outboxEvent.occurredAt,
        correlationId: delivery.outboxEvent.aggregateId,
        payload,
      };

      await this.publisher.publish(event);
      await this.repository.markDeliveryDelivered(delivery.id, delivery.outboxEventId);
      return 'delivered';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_outbox_error';
      this.logger.warn(
        `Billing outbox delivery ${delivery.id} failed: ${message}`,
      );
      const result = await this.repository.markDeliveryRetry(
        delivery.id,
        delivery.outboxEventId,
        message,
      );
      if (result.outcome === 'dead_letter') {
        return 'dead_letter';
      }
      return 'retry';
    }
  }
}
