import { Injectable, Logger } from '@nestjs/common';
import type { PermissionActor } from '@shared/auth/permission.util';
import { BookingPaymentRequestService } from '@modules/payments/booking-payment-request.service';
import { StripeCheckoutService } from '@modules/payments/stripe-checkout.service';
import { PaymentEmailEnqueueService } from '@modules/payments/email/payment-email-enqueue.service';

export interface WizardPaymentFlowStepFailure {
  step: 'payment_request' | 'checkout' | 'email';
  message: string;
}

export interface WizardPaymentFlowResult {
  intent: 'payment_link';
  bookingConfirmed: true;
  paymentRequestCreated: boolean;
  paymentRequestId?: string;
  checkoutCreated: boolean;
  checkoutUrl?: string;
  emailQueued: boolean;
  partialFailures: WizardPaymentFlowStepFailure[];
}

@Injectable()
export class BookingWizardPaymentFlowService {
  private readonly logger = new Logger(BookingWizardPaymentFlowService.name);

  constructor(
    private readonly bookingPaymentRequestService: BookingPaymentRequestService,
    private readonly stripeCheckoutService: StripeCheckoutService,
    private readonly paymentEmailEnqueue: PaymentEmailEnqueueService,
  ) {}

  async executePaymentLinkFlow(params: {
    organizationId: string;
    bookingId: string;
    actor: PermissionActor;
    recipientEmail?: string;
  }): Promise<WizardPaymentFlowResult> {
    const result: WizardPaymentFlowResult = {
      intent: 'payment_link',
      bookingConfirmed: true,
      paymentRequestCreated: false,
      checkoutCreated: false,
      emailQueued: false,
      partialFailures: [],
    };

    const idempotencyBase = `wizard-confirm:${params.bookingId}`;

    let paymentRequestId: string | undefined;
    try {
      const created = await this.bookingPaymentRequestService.createRentalPaymentRequest({
        organizationId: params.organizationId,
        bookingId: params.bookingId,
        actor: params.actor,
        idempotencyKey: `${idempotencyBase}:payment-request`,
        recipientEmail: params.recipientEmail,
        sendEmail: true,
      });
      paymentRequestId = created.request.id;
      result.paymentRequestCreated = true;
      result.paymentRequestId = paymentRequestId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment request failed';
      result.partialFailures.push({ step: 'payment_request', message });
      this.logger.warn(`Payment request failed for booking ${params.bookingId}: ${message}`);
      return result;
    }

    try {
      const checkout = await this.stripeCheckoutService.createCheckoutSessionForPaymentRequest({
        organizationId: params.organizationId,
        bookingId: params.bookingId,
        paymentRequestId,
        actor: params.actor,
        idempotencyKey: `${idempotencyBase}:checkout`,
      });
      result.checkoutCreated = true;
      result.checkoutUrl = checkout.checkoutUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Checkout session failed';
      result.partialFailures.push({ step: 'checkout', message });
      this.logger.warn(`Checkout failed for booking ${params.bookingId}: ${message}`);
      return result;
    }

    try {
      const outboxId = await this.paymentEmailEnqueue.maybeEnqueueAfterCheckout({
        organizationId: params.organizationId,
        paymentRequestId,
      });
      result.emailQueued = !!outboxId;
      if (!outboxId && this.paymentEmailEnqueue.isEnabled()) {
        result.partialFailures.push({
          step: 'email',
          message: 'Payment email could not be queued (duplicate or disabled)',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email enqueue failed';
      result.partialFailures.push({ step: 'email', message });
      this.logger.warn(`Email enqueue failed for booking ${params.bookingId}: ${message}`);
    }

    return result;
  }
}
