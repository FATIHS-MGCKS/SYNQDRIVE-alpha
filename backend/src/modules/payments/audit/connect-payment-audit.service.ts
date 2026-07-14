import { Injectable } from '@nestjs/common';
import {
  BookingPaymentRequestStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
  Prisma,
  StripeConnectWebhookProcessingStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { FakePaidCardAuditService } from '@modules/invoices/fake-paid-card-audit.service';
import { deriveBookingPaymentStatus } from '../payment-status.transitions';
import type {
  ConnectPaymentAuditFinding,
  ConnectPaymentAuditOptions,
  ConnectPaymentAuditReport,
  ConnectPaymentAuditSeverity,
} from './connect-payment-audit.types';

/**
 * Read-only Connect payment integrity audit — never mutates data.
 */
@Injectable()
export class ConnectPaymentAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fakePaidCardAudit: FakePaidCardAuditService,
  ) {}

  async runAudit(options?: ConnectPaymentAuditOptions): Promise<ConnectPaymentAuditReport> {
    const organizationId = options?.organizationId ?? null;
    const findings: ConnectPaymentAuditFinding[] = [];

    const requestWhere = organizationId ? { organizationId } : {};

    const requests = await this.prisma.bookingPaymentRequest.findMany({
      where: requestWhere,
      include: {
        transactions: true,
        invoicePayment: true,
        booking: { select: { id: true, paymentStatus: true } },
      },
      take: 5000,
      orderBy: { createdAt: 'desc' },
    });

    for (const request of requests) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: request.bookingId, organizationId: request.organizationId },
        select: { id: true },
      });
      if (!booking) {
        findings.push(this.finding('missing_booking', 'HIGH', request, 'Payment request has no booking'));
      }

      if (!request.invoiceId && request.status !== BookingPaymentRequestStatus.DRAFT) {
        findings.push(this.finding('missing_invoice', 'MEDIUM', request, 'Payment request without invoice'));
      }

      if (request.commissionableAmountCents != null && request.amountCents < request.commissionableAmountCents) {
        const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
          where: { bookingId: request.bookingId, organizationId: request.organizationId },
          select: { depositAmountCents: true },
        });
        if (snapshot?.depositAmountCents && snapshot.depositAmountCents > 0) {
          const rentalOnly = request.amountCents;
          const gross = request.commissionableAmountCents;
          if (rentalOnly >= gross) {
            findings.push(
              this.finding(
                'deposit_in_amount',
                'HIGH',
                request,
                'Commissionable amount includes deposit but payment amount matches gross',
              ),
            );
          }
        }
      }

      if (
        request.applicationFeeAmountCents != null
        && request.applicationFeeAmountCents > request.amountCents
      ) {
        findings.push(this.finding('fee_exceeds_amount', 'HIGH', request, 'Application fee exceeds payment amount'));
      }

      const hasCharge = request.transactions.some(
        (tx) => tx.type === PaymentTransactionType.CHARGE && tx.status === PaymentTransactionStatus.SUCCEEDED,
      );
      if (
        ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(request.status)
        && !hasCharge
      ) {
        findings.push(this.finding('paid_without_transaction', 'HIGH', request, 'PAID family without CHARGE transaction'));
      }

      if (request.invoiceId && request.status === BookingPaymentRequestStatus.PAID && !request.invoicePayment) {
        findings.push(
          this.finding('paid_without_invoice_payment', 'HIGH', request, 'PAID without OrgInvoicePayment'),
        );
      }

      if (request.refundedAmountCents > request.paidAmountCents) {
        findings.push(this.finding('refund_exceeds_paid', 'HIGH', request, 'Refunded amount exceeds paid amount'));
      }

      if (request.stripeLivemode != null) {
        const account = await this.prisma.organizationPaymentAccount.findFirst({
          where: { organizationId: request.organizationId },
          select: { livemode: true },
        });
        if (account && account.livemode !== request.stripeLivemode) {
          findings.push(this.finding('livemode_mismatch', 'HIGH', request, 'Request livemode differs from account'));
        }
      }
    }

    const duplicatePiRows = await this.prisma.bookingPaymentRequest.groupBy({
      by: ['stripePaymentIntentId'],
      where: {
        stripePaymentIntentId: { not: null },
        ...(organizationId ? { organizationId } : {}),
      },
      _count: { _all: true },
      having: { stripePaymentIntentId: { _count: { gt: 1 } } },
    });
    for (const row of duplicatePiRows) {
      if (!row.stripePaymentIntentId) continue;
      findings.push({
        category: 'duplicate_payment_intent',
        severity: 'HIGH',
        organizationId,
        paymentRequestId: null,
        bookingId: null,
        invoiceId: null,
        stripeEventId: null,
        message: `Duplicate payment intent ${row.stripePaymentIntentId}`,
        evidence: { paymentIntentId: row.stripePaymentIntentId, count: row._count._all },
      });
    }

    const duplicateCsRows = await this.prisma.bookingPaymentRequest.groupBy({
      by: ['stripeCheckoutSessionId'],
      where: {
        stripeCheckoutSessionId: { not: null },
        ...(organizationId ? { organizationId } : {}),
      },
      _count: { _all: true },
      having: { stripeCheckoutSessionId: { _count: { gt: 1 } } },
    });
    for (const row of duplicateCsRows) {
      if (!row.stripeCheckoutSessionId) continue;
      findings.push({
        category: 'duplicate_checkout_session',
        severity: 'HIGH',
        organizationId,
        paymentRequestId: null,
        bookingId: null,
        invoiceId: null,
        stripeEventId: null,
        message: `Duplicate checkout session ${row.stripeCheckoutSessionId}`,
        evidence: { checkoutSessionId: row.stripeCheckoutSessionId, count: row._count._all },
      });
    }

    const duplicateEvents = await this.prisma.$queryRaw<{ stripe_event_id: string; cnt: bigint }[]>`
      SELECT stripe_event_id, COUNT(*)::bigint AS cnt
      FROM stripe_connect_webhook_events
      GROUP BY stripe_event_id
      HAVING COUNT(*) > 1
      LIMIT 20
    `;
    for (const row of duplicateEvents) {
      findings.push({
        category: 'duplicate_stripe_event',
        severity: 'HIGH',
        organizationId,
        paymentRequestId: null,
        bookingId: null,
        invoiceId: null,
        stripeEventId: row.stripe_event_id,
        message: 'Duplicate stripe_event_id rows (schema should prevent)',
        evidence: { count: Number(row.cnt) },
      });
    }

    const bookings = await this.prisma.booking.findMany({
      where: organizationId ? { organizationId } : { organization: { paymentsEnabled: true } },
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
      take: 1000,
    });
    for (const booking of bookings) {
      const derived = deriveBookingPaymentStatus(booking.bookingPaymentRequests);
      if (derived !== booking.paymentStatus) {
        findings.push({
          category: 'booking_summary_mismatch',
          severity: 'MEDIUM',
          organizationId: booking.organizationId,
          paymentRequestId: null,
          bookingId: booking.id,
          invoiceId: null,
          stripeEventId: null,
          message: `Booking paymentStatus ${booking.paymentStatus} != derived ${derived}`,
          evidence: { stored: booking.paymentStatus, derived },
        });
      }
    }

    const stuckWebhooks = await this.prisma.stripeConnectWebhookEvent.findMany({
      where: {
        processingStatus: {
          in: [
            StripeConnectWebhookProcessingStatus.RECEIVED,
            StripeConnectWebhookProcessingStatus.FAILED,
          ],
        },
        receivedAt: { lt: new Date(Date.now() - 60 * 60_000) },
        ...(organizationId ? { organizationId } : {}),
      },
      take: 100,
    });
    for (const event of stuckWebhooks) {
      findings.push({
        category: 'stuck_webhook',
        severity: 'MEDIUM',
        organizationId: event.organizationId,
        paymentRequestId: null,
        bookingId: null,
        invoiceId: null,
        stripeEventId: event.stripeEventId,
        message: `Webhook stuck in ${event.processingStatus}`,
        evidence: { attempts: event.attempts, eventType: event.eventType },
      });
    }

    const unresolved = await this.prisma.stripeConnectWebhookEvent.count({
      where: { processingStatus: StripeConnectWebhookProcessingStatus.UNRESOLVED_ACCOUNT },
    });
    if (unresolved > 0) {
      findings.push({
        category: 'unresolved_webhook_account',
        severity: 'HIGH',
        organizationId,
        paymentRequestId: null,
        bookingId: null,
        invoiceId: null,
        stripeEventId: null,
        message: `${unresolved} webhook(s) with unresolved connected account`,
        evidence: { count: unresolved },
      });
    }

    const fakePaid = await this.fakePaidCardAudit.runAudit(
      organizationId ? { organizationId } : undefined,
    );
    for (const candidate of fakePaid.candidates) {
      findings.push({
        category: 'fake_paid_candidate',
        severity: candidate.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
        organizationId: candidate.organizationId,
        paymentRequestId: null,
        bookingId: candidate.bookingId,
        invoiceId: candidate.invoiceId,
        stripeEventId: null,
        message: candidate.reasons.join('; '),
        evidence: {
          confidence: candidate.confidence,
          paymentMethod: candidate.paymentMethod,
          paymentId: candidate.paymentId,
        },
      });
    }

    return this.buildReport(findings, organizationId);
  }

  private finding(
    category: ConnectPaymentAuditFinding['category'],
    severity: ConnectPaymentAuditSeverity,
    request: {
      id: string;
      organizationId: string;
      bookingId: string;
      invoiceId: string | null;
    },
    message: string,
  ): ConnectPaymentAuditFinding {
    return {
      category,
      severity,
      organizationId: request.organizationId,
      paymentRequestId: request.id,
      bookingId: request.bookingId,
      invoiceId: request.invoiceId,
      stripeEventId: null,
      message,
      evidence: {},
    };
  }

  private buildReport(
    findings: ConnectPaymentAuditFinding[],
    organizationId: string | null,
  ): ConnectPaymentAuditReport {
    const bySeverity: ConnectPaymentAuditReport['summary']['bySeverity'] = {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      INFO: 0,
    };
    const byCategory: ConnectPaymentAuditReport['summary']['byCategory'] = {};
    for (const f of findings) {
      bySeverity[f.severity] += 1;
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    }
    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      findings,
      summary: {
        total: findings.length,
        bySeverity,
        byCategory,
      },
    };
  }
}
