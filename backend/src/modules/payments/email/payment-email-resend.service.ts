import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingPaymentRequestStatus } from '@prisma/client';
import type { PermissionActor } from '@shared/auth/permission.util';
import { PrismaService } from '@shared/database/prisma.service';
import { CheckoutIdempotencyKeyRequiredError } from '../stripe-checkout.errors';
import { isCheckoutSessionStillActive } from '../utils/checkout-line-items.util';
import { PaymentsAccessService } from '../payments-access.service';
import { PaymentStatusService } from '../payment-status.service';
import { StripeCheckoutService } from '../stripe-checkout.service';
import { PaymentEmailEnqueueService } from './payment-email-enqueue.service';

export interface ResendPaymentLinkResult {
  paymentRequestId: string;
  status: BookingPaymentRequestStatus;
  checkoutUrl: string;
  checkoutSessionId: string | null;
  checkoutExpiresAt: string | null;
  sendAttemptCount: number;
  lastSentAt: string | null;
  lastEmailErrorMessage: string | null;
  outboxId: string | null;
  reusedCheckoutSession: boolean;
}

const RESEND_ELIGIBLE_STATUSES: BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.CHECKOUT_READY,
  BookingPaymentRequestStatus.LINK_SENT,
  BookingPaymentRequestStatus.EXPIRED,
];

@Injectable()
export class PaymentEmailResendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsAccess: PaymentsAccessService,
    private readonly paymentStatusService: PaymentStatusService,
    private readonly stripeCheckoutService: StripeCheckoutService,
    private readonly paymentEmailEnqueue: PaymentEmailEnqueueService,
  ) {}

  async resendPaymentLink(input: {
    organizationId: string;
    bookingId: string;
    paymentRequestId: string;
    actor: PermissionActor;
    idempotencyKey: string;
    sentByUserId?: string | null;
  }): Promise<ResendPaymentLinkResult> {
    await this.paymentsAccess.assertPaymentPermission(
      input.organizationId,
      input.actor,
      'payments.resend',
    );

    if (!input.idempotencyKey?.trim()) {
      throw new CheckoutIdempotencyKeyRequiredError();
    }

    const request = await this.prisma.bookingPaymentRequest.findFirst({
      where: {
        id: input.paymentRequestId,
        organizationId: input.organizationId,
        bookingId: input.bookingId,
      },
    });
    if (!request) {
      throw new NotFoundException('Payment request not found');
    }

    if (!RESEND_ELIGIBLE_STATUSES.includes(request.status)) {
      throw new NotFoundException(
        `Payment request cannot be resent in status ${request.status}`,
      );
    }

    let current = request;
    let reusedCheckoutSession = isCheckoutSessionStillActive(current);

    if (current.status === BookingPaymentRequestStatus.EXPIRED) {
      current = await this.paymentStatusService.transitionPaymentRequest({
        organizationId: input.organizationId,
        paymentRequestId: current.id,
        toStatus: BookingPaymentRequestStatus.OPEN,
      }).then((r) => r.request);
      reusedCheckoutSession = false;
    }

    if (!reusedCheckoutSession) {
      const checkout = await this.stripeCheckoutService.createCheckoutSessionForPaymentRequest({
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        paymentRequestId: current.id,
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
      });
      current = await this.prisma.bookingPaymentRequest.findFirstOrThrow({
        where: { id: current.id, organizationId: input.organizationId },
      });
      reusedCheckoutSession = false;
      if (!checkout.checkoutUrl) {
        throw new NotFoundException('Checkout session could not be created');
      }
    }

    const suffix = `resend:${input.idempotencyKey}`;
    const outboxId = await this.paymentEmailEnqueue.enqueueBookingPaymentRequest({
      organizationId: input.organizationId,
      paymentRequestId: current.id,
      idempotencySuffix: suffix,
      sentByUserId: input.sentByUserId ?? null,
    });

    const refreshed = await this.prisma.bookingPaymentRequest.findFirstOrThrow({
      where: { id: current.id, organizationId: input.organizationId },
    });

    return {
      paymentRequestId: refreshed.id,
      status: refreshed.status,
      checkoutUrl: refreshed.checkoutUrl ?? '',
      checkoutSessionId: refreshed.stripeCheckoutSessionId,
      checkoutExpiresAt: refreshed.checkoutExpiresAt?.toISOString() ?? null,
      sendAttemptCount: refreshed.sendAttemptCount,
      lastSentAt: refreshed.lastSentAt?.toISOString() ?? null,
      lastEmailErrorMessage: refreshed.lastEmailErrorMessage,
      outboxId,
      reusedCheckoutSession,
    };
  }
}
