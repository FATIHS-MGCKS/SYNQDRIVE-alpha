import { Injectable, Logger } from '@nestjs/common';
import {
  OrgInvoiceProcessEntityType,
  OrgInvoiceProcessType,
  OutboundEmailStatus,
} from '@prisma/client';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { BookingDocumentEmailService } from '@modules/outbound-email/booking-document-email.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingInvoiceLifecycleService } from '../booking-invoice-lifecycle.service';
import { InvoicesService } from '../invoices.service';
import type { InvoiceProcessRow } from './invoice-process.types';

@Injectable()
export class InvoiceProcessExecutorService {
  private readonly logger = new Logger(InvoiceProcessExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
    private readonly bookingInvoiceLifecycle: BookingInvoiceLifecycleService,
    private readonly bundleService: BookingDocumentBundleService,
    private readonly bookingDocumentEmail: BookingDocumentEmailService,
  ) {}

  async execute(process: InvoiceProcessRow): Promise<void> {
    const payload = (process.payloadJson ?? {}) as Record<string, unknown>;

    switch (process.processType) {
      case OrgInvoiceProcessType.BOOKING_INVOICE_CREATE:
        await this.executeBookingInvoiceCreate(process.organizationId, process.entityId);
        return;
      case OrgInvoiceProcessType.BOOKING_FINANCE_SYNC:
        await this.bookingInvoiceLifecycle.syncOnBookingConfirmed(
          process.organizationId,
          process.entityId,
          {
            paymentIntent: payload.paymentIntent as never,
            paymentMethod: payload.paymentMethod as never,
            markPaid: payload.markPaid === true,
            userId: (payload.userId as string) ?? null,
          },
        );
        return;
      case OrgInvoiceProcessType.INVOICE_DOCUMENT_GENERATE:
      case OrgInvoiceProcessType.DOCUMENT_STORE:
        await this.executeDocumentGenerate(process, payload);
        return;
      case OrgInvoiceProcessType.INVOICE_DOCUMENT_LINK:
        await this.executeDocumentLink(process.organizationId, process.entityId, payload);
        return;
      case OrgInvoiceProcessType.INVOICE_EMAIL_SEND:
        await this.bookingDocumentEmail.maybeAutoSendBookingDocuments(
          process.organizationId,
          (payload.bookingId as string) ?? process.entityId,
          (payload.userId as string) ?? null,
        );
        return;
      case OrgInvoiceProcessType.PROVIDER_STATUS_SYNC:
        await this.executeProviderStatusSync(process.organizationId, process.entityId);
        return;
      case OrgInvoiceProcessType.PAYMENT_SYNC:
        await this.executePaymentSync(process.organizationId, process.entityId);
        return;
      case OrgInvoiceProcessType.LINKED_TASK_UPDATE:
        await this.executeLinkedTaskUpdate(process.organizationId, process.entityId);
        return;
      default:
        throw new Error(`Unsupported process type: ${process.processType}`);
    }
  }

  private async executeBookingInvoiceCreate(orgId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
    });
    if (!booking) throw Object.assign(new Error('Booking not found'), { code: 'NOT_FOUND' });

    await this.invoicesService.createBookingInvoice(orgId, {
      id: booking.id,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      totalPriceCents: booking.totalPriceCents,
      dailyRateCents: booking.dailyRateCents,
      startDate: booking.startDate,
      endDate: booking.endDate,
      currency: booking.currency,
      kmIncluded: booking.kmIncluded,
    });
  }

  private async executeDocumentGenerate(
    process: InvoiceProcessRow,
    payload: Record<string, unknown>,
  ) {
    const bookingId =
      process.entityType === OrgInvoiceProcessEntityType.BOOKING
        ? process.entityId
        : (payload.bookingId as string);

    if (!bookingId) {
      throw Object.assign(new Error('bookingId required'), { code: 'BAD_REQUEST' });
    }

    const documentType = (payload.documentType as string) ?? DOCUMENT_TYPE.BOOKING_INVOICE;
    if (payload.regenerate === true) {
      await this.bundleService.regenerate(
        process.organizationId,
        bookingId,
        documentType,
        (payload.userId as string) ?? null,
      );
      return;
    }

    await this.bundleService.generateInitialBundle(
      process.organizationId,
      bookingId,
      (payload.userId as string) ?? null,
    );
  }

  private async executeDocumentLink(
    orgId: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    const documentId = (payload.documentId as string) ?? entityId;
    const invoiceId = payload.invoiceId as string | undefined;

    const doc = await this.prisma.generatedDocument.findFirst({
      where: { id: documentId, organizationId: orgId },
    });
    if (!doc) throw Object.assign(new Error('Document not found'), { code: 'NOT_FOUND' });

    const resolvedInvoiceId =
      invoiceId ??
      (doc.bookingId
        ? (
            await this.prisma.orgInvoice.findFirst({
              where: {
                organizationId: orgId,
                bookingId: doc.bookingId,
                type: 'OUTGOING_BOOKING',
                status: { notIn: ['VOID', 'CANCELLED', 'CREDITED'] },
              },
              orderBy: { createdAt: 'asc' },
            })
          )?.id
        : null);

    if (!resolvedInvoiceId) {
      throw Object.assign(new Error('Invoice not found for link'), { code: 'NOT_FOUND' });
    }

    await this.prisma.$transaction([
      this.prisma.generatedDocument.update({
        where: { id: doc.id },
        data: { invoiceId: resolvedInvoiceId },
      }),
      this.prisma.orgInvoice.update({
        where: { id: resolvedInvoiceId },
        data: { generatedDocumentId: doc.id },
      }),
    ]);
  }

  private async executeProviderStatusSync(orgId: string, outboundEmailId: string) {
    const email = await this.prisma.outboundEmail.findFirst({
      where: { id: outboundEmailId, organizationId: orgId },
    });
    if (!email) throw Object.assign(new Error('Outbound email not found'), { code: 'NOT_FOUND' });

    if (email.status === OutboundEmailStatus.SENDING) {
      await this.prisma.outboundEmail.update({
        where: { id: email.id },
        data: {
          status: OutboundEmailStatus.FAILED,
          errorCode: 'SEND_TIMEOUT',
          errorMessage: 'Versand-Timeout — erneuter Versand erforderlich',
        },
      });
    }
  }

  private async executePaymentSync(orgId: string, invoiceId: string) {
    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      include: { payments: true },
    });
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { code: 'NOT_FOUND' });

    const paidSum = invoice.payments.reduce((sum, p) => sum + p.amountCents, 0);
    const outstanding = Math.max(0, invoice.totalCents - paidSum);

    let status = invoice.status;
    if (paidSum <= 0) {
      status = invoice.status;
    } else if (outstanding === 0) {
      status = 'PAID';
    } else if (paidSum < invoice.totalCents) {
      status = 'PARTIALLY_PAID';
    }

    await this.prisma.orgInvoice.update({
      where: { id: invoice.id },
      data: {
        paidCents: paidSum,
        outstandingCents: outstanding,
        status,
        paidAt: outstanding === 0 ? invoice.paidAt ?? new Date() : null,
      },
    });
  }

  private async executeLinkedTaskUpdate(orgId: string, invoiceId: string) {
    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { code: 'NOT_FOUND' });

    const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
    if (invoice.status === 'PAID' || outstanding === 0) {
      await this.prisma.orgTask.updateMany({
        where: { invoiceId, organizationId: orgId, status: { not: 'DONE' } },
        data: { status: 'DONE', completedAt: new Date() },
      });
    }
  }
}
