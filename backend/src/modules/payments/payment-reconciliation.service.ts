import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  BookingPaymentRequest,
  BookingPaymentRequestStatus,
  InvoicePaymentMethod,
  PaymentProvider,
  PaymentTransactionStatus,
  PaymentTransactionType,
  Prisma,
  StripeConnectWebhookProcessingStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { derivePaymentStatus, canRecordPayment, isOutgoingInvoiceType } from '@modules/invoices/invoice-domain.util';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { PaymentConfirmationNotifierService } from './payment-confirmation-notifier.service';
import { PaymentDisputeNotifierService } from './payment-dispute-notifier.service';
import { BookingPaymentRefundService } from './booking-payment-refund.service';
import { PaymentFeeService } from './payment-fee.service';
import {
  PaymentReconciliationAmountMismatchError,
  PaymentReconciliationDomainError,
} from './payment-reconciliation.errors';
import {
  ConnectWebhookSafeEventData,
  assertPaymentRequestAlignment,
  extractPaymentRequestMetadata,
  normalizeCurrency,
  parseConnectWebhookSafeEventData,
  resolvePaymentAmountCents,
  shouldSkipDowngradeFromPaid,
} from './payment-reconciliation.util';
import {
  applyTransition,
  assertTransition,
  deriveBookingPaymentStatus,
} from './payment-status.transitions';
import type { PaymentTransitionContext } from './payment-domain.types';
import { STRIPE_CONNECT_ADAPTER } from './stripe/stripe-connect.adapter';
import type { StripeConnectAdapter } from './stripe/stripe-connect.adapter';
import { Inject } from '@nestjs/common';

export interface ReconciliationResult {
  eventId: string;
  stripeEventId: string;
  eventType: string;
  outcome:
    | 'processed'
    | 'skipped_duplicate'
    | 'skipped_paid'
    | 'skipped_no_financial'
    | 'account_synced'
    | 'deferred';
  paymentRequestId?: string;
}

type TxClient = Prisma.TransactionClient;

@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationPaymentAccountService: OrganizationPaymentAccountService,
    private readonly paymentConfirmationNotifier: PaymentConfirmationNotifierService,
    private readonly paymentDisputeNotifier: PaymentDisputeNotifierService,
    private readonly bookingPaymentRefundService: BookingPaymentRefundService,
    private readonly paymentFeeService: PaymentFeeService,
    @Inject(STRIPE_CONNECT_ADAPTER)
    private readonly stripeConnectAdapter: StripeConnectAdapter,
  ) {}

  async processStoredWebhookEvent(eventRowId: string): Promise<ReconciliationResult> {
    const pending = await this.prisma.stripeConnectWebhookEvent.findUnique({
      where: { id: eventRowId },
    });
    if (!pending) {
      throw new NotFoundException('Connect webhook event not found');
    }

    if (pending.processingStatus === StripeConnectWebhookProcessingStatus.PROCESSED) {
      return {
        eventId: pending.id,
        stripeEventId: pending.stripeEventId,
        eventType: pending.eventType,
        outcome: 'skipped_duplicate',
      };
    }

    const safe = parseConnectWebhookSafeEventData(pending.safeEventData);

    let result: ReconciliationResult;
    if (pending.eventType === 'account.updated') {
      result = await this.processAccountUpdated(pending, safe);
    } else {
      result = await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockWebhookEvent(tx, eventRowId);
        if (locked.processingStatus === StripeConnectWebhookProcessingStatus.PROCESSED) {
          return {
            eventId: locked.id,
            stripeEventId: locked.stripeEventId,
            eventType: locked.eventType,
            outcome: 'skipped_duplicate' as const,
          };
        }

        switch (locked.eventType) {
          case 'checkout.session.completed':
            return this.reconcileCheckoutSessionCompleted(tx, locked, safe);
          case 'payment_intent.succeeded':
            return this.reconcilePaymentIntentSucceeded(tx, locked, safe);
          case 'payment_intent.payment_failed':
            return this.reconcilePaymentIntentFailed(tx, locked, safe);
          case 'checkout.session.expired':
            return this.reconcileCheckoutSessionExpired(tx, locked, safe);
          case 'charge.refunded':
            return this.reconcileChargeRefunded(tx, locked, safe);
          case 'charge.dispute.created':
            return this.reconcileDisputeCreated(tx, locked, safe);
          default:
            return this.markDeferred(tx, locked, 'deferred');
        }
      });
    }

    if (
      result.outcome === 'processed'
      && result.paymentRequestId
      && pending.eventType === 'payment_intent.succeeded'
      && pending.organizationId
    ) {
      this.paymentConfirmationNotifier.schedulePaymentConfirmation(
        result.paymentRequestId,
        pending.organizationId,
      );
    }

    if (
      result.outcome === 'processed'
      && result.paymentRequestId
      && pending.eventType === 'charge.dispute.created'
      && pending.organizationId
    ) {
      this.paymentDisputeNotifier.scheduleDisputeNotification(
        result.paymentRequestId,
        pending.organizationId,
      );
    }

    return result;
  }

  private async processAccountUpdated(
    event: { id: string; stripeEventId: string; eventType: string; organizationId: string | null; stripeConnectedAccountId: string | null },
    _safe: ConnectWebhookSafeEventData,
  ): Promise<ReconciliationResult> {
    if (!event.organizationId || !event.stripeConnectedAccountId) {
      await this.prisma.stripeConnectWebhookEvent.update({
        where: { id: event.id },
        data: {
          processingStatus: StripeConnectWebhookProcessingStatus.FAILED,
          errorMessage: 'Missing organization or connected account for account.updated',
          processedAt: new Date(),
        },
      });
      throw new PaymentReconciliationDomainError(
        'Cannot sync account.updated without resolved organization',
        'RECONCILIATION_INVALID_CONTEXT',
      );
    }

    const status = await this.stripeConnectAdapter.getConnectedAccountStatus(
      event.stripeConnectedAccountId,
    );
    const payout = await this.stripeConnectAdapter.getSafePayoutSummary(
      event.stripeConnectedAccountId,
    );
    const account = await this.organizationPaymentAccountService.findByOrganization(
      event.organizationId,
    );
    if (account) {
      await this.prisma.organizationPaymentAccount.update({
        where: { id: account.id },
        data: {
          ...this.organizationPaymentAccountService.buildStatusUpdate(status, payout),
          lastStripeEventAt: new Date(),
        },
      });
    }

    await this.prisma.stripeConnectWebhookEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: StripeConnectWebhookProcessingStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
      },
    });

    return {
      eventId: event.id,
      stripeEventId: event.stripeEventId,
      eventType: event.eventType,
      outcome: 'account_synced',
    };
  }

  private async lockWebhookEvent(tx: TxClient, eventRowId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`connect-webhook:${eventRowId}`}))`;
    const row = await tx.stripeConnectWebhookEvent.findUnique({ where: { id: eventRowId } });
    if (!row) {
      throw new NotFoundException('Connect webhook event not found');
    }
    return row;
  }

  private async reconcileCheckoutSessionCompleted(
    tx: TxClient,
    event: {
      id: string;
      stripeEventId: string;
      eventType: string;
      organizationId: string | null;
      stripeConnectedAccountId: string | null;
      livemode: boolean;
    },
    safe: ConnectWebhookSafeEventData,
  ): Promise<ReconciliationResult> {
    const context = await this.loadPaymentContext(tx, event, safe);
    if (!context) {
      return this.markDeferred(tx, event, 'deferred');
    }

    const { request, metadata, amountCents, currency, paymentIntentId } = context;

    if (shouldSkipDowngradeFromPaid(request.status)) {
      await this.patchPaymentRequestStripeRefs(tx, request, {
        paymentIntentId,
        checkoutSessionId: safe.objectId ?? request.stripeCheckoutSessionId,
      });
      return this.markProcessed(tx, event, {
        outcome: 'skipped_paid',
        paymentRequestId: request.id,
      });
    }

    await tx.bookingPaymentRequest.update({
      where: { id: request.id },
      data: {
        stripePaymentIntentId: paymentIntentId ?? request.stripePaymentIntentId,
        stripeCheckoutSessionId: safe.objectId ?? request.stripeCheckoutSessionId,
        stripeLivemode: event.livemode,
      },
    });

    const refreshed = await tx.bookingPaymentRequest.findUniqueOrThrow({
      where: { id: request.id },
    });

    if (refreshed.status !== BookingPaymentRequestStatus.PROCESSING) {
      await this.transitionRequestInTx(tx, refreshed, BookingPaymentRequestStatus.PROCESSING);
    }

    await this.writeAuditLog(tx, {
      organizationId: event.organizationId!,
      entityId: request.id,
      description: `Checkout session completed for payment request ${request.id}`,
      changeSummary: `session=${safe.objectId ?? 'n/a'};pi=${paymentIntentId ?? 'n/a'};amount=${amountCents}${currency}`,
      metaJson: {
        stripeEventId: event.stripeEventId,
        checkoutSessionId: safe.objectId,
        paymentIntentId,
        financialBooking: false,
      },
    });

    return this.markProcessed(tx, event, {
      outcome: 'skipped_no_financial',
      paymentRequestId: request.id,
    });
  }

  private async reconcilePaymentIntentSucceeded(
    tx: TxClient,
    event: {
      id: string;
      stripeEventId: string;
      eventType: string;
      organizationId: string | null;
      stripeConnectedAccountId: string | null;
      livemode: boolean;
    },
    safe: ConnectWebhookSafeEventData,
  ): Promise<ReconciliationResult> {
    const context = await this.loadPaymentContext(tx, event, safe);
    if (!context) {
      return this.markDeferred(tx, event, 'deferred');
    }

    const {
      request,
      amountCents,
      currency,
      paymentIntentId,
      chargeId,
      applicationFeeCents,
    } = context;

    const existingCharge = paymentIntentId
      ? await tx.paymentTransaction.findFirst({
          where: {
            paymentRequestId: request.id,
            type: PaymentTransactionType.CHARGE,
            status: PaymentTransactionStatus.SUCCEEDED,
            providerObjectId: paymentIntentId,
          },
        })
      : null;

    const existingInvoicePayment = await tx.orgInvoicePayment.findUnique({
      where: { bookingPaymentRequestId: request.id },
    });

    if (existingCharge && existingInvoicePayment && shouldSkipDowngradeFromPaid(request.status)) {
      return this.markProcessed(tx, event, {
        outcome: 'skipped_duplicate',
        paymentRequestId: request.id,
      });
    }

    let current = request;

    if (!shouldSkipDowngradeFromPaid(current.status)
      && current.status !== BookingPaymentRequestStatus.PROCESSING) {
      current = await this.transitionRequestInTx(tx, current, BookingPaymentRequestStatus.PROCESSING);
    }

    if (!existingCharge) {
      await tx.paymentTransaction.create({
        data: {
          organizationId: current.organizationId,
          paymentRequestId: current.id,
          type: PaymentTransactionType.CHARGE,
          status: PaymentTransactionStatus.SUCCEEDED,
          amountCents,
          currency,
          provider: PaymentProvider.STRIPE,
          providerObjectType: 'payment_intent',
          providerObjectId: paymentIntentId,
          providerEventId: event.stripeEventId,
          balanceImpactCents: amountCents,
          applicationFeeImpactCents: 0,
          occurredAt: new Date(),
          metadata: {
            chargeId,
            livemode: event.livemode,
          },
        },
      });
    }

    if (applicationFeeCents > 0) {
      const existingFee = await tx.paymentTransaction.findFirst({
        where: {
          paymentRequestId: current.id,
          type: PaymentTransactionType.APPLICATION_FEE,
          providerObjectId: paymentIntentId,
        },
      });
      if (!existingFee) {
        await tx.paymentTransaction.create({
          data: {
            organizationId: current.organizationId,
            paymentRequestId: current.id,
            type: PaymentTransactionType.APPLICATION_FEE,
            status: PaymentTransactionStatus.SUCCEEDED,
            amountCents: applicationFeeCents,
            currency,
            provider: PaymentProvider.STRIPE,
            providerObjectType: 'payment_intent',
            providerObjectId: paymentIntentId,
            providerEventId: `${event.stripeEventId}:fee`,
            balanceImpactCents: 0,
            applicationFeeImpactCents: applicationFeeCents,
            occurredAt: new Date(),
          },
        });
      }
    }

    if (!existingInvoicePayment && current.invoiceId) {
      await this.recordStripeInvoicePaymentInTx(tx, {
        organizationId: current.organizationId,
        invoiceId: current.invoiceId,
        paymentRequestId: current.id,
        amountCents,
        paymentIntentId,
        chargeId,
        stripeEventId: event.stripeEventId,
      });
    }

    current = await tx.bookingPaymentRequest.findUniqueOrThrow({
      where: { id: current.id },
    });

    if (current.status !== BookingPaymentRequestStatus.PAID) {
      current = await this.transitionRequestInTx(tx, current, BookingPaymentRequestStatus.PAID);
    }

    await tx.bookingPaymentRequest.update({
      where: { id: current.id },
      data: {
        stripePaymentIntentId: paymentIntentId ?? current.stripePaymentIntentId,
        stripeChargeId: chargeId ?? current.stripeChargeId,
        stripeLivemode: event.livemode,
      },
    });

    await this.syncBookingPaymentSummary(tx, current.organizationId, current.bookingId);

    await this.writeAuditLog(tx, {
      organizationId: current.organizationId,
      entityId: current.id,
      description: `Stripe payment succeeded for payment request ${current.id}`,
      changeSummary: `pi=${paymentIntentId};amount=${amountCents}${currency}`,
      metaJson: {
        stripeEventId: event.stripeEventId,
        paymentIntentId,
        chargeId,
        amountCents,
        applicationFeeCents,
      },
    });

    return this.markProcessed(tx, event, {
      outcome: 'processed',
      paymentRequestId: current.id,
    });
  }

  private async reconcilePaymentIntentFailed(
    tx: TxClient,
    event: {
      id: string;
      stripeEventId: string;
      eventType: string;
      organizationId: string | null;
      stripeConnectedAccountId: string | null;
      livemode: boolean;
    },
    safe: ConnectWebhookSafeEventData,
  ): Promise<ReconciliationResult> {
    const context = await this.loadPaymentContext(tx, event, safe);
    if (!context) {
      return this.markDeferred(tx, event, 'deferred');
    }

    const { request, paymentIntentId } = context;

    if (shouldSkipDowngradeFromPaid(request.status)) {
      return this.markProcessed(tx, event, {
        outcome: 'skipped_paid',
        paymentRequestId: request.id,
      });
    }

    let current = request;
    if (current.status !== BookingPaymentRequestStatus.FAILED) {
      const directFailed: BookingPaymentRequestStatus[] = [
        BookingPaymentRequestStatus.CHECKOUT_READY,
        BookingPaymentRequestStatus.LINK_SENT,
        BookingPaymentRequestStatus.PROCESSING,
      ];
      if (directFailed.includes(current.status)) {
        current = await this.transitionRequestInTx(tx, current, BookingPaymentRequestStatus.FAILED);
      }
    }

    const failureMessage =
      safe.last_payment_error?.message
      ?? safe.status
      ?? 'payment_intent.payment_failed';

    await tx.bookingPaymentRequest.update({
      where: { id: current.id },
      data: {
        stripePaymentIntentId: paymentIntentId ?? current.stripePaymentIntentId,
      },
    });

    await this.syncBookingPaymentSummary(tx, current.organizationId, current.bookingId);

    await this.writeAuditLog(tx, {
      organizationId: current.organizationId,
      entityId: current.id,
      description: `Stripe payment failed for payment request ${current.id}`,
      changeSummary: failureMessage.slice(0, 500),
      metaJson: {
        stripeEventId: event.stripeEventId,
        paymentIntentId,
        failureCode: safe.last_payment_error?.code ?? null,
      },
    });

    return this.markProcessed(tx, event, {
      outcome: 'processed',
      paymentRequestId: current.id,
    });
  }

  private async reconcileCheckoutSessionExpired(
    tx: TxClient,
    event: {
      id: string;
      stripeEventId: string;
      eventType: string;
      organizationId: string | null;
      stripeConnectedAccountId: string | null;
      livemode: boolean;
    },
    safe: ConnectWebhookSafeEventData,
  ): Promise<ReconciliationResult> {
    const context = await this.loadPaymentContext(tx, event, safe);
    if (!context) {
      return this.markDeferred(tx, event, 'deferred');
    }

    const { request } = context;

    if (shouldSkipDowngradeFromPaid(request.status)) {
      return this.markProcessed(tx, event, {
        outcome: 'skipped_paid',
        paymentRequestId: request.id,
      });
    }

    const expirable: BookingPaymentRequestStatus[] = [
      BookingPaymentRequestStatus.CHECKOUT_READY,
      BookingPaymentRequestStatus.LINK_SENT,
      BookingPaymentRequestStatus.PROCESSING,
    ];

    let current = request;
    if (expirable.includes(current.status)) {
      current = await this.transitionRequestInTx(tx, current, BookingPaymentRequestStatus.EXPIRED);
      await this.syncBookingPaymentSummary(tx, current.organizationId, current.bookingId);
    }

    await this.writeAuditLog(tx, {
      organizationId: current.organizationId,
      entityId: current.id,
      description: `Checkout session expired for payment request ${current.id}`,
      changeSummary: `session=${safe.objectId ?? 'n/a'}`,
      metaJson: { stripeEventId: event.stripeEventId },
    });

    return this.markProcessed(tx, event, {
      outcome: 'processed',
      paymentRequestId: current.id,
    });
  }

  private async reconcileChargeRefunded(
    tx: TxClient,
    event: {
      id: string;
      stripeEventId: string;
      eventType: string;
      organizationId: string | null;
      stripeConnectedAccountId: string | null;
      livemode: boolean;
    },
    safe: ConnectWebhookSafeEventData,
  ): Promise<ReconciliationResult> {
    if (!event.organizationId) {
      return this.markDeferred(tx, event, 'deferred');
    }

    const existingEventTx = await tx.paymentTransaction.findUnique({
      where: {
        provider_providerEventId_type: {
          provider: PaymentProvider.STRIPE,
          providerEventId: event.stripeEventId,
          type: PaymentTransactionType.REFUND,
        },
      },
    });
    if (existingEventTx) {
      return this.markProcessed(tx, event, {
        outcome: 'skipped_duplicate',
        paymentRequestId: existingEventTx.paymentRequestId,
      });
    }

    const request = await this.findRequestForChargeEvent(tx, event, safe);
    if (!request) {
      return this.markDeferred(tx, event, 'deferred');
    }

    const amountRefundedOnCharge =
      safe.amount_refunded ?? request.refundedAmountCents;
    const delta = amountRefundedOnCharge - request.refundedAmountCents;
    if (delta <= 0) {
      return this.markProcessed(tx, event, {
        outcome: 'skipped_duplicate',
        paymentRequestId: request.id,
      });
    }

    const chargeTx = await tx.paymentTransaction.findFirst({
      where: {
        paymentRequestId: request.id,
        type: PaymentTransactionType.CHARGE,
        status: PaymentTransactionStatus.SUCCEEDED,
      },
    });
    if (!chargeTx) {
      return this.markDeferred(tx, event, 'deferred');
    }

    const feeAdjustment = this.paymentFeeService.calculateRefundFee(
      {
        applicationFeeAmountCents: request.applicationFeeAmountCents ?? 0,
        rentalPaymentAmountCents: request.amountCents,
      },
      delta,
      request.refundedAmountCents,
      request.paidAmountCents,
    );

    const stripeRefundId = safe.objectId
      ? `${safe.objectId}:${event.stripeEventId}`
      : event.stripeEventId;

    await this.bookingPaymentRefundService.applyRefundLedgerInTx(tx, {
      organizationId: event.organizationId,
      paymentRequestId: request.id,
      refundAmountCents: delta,
      applicationFeeRefundCents: feeAdjustment.applicationFeeRefundCents,
      currency: request.currency,
      stripeRefundId,
      providerEventId: event.stripeEventId,
      parentChargeTransactionId: chargeTx.id,
      reason: 'stripe_charge.refunded',
    });

    return this.markProcessed(tx, event, {
      outcome: 'processed',
      paymentRequestId: request.id,
    });
  }

  private async reconcileDisputeCreated(
    tx: TxClient,
    event: {
      id: string;
      stripeEventId: string;
      eventType: string;
      organizationId: string | null;
      stripeConnectedAccountId: string | null;
      livemode: boolean;
    },
    safe: ConnectWebhookSafeEventData,
  ): Promise<ReconciliationResult> {
    if (!event.organizationId) {
      return this.markDeferred(tx, event, 'deferred');
    }

    const existingDispute = await tx.paymentTransaction.findUnique({
      where: {
        provider_providerEventId_type: {
          provider: PaymentProvider.STRIPE,
          providerEventId: event.stripeEventId,
          type: PaymentTransactionType.DISPUTE,
        },
      },
    });
    if (existingDispute) {
      return this.markProcessed(tx, event, {
        outcome: 'skipped_duplicate',
        paymentRequestId: existingDispute.paymentRequestId,
      });
    }

    const request = await this.findRequestForChargeEvent(tx, event, safe);
    if (!request) {
      return this.markDeferred(tx, event, 'deferred');
    }

    const disputeAmountCents = safe.amount ?? request.paidAmountCents;
    const chargeTx = await tx.paymentTransaction.findFirst({
      where: {
        paymentRequestId: request.id,
        type: PaymentTransactionType.CHARGE,
        status: PaymentTransactionStatus.SUCCEEDED,
      },
    });

    await tx.paymentTransaction.create({
      data: {
        organizationId: event.organizationId,
        paymentRequestId: request.id,
        type: PaymentTransactionType.DISPUTE,
        status: PaymentTransactionStatus.SUCCEEDED,
        amountCents: disputeAmountCents,
        currency: request.currency,
        provider: PaymentProvider.STRIPE,
        providerObjectType: 'dispute',
        providerObjectId: safe.objectId,
        providerEventId: event.stripeEventId,
        parentTransactionId: chargeTx?.id ?? null,
        balanceImpactCents: -disputeAmountCents,
        applicationFeeImpactCents: 0,
        occurredAt: new Date(),
        metadata: {
          chargeId: safe.latest_charge ?? request.stripeChargeId,
          livemode: event.livemode,
        },
      },
    });

    let current = request;
    if (current.status !== BookingPaymentRequestStatus.DISPUTED) {
      current = await this.transitionRequestInTx(tx, current, BookingPaymentRequestStatus.DISPUTED);
    }

    await this.syncBookingPaymentSummary(tx, current.organizationId, current.bookingId);

    await this.writeAuditLog(tx, {
      organizationId: current.organizationId,
      entityId: current.id,
      description: `Stripe dispute opened for payment request ${current.id}`,
      changeSummary: `dispute=${safe.objectId ?? 'n/a'};amount=${disputeAmountCents}`,
      metaJson: {
        stripeEventId: event.stripeEventId,
        disputeId: safe.objectId,
        amountCents: disputeAmountCents,
      },
    });

    return this.markProcessed(tx, event, {
      outcome: 'processed',
      paymentRequestId: current.id,
    });
  }

  private async findRequestForChargeEvent(
    tx: TxClient,
    event: {
      organizationId: string | null;
      stripeConnectedAccountId: string | null;
    },
    safe: ConnectWebhookSafeEventData,
  ) {
    if (!event.organizationId) {
      return null;
    }

    const metadata = extractPaymentRequestMetadata(safe);
    if (metadata) {
      const byMetadata = await tx.bookingPaymentRequest.findFirst({
        where: {
          id: metadata.paymentRequestId,
          organizationId: event.organizationId,
        },
      });
      if (byMetadata) {
        return byMetadata;
      }
    }

    const chargeId = safe.charge ?? safe.objectId ?? safe.latest_charge ?? null;
    const paymentIntentId = safe.payment_intent ?? null;

    if (chargeId) {
      const byCharge = await tx.bookingPaymentRequest.findFirst({
        where: {
          organizationId: event.organizationId,
          stripeChargeId: chargeId,
          ...(event.stripeConnectedAccountId
            ? { stripeConnectedAccountId: event.stripeConnectedAccountId }
            : {}),
        },
      });
      if (byCharge) {
        return byCharge;
      }
    }

    if (paymentIntentId) {
      return tx.bookingPaymentRequest.findFirst({
        where: {
          organizationId: event.organizationId,
          stripePaymentIntentId: paymentIntentId,
          ...(event.stripeConnectedAccountId
            ? { stripeConnectedAccountId: event.stripeConnectedAccountId }
            : {}),
        },
      });
    }

    return null;
  }

  private async loadPaymentContext(
    tx: TxClient,
    event: {
      organizationId: string | null;
      stripeConnectedAccountId: string | null;
      livemode: boolean;
    },
    safe: ConnectWebhookSafeEventData,
  ) {
    if (!event.organizationId) {
      return null;
    }

    const metadata = extractPaymentRequestMetadata(safe);
    if (!metadata) {
      return null;
    }

    const amountCents = resolvePaymentAmountCents(safe);
    const currency = normalizeCurrency(safe.currency);
    if (amountCents == null || !currency) {
      return null;
    }

    const request = await tx.bookingPaymentRequest.findFirst({
      where: {
        id: metadata.paymentRequestId,
        organizationId: event.organizationId,
      },
    });
    if (!request) {
      return null;
    }

    assertPaymentRequestAlignment({
      eventOrganizationId: event.organizationId,
      metadata,
      request,
      amountCents,
      currency,
      connectedAccountId: event.stripeConnectedAccountId,
    });

    if (event.livemode !== request.stripeLivemode && request.stripeLivemode != null) {
      throw new PaymentReconciliationDomainError(
        'Webhook livemode does not match payment request',
        'RECONCILIATION_LIVEMODE_MISMATCH',
      );
    }

    const paymentIntentId =
      safe.payment_intent
      ?? (safe.objectType === 'payment_intent' ? safe.objectId : null)
      ?? request.stripePaymentIntentId;

    const chargeId = safe.latest_charge ?? null;
    const applicationFeeCents = request.applicationFeeAmountCents ?? 0;

    return {
      request,
      metadata,
      amountCents,
      currency,
      paymentIntentId,
      chargeId,
      applicationFeeCents,
    };
  }

  private async transitionRequestInTx(
    tx: TxClient,
    request: BookingPaymentRequest,
    toStatus: BookingPaymentRequestStatus,
  ): Promise<BookingPaymentRequest> {
    if (request.status === toStatus) {
      return request;
    }

    const transactions = await tx.paymentTransaction.findMany({
      where: { paymentRequestId: request.id, organizationId: request.organizationId },
    });

    const context: PaymentTransitionContext = {
      request: {
        status: request.status,
        amountCents: request.amountCents,
        paidAmountCents: request.paidAmountCents,
        refundedAmountCents: request.refundedAmountCents,
      },
      transactions: transactions.map((txRow) => ({
        type: txRow.type,
        status: txRow.status,
        amountCents: txRow.amountCents,
      })),
    };

    const patch = applyTransition(request.status, toStatus, context, new Date());

    return tx.bookingPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: patch.status,
        paidAmountCents: patch.paidAmountCents ?? request.paidAmountCents,
        paidAt: patch.paidAt ?? request.paidAt,
        failedAt: patch.failedAt ?? request.failedAt,
        cancelledAt: patch.cancelledAt ?? request.cancelledAt,
        refundedAmountCents: patch.refundedAmountCents ?? request.refundedAmountCents,
        version: request.version + 1,
      },
    });
  }

  private async recordStripeInvoicePaymentInTx(
    tx: TxClient,
    input: {
      organizationId: string;
      invoiceId: string;
      paymentRequestId: string;
      amountCents: number;
      paymentIntentId: string | null;
      chargeId: string | null;
      stripeEventId: string;
    },
  ): Promise<void> {
    const invoice = await tx.orgInvoice.findFirst({
      where: { id: input.invoiceId, organizationId: input.organizationId },
    });
    if (!invoice || !canRecordPayment(invoice.status)) {
      throw new PaymentReconciliationDomainError(
        `Invoice ${input.invoiceId} cannot accept payment`,
        'RECONCILIATION_INVALID_CONTEXT',
      );
    }

    const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
    if (input.amountCents > outstanding) {
      throw new PaymentReconciliationAmountMismatchError(invoice.totalCents, input.amountCents);
    }

    await tx.orgInvoicePayment.create({
      data: {
        organizationId: input.organizationId,
        invoiceId: input.invoiceId,
        amountCents: input.amountCents,
        method: InvoicePaymentMethod.STRIPE,
        paidAt: new Date(),
        reference: input.paymentIntentId,
        note: `Stripe Connect payment (${input.stripeEventId})`,
        stripePaymentIntentId: input.paymentIntentId,
        stripeChargeId: input.chargeId,
        bookingPaymentRequestId: input.paymentRequestId,
      },
    });

    const newPaid = invoice.paidCents + input.amountCents;
    const newOutstanding = Math.max(0, invoice.totalCents - newPaid);
    const newStatus = derivePaymentStatus(
      newPaid,
      invoice.totalCents,
      invoice.status,
      isOutgoingInvoiceType(invoice.type),
    );

    await tx.orgInvoice.update({
      where: { id: invoice.id },
      data: {
        paidCents: newPaid,
        outstandingCents: newOutstanding,
        status: newStatus,
        paidAt: newOutstanding === 0 ? new Date() : invoice.paidAt,
      },
    });
  }

  private async syncBookingPaymentSummary(
    tx: TxClient,
    organizationId: string,
    bookingId: string,
  ): Promise<void> {
    const requests = await tx.bookingPaymentRequest.findMany({
      where: { organizationId, bookingId },
      select: {
        status: true,
        amountCents: true,
        paidAmountCents: true,
        refundedAmountCents: true,
      },
    });

    const derived = deriveBookingPaymentStatus(requests);
    await tx.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: derived },
    });
  }

  private async patchPaymentRequestStripeRefs(
    tx: TxClient,
    request: BookingPaymentRequest,
    refs: { paymentIntentId: string | null; checkoutSessionId: string | null },
  ): Promise<void> {
    await tx.bookingPaymentRequest.update({
      where: { id: request.id },
      data: {
        stripePaymentIntentId: refs.paymentIntentId ?? request.stripePaymentIntentId,
        stripeCheckoutSessionId: refs.checkoutSessionId ?? request.stripeCheckoutSessionId,
      },
    });
  }

  private async writeAuditLog(
    tx: TxClient,
    input: {
      organizationId: string;
      entityId: string;
      description: string;
      changeSummary: string;
      metaJson: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.activityLog.create({
      data: {
        organizationId: input.organizationId,
        action: ActivityAction.SYNC,
        entity: ActivityEntity.INVOICE,
        entityId: input.entityId,
        description: input.description,
        changeSummary: input.changeSummary,
        level: 'INFO',
        metaJson: input.metaJson as Prisma.InputJsonValue,
      },
    });
  }

  private async markProcessed(
    tx: TxClient,
    event: { id: string; stripeEventId: string; eventType: string },
    params: { outcome: ReconciliationResult['outcome']; paymentRequestId?: string },
  ): Promise<ReconciliationResult> {
    await tx.stripeConnectWebhookEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: StripeConnectWebhookProcessingStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
        attempts: { increment: 1 },
      },
    });

    return {
      eventId: event.id,
      stripeEventId: event.stripeEventId,
      eventType: event.eventType,
      outcome: params.outcome,
      paymentRequestId: params.paymentRequestId,
    };
  }

  private async markDeferred(
    tx: TxClient,
    event: { id: string; stripeEventId: string; eventType: string },
    outcome: ReconciliationResult['outcome'],
  ): Promise<ReconciliationResult> {
    await tx.stripeConnectWebhookEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: StripeConnectWebhookProcessingStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: 'Deferred — no financial reconciliation for this event type',
        attempts: { increment: 1 },
      },
    });

    return {
      eventId: event.id,
      stripeEventId: event.stripeEventId,
      eventType: event.eventType,
      outcome,
    };
  }
}
