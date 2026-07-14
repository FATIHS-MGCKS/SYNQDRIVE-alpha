import { Injectable, Logger } from '@nestjs/common';
import { StripeConnectWebhookProcessingStatus } from '@prisma/client';
import type { StripeConnectWebhookEvent } from '@prisma/client';

/**
 * Deferred business processing for Connect webhook events.
 * MVP: ingestion-only — no PAID transitions, invoice posting, or email.
 */
@Injectable()
export class StripeConnectWebhookProcessorService {
  private readonly logger = new Logger(StripeConnectWebhookProcessorService.name);

  async enqueueForProcessing(event: StripeConnectWebhookEvent): Promise<void> {
    this.logger.debug(
      `Connect webhook ${event.stripeEventId} (${event.eventType}) queued for deferred processing`,
    );
  }
}
