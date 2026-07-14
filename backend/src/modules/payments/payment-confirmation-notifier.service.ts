import { Injectable, Logger } from '@nestjs/common';

/**
 * Schedules customer payment confirmation email after successful reconciliation.
 * MVP: no-op enqueue — must not run inside DB transactions.
 */
@Injectable()
export class PaymentConfirmationNotifierService {
  private readonly logger = new Logger(PaymentConfirmationNotifierService.name);

  schedulePaymentConfirmation(paymentRequestId: string, organizationId: string): void {
    this.logger.debug(
      `Payment confirmation email deferred for request ${paymentRequestId} (org ${organizationId})`,
    );
  }
}
