import { Injectable, Logger } from '@nestjs/common';
import type { StripeConnectWebhookEvent } from '@prisma/client';
import { StripeConnectWebhookProcessingStatus } from '@prisma/client';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';
import { PaymentMetricsService } from './observability/payment-metrics.service';
import { formatPaymentLogPayload } from './utils/payment-log.util';

@Injectable()
export class StripeConnectWebhookProcessorService {
  private readonly logger = new Logger(StripeConnectWebhookProcessorService.name);

  constructor(
    private readonly reconciliationService: PaymentReconciliationService,
    private readonly webhookEventRepository: StripeConnectWebhookEventRepository,
    private readonly paymentMetrics: PaymentMetricsService,
  ) {}

  async enqueueForProcessing(event: StripeConnectWebhookEvent): Promise<void> {
    try {
      const result = await this.reconciliationService.processStoredWebhookEvent(event.id);
      this.paymentMetrics.webhookProcessing.inc({
        event_type: event.eventType,
        outcome: result.outcome,
      });
      if (result.outcome === 'processed' && event.eventType === 'payment_intent.succeeded') {
        this.paymentMetrics.paymentSuccess.inc({ result: 'success' });
      }
      this.logger.log(
        formatPaymentLogPayload(
          'CONNECT_WEBHOOK_RECONCILED',
          {
            organizationId: event.organizationId ?? undefined,
            stripeEventId: event.stripeEventId,
            connectedAccountId: event.stripeConnectedAccountId ?? undefined,
            paymentRequestId: result.paymentRequestId,
            outcome: result.outcome,
            eventType: event.eventType,
          },
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      await this.webhookEventRepository.update(event.id, {
        processingStatus: StripeConnectWebhookProcessingStatus.FAILED,
        errorMessage: message.slice(0, 500),
        attempts: event.attempts + 1,
      });
      this.paymentMetrics.webhookProcessing.inc({
        event_type: event.eventType,
        outcome: 'failed',
      });
      this.logger.error(
        formatPaymentLogPayload(
          'CONNECT_WEBHOOK_RECONCILE_FAILED',
          {
            organizationId: event.organizationId ?? undefined,
            stripeEventId: event.stripeEventId,
            connectedAccountId: event.stripeConnectedAccountId ?? undefined,
            eventType: event.eventType,
          },
          { error: message },
        ),
      );
    }
  }
}
