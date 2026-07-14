import { Injectable, Logger } from '@nestjs/common';
import { PaymentEmailEnqueueService } from './email/payment-email-enqueue.service';

@Injectable()
export class PaymentDisputeNotifierService {
  private readonly logger = new Logger(PaymentDisputeNotifierService.name);

  constructor(private readonly paymentEmailEnqueue: PaymentEmailEnqueueService) {}

  scheduleDisputeNotification(paymentRequestId: string, organizationId: string): void {
    void this.paymentEmailEnqueue
      .enqueuePaymentDispute({ paymentRequestId, organizationId })
      .then((outboxId) => {
        if (outboxId) {
          this.logger.log(
            `Payment dispute notification queued (${outboxId}) for request ${paymentRequestId}`,
          );
        }
      })
      .catch((error) => {
        this.logger.error(
          `Failed to queue dispute notification for ${paymentRequestId}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });
  }
}
