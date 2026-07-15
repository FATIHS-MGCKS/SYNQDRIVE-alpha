import { Injectable, Logger } from '@nestjs/common';
import { StripeWebhookEventStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StripeWebhookDispatcherService } from './stripe-webhook-dispatcher.service';

/**
 * Optional async wrapper for webhook processing.
 * Store-first ingest remains synchronous; heavy dispatch can be deferred.
 */
@Injectable()
export class StripeWebhookProcessorService {
  private readonly logger = new Logger(StripeWebhookProcessorService.name);
  private readonly queue = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: StripeWebhookDispatcherService,
  ) {}

  shouldProcessAsync(eventType: string): boolean {
    return (
      eventType.startsWith('invoice.') ||
      eventType.startsWith('customer.subscription.') ||
      eventType.startsWith('payment_intent.')
    );
  }

  async processStoredEvent(stripeEventId: string): Promise<void> {
    if (this.queue.has(stripeEventId)) {
      return;
    }
    this.queue.add(stripeEventId);

    try {
      const row = await this.prisma.stripeWebhookEvent.findUnique({
        where: { stripeEventId },
      });
      if (!row || row.status === StripeWebhookEventStatus.PROCESSED) {
        return;
      }

      const event = row.safePayload as { event?: unknown } | null;
      if (!event || typeof event !== 'object') {
        this.logger.warn(`Webhook ${stripeEventId} has no replayable safe payload`);
        return;
      }

      // Replay is not required for MVP — ingest path processes inline.
    } finally {
      this.queue.delete(stripeEventId);
    }
  }

  enqueueProcessing(stripeEventId: string): void {
    setImmediate(() => {
      void this.processStoredEvent(stripeEventId).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Async webhook processing failed for ${stripeEventId}: ${message}`);
      });
    });
  }
}
