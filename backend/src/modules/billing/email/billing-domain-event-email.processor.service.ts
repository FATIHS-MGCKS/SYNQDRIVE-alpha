import { Injectable, Logger } from '@nestjs/common';
import { BILLING_OUTBOX_EMAIL_CONSUMER_ID, isBillingEmailEventType } from '../domain/billing-outbox';
import { BillingDomainEventOutboxRepository } from '../billing-domain-event-outbox.repository';
import { BillingEmailSenderService } from './billing-email-sender.service';

export type BillingEmailProcessOutcome =
  | 'delivered'
  | 'retry'
  | 'dead_letter'
  | 'skipped';

@Injectable()
export class BillingDomainEventEmailProcessorService {
  private readonly logger = new Logger(BillingDomainEventEmailProcessorService.name);

  constructor(
    private readonly repository: BillingDomainEventOutboxRepository,
    private readonly sender: BillingEmailSenderService,
  ) {}

  async processPendingBatch(workerId: string, limit?: number) {
    const claimed = await this.repository.claimPendingDeliveries(
      limit,
      workerId,
      BILLING_OUTBOX_EMAIL_CONSUMER_ID,
    );
    const results: Array<{ deliveryId: string; outcome: BillingEmailProcessOutcome }> = [];

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
  ): Promise<BillingEmailProcessOutcome> {
    if (delivery.outboxEvent.status === 'PUBLISHED') {
      return 'skipped';
    }

    if (!isBillingEmailEventType(delivery.outboxEvent.eventType)) {
      await this.repository.markDeliveryDelivered(delivery.id, delivery.outboxEventId);
      return 'skipped';
    }

    const payload =
      delivery.outboxEvent.payload
      && typeof delivery.outboxEvent.payload === 'object'
      && !Array.isArray(delivery.outboxEvent.payload)
        ? (delivery.outboxEvent.payload as Record<string, unknown>)
        : {};

    try {
      const result = await this.sender.sendFromOutboxDelivery({
        deliveryId: delivery.id,
        eventType: delivery.outboxEvent.eventType,
        organizationId: delivery.outboxEvent.organizationId,
        outboxIdempotencyKey: delivery.outboxEvent.idempotencyKey,
        payload,
      });

      if (result.skipped) {
        await this.repository.markDeliveryDelivered(delivery.id, delivery.outboxEventId);
        return 'skipped';
      }

      if (!result.success) {
        throw new Error(result.errorMessage ?? result.errorCode ?? 'billing_email_send_failed');
      }

      await this.repository.markDeliveryDelivered(delivery.id, delivery.outboxEventId);
      return 'delivered';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_billing_email_error';
      this.logger.warn(`Billing email delivery ${delivery.id} failed: ${message}`);
      const retryResult = await this.repository.markDeliveryRetry(
        delivery.id,
        delivery.outboxEventId,
        message,
      );
      if (retryResult.outcome === 'dead_letter') {
        return 'dead_letter';
      }
      return 'retry';
    }
  }
}
