import { Injectable } from '@nestjs/common';
import { ActivityEntity, InvoicePaymentMethod, OrgInvoiceType, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildHumanSummary,
  evaluateFakePaidCardPayment,
} from './fake-paid-card-audit.util';
import type {
  FakePaidCardAuditCandidate,
  FakePaidCardAuditOptions,
  FakePaidCardAuditReport,
} from './fake-paid-card-audit.types';

const MANUAL_PAYMENT_ACTIVITY_WINDOW_MS = 2 * 60 * 1000;

@Injectable()
export class FakePaidCardAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only audit — never mutates invoice or payment data.
   */
  async runAudit(options?: FakePaidCardAuditOptions): Promise<FakePaidCardAuditReport> {
    const organizationId = options?.organizationId ?? null;
    const dateFrom = options?.dateFrom ?? null;
    const dateTo = options?.dateTo ?? null;

    const paymentWhere: Prisma.OrgInvoicePaymentWhereInput = {
      method: { in: [InvoicePaymentMethod.CARD, InvoicePaymentMethod.STRIPE] },
      invoice: {
        type: OrgInvoiceType.OUTGOING_BOOKING,
        bookingId: { not: null },
        ...(organizationId ? { organizationId } : {}),
      },
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    };

    const payments = await this.prisma.orgInvoicePayment.findMany({
      where: paymentWhere,
      include: {
        invoice: {
          select: {
            id: true,
            organizationId: true,
            bookingId: true,
            invoiceNumberDisplay: true,
            currency: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const bookingIds = [
      ...new Set(
        payments
          .map((p) => p.invoice.bookingId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const bookings =
      bookingIds.length > 0
        ? await this.prisma.booking.findMany({
            where: {
              id: { in: bookingIds },
              ...(organizationId ? { organizationId } : {}),
            },
            select: { id: true, organizationId: true, updatedAt: true },
          })
        : [];

    const bookingById = new Map(bookings.map((b) => [b.id, b]));

    const candidates: FakePaidCardAuditCandidate[] = [];

    for (const payment of payments) {
      const invoice = payment.invoice;
      const bookingId = invoice.bookingId;
      if (!bookingId) continue;

      if (payment.organizationId !== invoice.organizationId) continue;

      const booking = bookingById.get(bookingId) ?? null;
      if (organizationId && booking && booking.organizationId !== organizationId) continue;

      const hasManualPaymentActivityLog = await this.hasManualPaymentActivityNear(
        payment.organizationId,
        invoice.id,
        payment.createdAt,
      );

      const evaluation = evaluateFakePaidCardPayment({
        paymentId: payment.id,
        organizationId: payment.organizationId,
        invoiceId: invoice.id,
        bookingId,
        invoiceNumber: invoice.invoiceNumberDisplay,
        amountCents: payment.amountCents,
        currency: invoice.currency,
        paymentMethod: payment.method,
        paymentReference: payment.reference,
        paymentNote: payment.note,
        paymentCreatedAt: payment.createdAt,
        bookingUpdatedAt: booking?.updatedAt ?? null,
        hasManualPaymentActivityLog,
      });

      if (!evaluation.isCandidate || !evaluation.confidence) continue;

      candidates.push({
        organizationId: payment.organizationId,
        bookingId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumberDisplay,
        paymentId: payment.id,
        amountCents: payment.amountCents,
        currency: invoice.currency,
        paymentMethod: payment.method,
        createdAt: payment.createdAt.toISOString(),
        reasons: evaluation.reasons,
        confidence: evaluation.confidence,
      });
    }

    const summary = {
      paymentsScanned: payments.length,
      candidatesTotal: candidates.length,
      high: candidates.filter((c) => c.confidence === 'HIGH').length,
      medium: candidates.filter((c) => c.confidence === 'MEDIUM').length,
      low: candidates.filter((c) => c.confidence === 'LOW').length,
    };

    const report: FakePaidCardAuditReport = {
      mode: 'audit',
      readonly: true,
      generatedAt: new Date().toISOString(),
      organizationId,
      dateFrom: dateFrom?.toISOString() ?? null,
      dateTo: dateTo?.toISOString() ?? null,
      summary,
      candidates,
      humanSummary: '',
    };

    report.humanSummary = buildHumanSummary(report);
    return report;
  }

  private async hasManualPaymentActivityNear(
    organizationId: string,
    invoiceId: string,
    paymentCreatedAt: Date,
  ): Promise<boolean> {
    const from = new Date(paymentCreatedAt.getTime() - MANUAL_PAYMENT_ACTIVITY_WINDOW_MS);
    const to = new Date(paymentCreatedAt.getTime() + MANUAL_PAYMENT_ACTIVITY_WINDOW_MS);

    const log = await this.prisma.activityLog.findFirst({
      where: {
        organizationId,
        entity: ActivityEntity.INVOICE,
        entityId: invoiceId,
        createdAt: { gte: from, lte: to },
        OR: [
          { route: { contains: '/payments', mode: 'insensitive' } },
          { route: { contains: '/pay', mode: 'insensitive' } },
          { description: { contains: '/payments', mode: 'insensitive' } },
          { description: { contains: '/pay', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });

    return Boolean(log);
  }
}
