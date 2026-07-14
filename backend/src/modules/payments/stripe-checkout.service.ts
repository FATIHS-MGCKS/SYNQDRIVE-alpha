import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingPaymentPurpose,
  BookingPaymentRequest,
  BookingPaymentRequestStatus,
  OrganizationPaymentAccountStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import { ConnectAccountNotReadyError } from './booking-payment-request.errors';
import { PaymentStatusService } from './payment-status.service';
import { PaymentsAccessService } from './payments-access.service';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import {
  CheckoutIdempotencyConflictError,
  CheckoutCurrencyUnsupportedError,
  CheckoutIdempotencyKeyRequiredError,
  PaymentRequestNotCheckoutEligibleError,
  StripeCheckoutFailedError,
} from './stripe-checkout.errors';
import { STRIPE_CONNECT_ADAPTER } from './stripe/stripe-connect.adapter';
import type { StripeConnectAdapter } from './stripe/stripe-connect.adapter';
import {
  ConnectAccountRestrictedError,
  ConnectProviderError,
  PaymentsFeatureDisabledConnectError,
  StripeModeMismatchError,
} from './stripe/stripe-connect.errors';
import { assertSupportedCurrency } from './payment-policy.service';
import { PaymentFeeBasis } from './payment-fee.types';
import {
  buildCheckoutLineItemsFromSnapshot,
  isCheckoutSessionStillActive,
  resolveStripeCheckoutExpiresAt,
} from './utils/checkout-line-items.util';
import { resolveAllowedCheckoutRedirectUrl } from './utils/payments-checkout-url.util';
import { PaymentEmailEnqueueService } from './email/payment-email-enqueue.service';
import { PaymentMetricsService } from './observability/payment-metrics.service';

export interface CreateCheckoutSessionInput {
  organizationId: string;
  bookingId: string;
  paymentRequestId: string;
  actor: PermissionActor;
  idempotencyKey: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResult {
  paymentRequestId: string;
  status: BookingPaymentRequestStatus;
  checkoutUrl: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  amountCents: number;
  currency: string;
  applicationFeeAmountCents: number;
  checkoutCreatedAt: string;
  checkoutExpiresAt: string;
  stripeConnectedAccountId: string;
  stripeLivemode: boolean;
}

const CHECKOUT_ELIGIBLE_STATUSES: BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.OPEN,
  BookingPaymentRequestStatus.CHECKOUT_READY,
];

@Injectable()
export class StripeCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentsAccess: PaymentsAccessService,
    private readonly paymentStatusService: PaymentStatusService,
    private readonly paymentRequestRepository: BookingPaymentRequestRepository,
    private readonly organizationPaymentAccountService: OrganizationPaymentAccountService,
    @Inject(STRIPE_CONNECT_ADAPTER)
    private readonly stripeConnectAdapter: StripeConnectAdapter,
    private readonly paymentEmailEnqueue: PaymentEmailEnqueueService,
    private readonly paymentMetrics: PaymentMetricsService,
  ) {}

  async createCheckoutSessionForPaymentRequest(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSessionResult> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new CheckoutIdempotencyKeyRequiredError();
    }

    await this.assertCheckoutAccess(input.organizationId, input.actor);

    const request = await this.paymentRequestRepository.findById(
      input.organizationId,
      input.paymentRequestId,
    );
    if (!request || request.bookingId !== input.bookingId) {
      throw new NotFoundException('Payment request not found');
    }
    if (request.purpose !== BookingPaymentPurpose.RENTAL_PAYMENT) {
      throw new PaymentRequestNotCheckoutEligibleError(request.status);
    }

    if (isCheckoutSessionStillActive(request)) {
      return this.toResult(request);
    }

    const existingByKey = await this.paymentRequestRepository.findByCheckoutIdempotencyKey(
      input.organizationId,
      idempotencyKey,
    );
    if (existingByKey && existingByKey.id !== request.id) {
      throw new CheckoutIdempotencyConflictError();
    }

    if (!CHECKOUT_ELIGIBLE_STATUSES.includes(request.status)) {
      throw new PaymentRequestNotCheckoutEligibleError(request.status);
    }

    const connectAccount = await this.assertConnectAccountReady(input.organizationId, request);

    let currency: string;
    try {
      currency = assertSupportedCurrency(request.currency);
    } catch {
      throw new CheckoutCurrencyUnsupportedError(request.currency);
    }

    const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!snapshot) {
      throw new NotFoundException('Booking price snapshot not found');
    }

    const feeBasis = (request.feeBasis as PaymentFeeBasis) ?? PaymentFeeBasis.GROSS_RENTAL_EXCL_DEPOSIT;
    const lineItems = buildCheckoutLineItemsFromSnapshot(
      snapshot.lineItems.map((li) => ({
        type: li.type,
        label: li.label,
        totalNetCents: li.totalNetCents,
        totalGrossCents: li.totalGrossCents,
      })),
      feeBasis,
      request.amountCents,
    );

    const successUrl = resolveAllowedCheckoutRedirectUrl(
      this.configService,
      input.successUrl,
      'stripe.checkoutSuccessUrl',
    );
    const cancelUrl = resolveAllowedCheckoutRedirectUrl(
      this.configService,
      input.cancelUrl,
      'stripe.checkoutCancelUrl',
    );
    const stripeExpiresAt = resolveStripeCheckoutExpiresAt(request.checkoutExpiresAt);
    const stripeIdempotencyKey = `checkout:${input.organizationId}:${request.id}:${idempotencyKey}`;

    const pending = await this.paymentStatusService.transitionPaymentRequest({
      organizationId: input.organizationId,
      paymentRequestId: request.id,
      toStatus: BookingPaymentRequestStatus.LINK_PENDING,
    });

    let session;
    try {
      session = await this.stripeConnectAdapter.createCheckoutSession({
        connectedAccountId: connectAccount.stripeConnectedAccountId!,
        currency,
        lineItems,
        applicationFeeAmountCents: request.applicationFeeAmountCents ?? 0,
        customerEmail: request.recipientEmail ?? '',
        successUrl,
        cancelUrl,
        expiresAt: stripeExpiresAt,
        metadata: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          invoiceId: request.invoiceId ?? '',
          paymentRequestId: request.id,
        },
        stripeIdempotencyKey,
      });
    } catch (error) {
      this.paymentMetrics.checkoutCreation.inc({ result: 'failure' });
      await this.safeRollbackToOpen(input.organizationId, pending.request.id, pending.request.status);
      if (error instanceof ConnectProviderError) {
        throw new StripeCheckoutFailedError(error.message);
      }
      if (error instanceof StripeModeMismatchError) {
        throw error;
      }
      if (error instanceof ConnectAccountRestrictedError) {
        throw error;
      }
      throw error;
    }

    const now = new Date();
    const withCheckoutFields = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${input.organizationId}:${request.id}`}))`;

      const current = await tx.bookingPaymentRequest.findFirst({
        where: { id: request.id, organizationId: input.organizationId },
      });
      if (!current) {
        throw new NotFoundException('Payment request not found');
      }

      if (
        isCheckoutSessionStillActive(current)
        && current.checkoutIdempotencyKey === idempotencyKey
      ) {
        return current;
      }

      try {
        return await tx.bookingPaymentRequest.update({
          where: { id: current.id, organizationId: input.organizationId },
          data: {
            stripeCheckoutSessionId: session.sessionId,
            stripePaymentIntentId: session.paymentIntentId,
            checkoutUrl: session.url,
            checkoutCreatedAt: now,
            checkoutExpiresAt: session.expiresAt,
            checkoutIdempotencyKey: idempotencyKey,
            stripeConnectedAccountId: connectAccount.stripeConnectedAccountId,
            stripeLivemode: session.livemode,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2002'
        ) {
          const raced = await tx.bookingPaymentRequest.findFirst({
            where: { organizationId: input.organizationId, checkoutIdempotencyKey: idempotencyKey },
          });
          if (raced && isCheckoutSessionStillActive(raced)) {
            return raced;
          }
        }
        throw error;
      }
    });

    const ready = await this.paymentStatusService.transitionPaymentRequest({
      organizationId: input.organizationId,
      paymentRequestId: withCheckoutFields.id,
      toStatus: BookingPaymentRequestStatus.CHECKOUT_READY,
    });

    await this.paymentEmailEnqueue.maybeEnqueueAfterCheckout({
      organizationId: input.organizationId,
      paymentRequestId: ready.request.id,
    });

    this.paymentMetrics.checkoutCreation.inc({ result: 'success' });
    return this.toResult(ready.request);
  }

  private async assertCheckoutAccess(
    organizationId: string,
    actor: PermissionActor,
  ): Promise<void> {
    try {
      await this.paymentsAccess.assertPaymentsFeatureEnabled(organizationId, actor);
    } catch {
      throw new PaymentsFeatureDisabledConnectError(organizationId);
    }
    await this.paymentsAccess.assertPaymentPermission(
      organizationId,
      actor,
      'payments.create',
    );
  }

  private async assertConnectAccountReady(
    organizationId: string,
    request: BookingPaymentRequest,
  ) {
    const account = await this.organizationPaymentAccountService.findByOrganization(organizationId);
    if (
      !account?.stripeConnectedAccountId
      || account.status !== OrganizationPaymentAccountStatus.ACTIVE
      || !account.chargesEnabled
    ) {
      throw new ConnectAccountNotReadyError();
    }
    if (
      request.stripeConnectedAccountId
      && request.stripeConnectedAccountId !== account.stripeConnectedAccountId
    ) {
      throw new ConnectAccountNotReadyError();
    }
    const liveStatus = await this.stripeConnectAdapter.getConnectedAccountStatus(
      account.stripeConnectedAccountId,
    );
    if (!liveStatus.chargesEnabled) {
      throw new ConnectAccountNotReadyError();
    }
    if (liveStatus.status === OrganizationPaymentAccountStatus.RESTRICTED) {
      throw new ConnectAccountRestrictedError(liveStatus.disabledReason);
    }
    return account;
  }

  private async safeRollbackToOpen(
    organizationId: string,
    paymentRequestId: string,
    currentStatus: BookingPaymentRequestStatus,
  ): Promise<void> {
    if (currentStatus !== BookingPaymentRequestStatus.LINK_PENDING) {
      return;
    }
    try {
      await this.paymentStatusService.transitionPaymentRequest({
        organizationId,
        paymentRequestId,
        toStatus: BookingPaymentRequestStatus.OPEN,
      });
    } catch {
      // best-effort rollback
    }
  }

  private toResult(request: BookingPaymentRequest): CheckoutSessionResult {
    return {
      paymentRequestId: request.id,
      status: request.status,
      checkoutUrl: request.checkoutUrl ?? '',
      checkoutSessionId: request.stripeCheckoutSessionId ?? '',
      paymentIntentId: request.stripePaymentIntentId,
      amountCents: request.amountCents,
      currency: request.currency,
      applicationFeeAmountCents: request.applicationFeeAmountCents ?? 0,
      checkoutCreatedAt: request.checkoutCreatedAt?.toISOString() ?? new Date().toISOString(),
      checkoutExpiresAt: request.checkoutExpiresAt?.toISOString() ?? new Date().toISOString(),
      stripeConnectedAccountId: request.stripeConnectedAccountId ?? '',
      stripeLivemode: request.stripeLivemode ?? false,
    };
  }
}
