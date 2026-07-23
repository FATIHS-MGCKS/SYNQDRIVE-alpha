import { Injectable, Logger } from '@nestjs/common';
import {
  BookingPaymentRequestStatus,
  GeneratedDocument,
  OrgInvoice,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { BookingInvoiceLifecycleService } from '@modules/invoices/booking-invoice-lifecycle.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { canCancelInvoice } from '@modules/invoices/invoice-domain.util';
import { PaymentStatusService } from '@modules/payments/payment-status.service';
import { BookingCancellationAuditService } from './booking-cancellation-audit.service';
import { BookingCancellationFeeService } from './booking-cancellation-fee.service';
import type {
  BookingCancellationInput,
  BookingCancellationProcessStatus,
  BookingCancellationResult,
} from './booking-cancellation.types';

const ACTIVE_PAYMENT_STATUSES: BookingPaymentRequestStatus[] = [
  BookingPaymentRequestStatus.DRAFT,
  BookingPaymentRequestStatus.OPEN,
  BookingPaymentRequestStatus.LINK_PENDING,
  BookingPaymentRequestStatus.CHECKOUT_READY,
  BookingPaymentRequestStatus.LINK_SENT,
  BookingPaymentRequestStatus.PROCESSING,
];

@Injectable()
export class BookingCancellationOrchestrationService {
  private readonly logger = new Logger(BookingCancellationOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly feeService: BookingCancellationFeeService,
    private readonly generatedDocumentsService: GeneratedDocumentsService,
    private readonly bookingInvoiceLifecycle: BookingInvoiceLifecycleService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentStatusService: PaymentStatusService,
    private readonly cancellationAudit: BookingCancellationAuditService,
  ) {}

  async orchestrateCancellation(
    input: BookingCancellationInput & {
      fromStatus: string | null;
      toStatus: string;
    },
  ): Promise<BookingCancellationResult> {
    const booking = await this.prisma.booking.findFirstOrThrow({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: { startDate: true },
    });

    const fee = await this.feeService.computeFee({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      effectiveAt: input.effectiveAt,
      pickupAt: booking.startDate,
    });

    const processStatus = await this.syncFinancialArtifacts(input);

    const auditEventId = await this.cancellationAudit.append({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      statusCommandId: input.statusCommandId ?? null,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reasonCode: input.reasonCode,
      description: input.description ?? null,
      effectiveAt: input.effectiveAt,
      feeCents: fee.feeCents,
      feeCurrency: fee.currency,
      actor: input.actor,
      requestContext: input.requestContext,
      processStatus,
      correlationId: input.correlationId ?? null,
    });

    return { fee, processStatus, auditEventId };
  }

  private async syncFinancialArtifacts(
    input: BookingCancellationInput,
  ): Promise<BookingCancellationProcessStatus> {
    const { organizationId, bookingId } = input;

    const [docsBefore, invoiceBefore, paymentRequests] = await Promise.all([
      this.generatedDocumentsService.listForBooking(organizationId, bookingId),
      this.bookingInvoiceLifecycle.resolveCanonicalBookingInvoice(organizationId, bookingId),
      this.prisma.bookingPaymentRequest.findMany({
        where: { organizationId, bookingId },
        select: { id: true, status: true, paidAmountCents: true },
      }),
    ]);

    const nonVoidDocs = docsBefore.filter((doc) => doc.status !== 'VOID');
    let voidedCount = 0;
    try {
      voidedCount = await this.generatedDocumentsService.voidAllForBooking(
        organizationId,
        bookingId,
      );
    } catch (err) {
      this.logger.warn(
        `Document void on cancel booking=${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const docsAfter = await this.generatedDocumentsService
      .listForBooking(organizationId, bookingId)
      .catch(() => [] as GeneratedDocument[]);
    const pendingDocs = docsAfter.filter((doc) => doc.status !== 'VOID').length;

    const invoiceResult = await this.syncInvoiceOnCancel(organizationId, invoiceBefore);
    const paymentResult = await this.syncPaymentsOnCancel(
      organizationId,
      paymentRequests,
    );

    const followUpProcessesRunning =
      pendingDocs > 0 ||
      paymentResult.activeRequestIds.length > 0 ||
      invoiceResult.requiresManualRefund ||
      paymentResult.requiresManualRefund;

    return {
      documents: {
        state: this.resolveDocumentState(nonVoidDocs.length, voidedCount, pendingDocs),
        voidedCount,
        pendingCount: pendingDocs,
      },
      invoice: invoiceResult,
      payment: paymentResult,
      followUpProcessesRunning,
    };
  }

  private resolveDocumentState(
    beforeCount: number,
    voidedCount: number,
    pendingCount: number,
  ): BookingCancellationProcessStatus['documents']['state'] {
    if (beforeCount === 0) return 'NOT_APPLICABLE';
    if (pendingCount > 0) return 'PARTIAL';
    if (voidedCount > 0) return 'COMPLETED';
    return 'NOT_APPLICABLE';
  }

  private async syncInvoiceOnCancel(
    orgId: string,
    invoice: OrgInvoice | null,
  ): Promise<BookingCancellationProcessStatus['invoice']> {
    if (!invoice) {
      return {
        state: 'NOT_APPLICABLE',
        invoiceId: null,
        previousStatus: null,
        nextStatus: null,
        requiresManualRefund: false,
      };
    }

    const previousStatus = invoice.status;
    if (['VOID', 'CANCELLED', 'CREDITED', 'REJECTED'].includes(previousStatus)) {
      return {
        state: 'COMPLETED',
        invoiceId: invoice.id,
        previousStatus,
        nextStatus: previousStatus,
        requiresManualRefund: false,
      };
    }

    if (canCancelInvoice(invoice.status, invoice.paidCents, invoice.totalCents)) {
      try {
        const cancelled = await this.invoicesService.cancel(invoice.id, orgId);
        return {
          state: 'COMPLETED',
          invoiceId: invoice.id,
          previousStatus,
          nextStatus: cancelled.status,
          requiresManualRefund: false,
        };
      } catch (err) {
        this.logger.warn(
          `Invoice cancel on booking cancel invoice=${invoice.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const requiresManualRefund =
      invoice.paidCents > 0 || invoice.status === 'PAID' || invoice.status === 'PARTIALLY_PAID';

    return {
      state: requiresManualRefund ? 'REQUIRES_MANUAL_ACTION' : 'PARTIAL',
      invoiceId: invoice.id,
      previousStatus,
      nextStatus: previousStatus,
      requiresManualRefund,
    };
  }

  private async syncPaymentsOnCancel(
    orgId: string,
    requests: Array<{ id: string; status: BookingPaymentRequestStatus; paidAmountCents: number }>,
  ): Promise<BookingCancellationProcessStatus['payment']> {
    if (requests.length === 0) {
      return {
        state: 'NOT_APPLICABLE',
        cancelledRequestIds: [],
        activeRequestIds: [],
        requiresManualRefund: false,
      };
    }

    const cancelledRequestIds: string[] = [];
    const activeRequestIds: string[] = [];
    let requiresManualRefund = false;

    for (const request of requests) {
      if (request.paidAmountCents > 0) {
        requiresManualRefund = true;
      }

      if (!ACTIVE_PAYMENT_STATUSES.includes(request.status)) {
        if (request.status === BookingPaymentRequestStatus.CANCELLED) {
          cancelledRequestIds.push(request.id);
        }
        continue;
      }

      try {
        await this.paymentStatusService.transitionPaymentRequest({
          organizationId: orgId,
          paymentRequestId: request.id,
          toStatus: BookingPaymentRequestStatus.CANCELLED,
        });
        cancelledRequestIds.push(request.id);
      } catch (err) {
        this.logger.warn(
          `Payment request cancel on booking cancel request=${request.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        activeRequestIds.push(request.id);
      }
    }

    const state: BookingCancellationProcessStatus['payment']['state'] =
      activeRequestIds.length > 0
        ? 'PARTIAL'
        : requiresManualRefund
          ? 'REQUIRES_MANUAL_ACTION'
          : cancelledRequestIds.length > 0
            ? 'COMPLETED'
            : 'NOT_APPLICABLE';

    return {
      state,
      cancelledRequestIds,
      activeRequestIds,
      requiresManualRefund,
    };
  }
}
