import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BookingPaymentRequestStatus,
  PaymentEmailOutboxStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
  StripeConnectWebhookProcessingStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { PaymentStatusService } from './payment-status.service';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';
import { PaymentMetricsService } from './observability/payment-metrics.service';
import { formatPaymentLogPayload } from './utils/payment-log.util';
import { STRIPE_CONNECT_ADAPTER } from './stripe/stripe-connect.adapter';
import type { StripeConnectAdapter } from './stripe/stripe-connect.adapter';
import { deriveBookingPaymentStatus } from './payment-status.transitions';

export interface PaymentConnectReconciliationRunResult {
  webhooksReprocessed: number;
  webhooksFailed: number;
  expiredCheckouts: number;
  accountsSynced: number;
  alerts: string[];
}

const MAX_WEBHOOK_ATTEMPTS = 8;
const WEBHOOK_BATCH_SIZE = 25;
const STUCK_PROCESSING_MINUTES = 20;

@Injectable()
export class PaymentConnectReconciliationService {
  private readonly logger = new Logger(PaymentConnectReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationService: PaymentReconciliationService,
    private readonly webhookEventRepository: StripeConnectWebhookEventRepository,
    private readonly organizationPaymentAccountService: OrganizationPaymentAccountService,
    private readonly organizationPaymentAccountRepository: OrganizationPaymentAccountRepository,
    private readonly paymentStatusService: PaymentStatusService,
    private readonly paymentMetrics: PaymentMetricsService,
    @Inject(STRIPE_CONNECT_ADAPTER)
    private readonly stripeConnectAdapter: StripeConnectAdapter,
  ) {}

  async runPeriodicReconciliation(): Promise<PaymentConnectReconciliationRunResult> {
    const alerts: string[] = [];
    let webhooksReprocessed = 0;
    let webhooksFailed = 0;
    let expiredCheckouts = 0;
    let accountsSynced = 0;

    await this.refreshWebhookBacklogMetrics();
    await this.refreshEmailDeadLetterGauge();

    const webhookResults = await this.reprocessPendingWebhooks();
    webhooksReprocessed = webhookResults.reprocessed;
    webhooksFailed = webhookResults.failed;
    alerts.push(...webhookResults.alerts);

    const unresolved = await this.resolveUnresolvedAccountWebhooks();
    webhooksReprocessed += unresolved.reprocessed;
    alerts.push(...unresolved.alerts);

    expiredCheckouts = await this.expireStaleCheckoutSessions();
    accountsSynced = await this.syncConnectAccountStatuses();

    const integrityAlerts = await this.detectIntegrityAlerts();
    alerts.push(...integrityAlerts);

    const stuckAlerts = await this.inspectStuckProcessingRequests();
    alerts.push(...stuckAlerts);

    if (alerts.length > 0) {
      this.logger.warn(
        formatPaymentLogPayload('PAYMENT_RECONCILE_ALERTS', {}, {
          alertCount: alerts.length,
        }),
      );
      for (const alert of alerts.slice(0, 20)) {
        this.logger.warn(alert);
      }
    }

    return {
      webhooksReprocessed,
      webhooksFailed,
      expiredCheckouts,
      accountsSynced,
      alerts,
    };
  }

  private async refreshWebhookBacklogMetrics(): Promise<void> {
    const counts = await this.webhookEventRepository.countByProcessingStatus();
    for (const status of Object.values(StripeConnectWebhookProcessingStatus)) {
      this.paymentMetrics.connectWebhookBacklog.set(
        { status },
        counts.find((row) => row.processingStatus === status)?.count ?? 0,
      );
    }
  }

  private async refreshEmailDeadLetterGauge(): Promise<void> {
    const deadLetter = await this.prisma.paymentEmailOutbox.count({
      where: { status: PaymentEmailOutboxStatus.DEAD_LETTER },
    });
    this.paymentMetrics.paymentEmailDeadLetter.set(deadLetter);
  }

  private async reprocessPendingWebhooks(): Promise<{
    reprocessed: number;
    failed: number;
    alerts: string[];
  }> {
    const alerts: string[] = [];
    let reprocessed = 0;
    let failed = 0;

    const cutoff = new Date(Date.now() - 30_000);
    const pending = await this.webhookEventRepository.findPendingForReconciliation({
      limit: WEBHOOK_BATCH_SIZE,
      maxAttempts: MAX_WEBHOOK_ATTEMPTS,
      olderThan: cutoff,
    });

    for (const event of pending) {
      try {
        const result = await this.reconciliationService.processStoredWebhookEvent(event.id);
        this.paymentMetrics.webhookProcessing.inc({
          event_type: event.eventType,
          outcome: result.outcome,
        });
        reprocessed += 1;
      } catch (error) {
        failed += 1;
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
        if (event.attempts + 1 >= MAX_WEBHOOK_ATTEMPTS) {
          alerts.push(
            `ALERT webhook_exhausted stripeEventId=${event.stripeEventId} type=${event.eventType}`,
          );
          this.paymentMetrics.reconciliationMismatch.inc({ kind: 'webhook_exhausted' });
        }
      }
    }

    return { reprocessed, failed, alerts };
  }

  private async resolveUnresolvedAccountWebhooks(): Promise<{
    reprocessed: number;
    alerts: string[];
  }> {
    const alerts: string[] = [];
    let reprocessed = 0;

    const unresolved = await this.prisma.stripeConnectWebhookEvent.findMany({
      where: {
        processingStatus: StripeConnectWebhookProcessingStatus.UNRESOLVED_ACCOUNT,
        stripeConnectedAccountId: { not: null },
      },
      orderBy: { receivedAt: 'asc' },
      take: WEBHOOK_BATCH_SIZE,
    });

    for (const event of unresolved) {
      if (!event.stripeConnectedAccountId) continue;
      const account = await this.organizationPaymentAccountRepository.findByStripeConnectedAccountId(
        event.stripeConnectedAccountId,
      );
      if (!account) continue;

      await this.webhookEventRepository.update(event.id, {
        organizationId: account.organizationId,
        processingStatus: StripeConnectWebhookProcessingStatus.RECEIVED,
      });

      try {
        await this.reconciliationService.processStoredWebhookEvent(event.id);
        reprocessed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        alerts.push(
          `ALERT unresolved_account_reconcile_failed stripeEventId=${event.stripeEventId} err=${message}`,
        );
      }
    }

    return { reprocessed, alerts };
  }

  private async expireStaleCheckoutSessions(): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.bookingPaymentRequest.findMany({
      where: {
        status: {
          in: [
            BookingPaymentRequestStatus.CHECKOUT_READY,
            BookingPaymentRequestStatus.LINK_SENT,
          ],
        },
        checkoutExpiresAt: { lt: now },
        paidAmountCents: 0,
      },
      take: 50,
    });

    let expired = 0;
    for (const request of candidates) {
      try {
        await this.paymentStatusService.transitionPaymentRequest({
          organizationId: request.organizationId,
          paymentRequestId: request.id,
          toStatus: BookingPaymentRequestStatus.EXPIRED,
        });
        expired += 1;
      } catch {
        // Guard rejected — leave for manual review.
        this.paymentMetrics.reconciliationMismatch.inc({ kind: 'expire_checkout_rejected' });
      }
    }

    return expired;
  }

  private async syncConnectAccountStatuses(): Promise<number> {
    const accounts = await this.prisma.organizationPaymentAccount.findMany({
      where: {
        organization: { paymentsEnabled: true },
        stripeConnectedAccountId: { not: null },
      },
      take: 20,
      orderBy: { lastSyncedAt: 'asc' },
    });

    let synced = 0;
    for (const account of accounts) {
      if (!account.stripeConnectedAccountId) continue;
      try {
        const status = await this.stripeConnectAdapter.getConnectedAccountStatus(
          account.stripeConnectedAccountId,
        );
        const payout = await this.stripeConnectAdapter.getSafePayoutSummary(
          account.stripeConnectedAccountId,
        );
        await this.prisma.organizationPaymentAccount.update({
          where: { id: account.id },
          data: {
            ...this.organizationPaymentAccountService.buildStatusUpdate(status, payout),
            lastSyncedAt: new Date(),
          },
        });
        synced += 1;
      } catch (error) {
        this.logger.warn(
          formatPaymentLogPayload(
            'PAYMENT_ACCOUNT_SYNC_FAILED',
            {
              organizationId: account.organizationId,
              connectedAccountId: account.stripeConnectedAccountId,
            },
            { error: error instanceof Error ? error.message : 'unknown' },
          ),
        );
      }
    }

    return synced;
  }

  private async detectIntegrityAlerts(): Promise<string[]> {
    const alerts: string[] = [];

    const paidWithoutCharge = await this.prisma.bookingPaymentRequest.findMany({
      where: {
        status: {
          in: [
            BookingPaymentRequestStatus.PAID,
            BookingPaymentRequestStatus.PARTIALLY_REFUNDED,
            BookingPaymentRequestStatus.REFUNDED,
          ],
        },
      },
      include: {
        transactions: {
          where: {
            type: PaymentTransactionType.CHARGE,
            status: PaymentTransactionStatus.SUCCEEDED,
          },
          take: 1,
        },
        invoicePayment: true,
      },
      take: 100,
    });

    for (const request of paidWithoutCharge) {
      if (request.transactions.length === 0) {
        alerts.push(`ALERT paid_without_charge paymentRequestId=${request.id}`);
        this.paymentMetrics.reconciliationMismatch.inc({ kind: 'paid_without_charge' });
      }
      if (request.invoiceId && !request.invoicePayment) {
        alerts.push(`ALERT paid_without_invoice_payment paymentRequestId=${request.id}`);
        this.paymentMetrics.reconciliationMismatch.inc({ kind: 'paid_without_invoice_payment' });
      }
      if (request.refundedAmountCents > request.paidAmountCents) {
        alerts.push(`ALERT refund_exceeds_paid paymentRequestId=${request.id}`);
        this.paymentMetrics.reconciliationMismatch.inc({ kind: 'refund_exceeds_paid' });
      }
      if (
        request.applicationFeeAmountCents != null
        && request.applicationFeeAmountCents > request.amountCents
      ) {
        alerts.push(`ALERT fee_exceeds_amount paymentRequestId=${request.id}`);
        this.paymentMetrics.reconciliationMismatch.inc({ kind: 'fee_exceeds_amount' });
      }
    }

    const duplicatePi = await this.prisma.$queryRaw<{ stripe_payment_intent_id: string; cnt: bigint }[]>`
      SELECT stripe_payment_intent_id, COUNT(*)::bigint AS cnt
      FROM booking_payment_requests
      WHERE stripe_payment_intent_id IS NOT NULL
      GROUP BY stripe_payment_intent_id
      HAVING COUNT(*) > 1
      LIMIT 20
    `;
    for (const row of duplicatePi) {
      alerts.push(`ALERT duplicate_payment_intent pi=${row.stripe_payment_intent_id}`);
      this.paymentMetrics.reconciliationMismatch.inc({ kind: 'duplicate_payment_intent' });
    }

    return alerts;
  }

  private async inspectStuckProcessingRequests(): Promise<string[]> {
    const alerts: string[] = [];
    const threshold = new Date(Date.now() - STUCK_PROCESSING_MINUTES * 60_000);

    const stuck = await this.prisma.bookingPaymentRequest.findMany({
      where: {
        status: BookingPaymentRequestStatus.PROCESSING,
        updatedAt: { lt: threshold },
        stripePaymentIntentId: { not: null },
        stripeConnectedAccountId: { not: null },
      },
      take: 25,
    });

    for (const request of stuck) {
      const charge = await this.prisma.paymentTransaction.findFirst({
        where: {
          paymentRequestId: request.id,
          type: PaymentTransactionType.CHARGE,
          status: PaymentTransactionStatus.SUCCEEDED,
        },
      });
      if (charge) {
        alerts.push(`ALERT processing_with_charge paymentRequestId=${request.id}`);
        this.paymentMetrics.reconciliationMismatch.inc({ kind: 'processing_with_charge' });
        continue;
      }

      if (!request.stripePaymentIntentId || !request.stripeConnectedAccountId) continue;

      try {
        const pi = await this.stripeConnectAdapter.retrievePaymentIntent(
          request.stripeConnectedAccountId,
          request.stripePaymentIntentId,
        );
        if (pi.status === 'succeeded') {
          alerts.push(
            `ALERT stripe_succeeded_local_processing paymentRequestId=${request.id} pi=${pi.paymentIntentId}`,
          );
          this.paymentMetrics.reconciliationMismatch.inc({ kind: 'stripe_succeeded_local_processing' });
        }
      } catch (error) {
        alerts.push(
          `ALERT stuck_processing_stripe_unreachable paymentRequestId=${request.id}`,
        );
        this.paymentMetrics.reconciliationMismatch.inc({ kind: 'stuck_processing' });
      }
    }

    const bookings = await this.prisma.booking.findMany({
      where: { organization: { paymentsEnabled: true } },
      select: {
        id: true,
        organizationId: true,
        paymentStatus: true,
        bookingPaymentRequests: {
          select: {
            status: true,
            amountCents: true,
            paidAmountCents: true,
            refundedAmountCents: true,
          },
        },
      },
      take: 50,
    });

    for (const booking of bookings) {
      const derived = deriveBookingPaymentStatus(booking.bookingPaymentRequests);
      if (derived !== booking.paymentStatus) {
        alerts.push(
          `ALERT booking_summary_mismatch bookingId=${booking.id} stored=${booking.paymentStatus} derived=${derived}`,
        );
        this.paymentMetrics.reconciliationMismatch.inc({ kind: 'booking_summary_mismatch' });
      }
    }

    return alerts;
  }
}
