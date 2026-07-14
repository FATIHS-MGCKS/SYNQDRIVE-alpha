import { Injectable, Logger } from '@nestjs/common';
import type { StripeConnectWebhookEvent } from '@prisma/client';
import { PaymentReconciliationService } from './payment-reconciliation.service';

@Injectable()
export class StripeConnectWebhookProcessorService {
  private readonly logger = new Logger(StripeConnectWebhookProcessorService.name);

  constructor(private readonly reconciliationService: PaymentReconciliationService) {}

  async enqueueForProcessing(event: StripeConnectWebhookEvent): Promise<void> {
    try {
      const result = await this.reconciliationService.processStoredWebhookEvent(event.id);
      this.logger.log(
        `Connect webhook ${event.stripeEventId} reconciled: ${result.outcome}`,
      );
    } catch (error) {
      this.logger.error(
        `Connect webhook reconciliation failed for ${event.stripeEventId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw error;
    }
  }
}
