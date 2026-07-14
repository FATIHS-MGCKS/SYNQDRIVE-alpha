import { Injectable, Logger } from '@nestjs/common';
import { PaymentEmailEnqueueService } from './email/payment-email-enqueue.service';

/**
 * Schedules customer payment confirmation email after successful reconciliation.
 * Must not run inside DB transactions.
 */
@Injectable()
export class PaymentConfirmationNotifierService {
  private readonly logger = new Logger(PaymentConfirmationNotifierService.name);

  constructor(private readonly paymentEmailEnqueue: PaymentEmailEnqueueService) {}

  schedulePaymentConfirmation(paymentRequestId: string, organizationId: string): void {
    void this.paymentEmailEnqueue
      .enqueuePaymentConfirmation({ paymentRequestId, organizationId })
      .then((outboxId) => {
        if (outboxId) {
          this.logger.log(
            `Payment confirmation email queued (${outboxId}) for request ${paymentRequestId}`,
          );
        }
      })
      .catch((error) => {
        this.logger.error(
          `Failed to queue payment confirmation for ${paymentRequestId}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });
  }
}
