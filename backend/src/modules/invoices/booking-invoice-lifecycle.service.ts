import { Injectable, Logger } from '@nestjs/common';
import { InvoicePaymentMethod, OrgInvoice, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoicesService } from './invoices.service';

export type BookingCheckoutPaymentMethod = 'card' | 'cash' | 'invoice';

export interface SyncBookingInvoiceOptions {
  paymentMethod?: BookingCheckoutPaymentMethod;
  userId?: string | null;
  /** When true, mark rental invoice paid after issue (checkout prepaid). */
  markPaid?: boolean;
}

@Injectable()
export class BookingInvoiceLifecycleService {
  private readonly logger = new Logger(BookingInvoiceLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  /**
   * After booking confirmation: void duplicate drafts, issue canonical invoice,
   * record payment when checkout was prepaid (card).
   */
  async syncOnBookingConfirmed(
    orgId: string,
    bookingId: string,
    options?: SyncBookingInvoiceOptions,
  ) {
    const canonical = await this.resolveCanonicalBookingInvoice(orgId, bookingId);
    if (!canonical) return null;

    await this.voidDuplicateBookingInvoices(orgId, bookingId, canonical.id);

    let invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: canonical.id, organizationId: orgId },
    });
    if (!invoice) return null;

    if (invoice.status === 'DRAFT') {
      invoice = (await this.invoicesService.issue(invoice.id, orgId)) as unknown as OrgInvoice;
      invoice = await this.prisma.orgInvoice.findFirstOrThrow({
        where: { id: invoice.id, organizationId: orgId },
      });
    }

    const shouldMarkPaid =
      options?.markPaid === true || options?.paymentMethod === 'card';

    if (!shouldMarkPaid) return invoice;

    const outstanding = Math.max(0, invoice.totalCents - invoice.paidCents);
    if (outstanding <= 0 || invoice.status === 'PAID') return invoice;

    const method =
      options?.paymentMethod === 'card'
        ? InvoicePaymentMethod.CARD
        : InvoicePaymentMethod.BANK_TRANSFER;

    return this.invoicesService.recordPayment(
      invoice.id,
      orgId,
      {
        amountCents: outstanding,
        paymentMethod: method,
        currency: invoice.currency,
        note: 'Buchungsbestätigung — Vorauszahlung',
      },
      options?.userId ?? undefined,
    );
  }

  /** Pick the invoice to keep: document link → newest non-void. */
  async resolveCanonicalBookingInvoice(
    orgId: string,
    bookingId: string,
  ): Promise<OrgInvoice | null> {
    const invoices = await this.prisma.orgInvoice.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        type: 'OUTGOING_BOOKING',
        status: { notIn: ['VOID', 'CANCELLED', 'CREDITED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (invoices.length === 0) return null;
    if (invoices.length === 1) return invoices[0];

    const linkedDoc = await this.prisma.generatedDocument.findFirst({
      where: {
        organizationId: orgId,
        bookingId,
        invoiceId: { in: invoices.map((inv) => inv.id) },
        status: { not: 'VOID' },
      },
      select: { invoiceId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (linkedDoc?.invoiceId) {
      const linked = invoices.find((inv) => inv.id === linkedDoc.invoiceId);
      if (linked) return linked;
    }

    const paid = invoices.find((inv) => inv.status === 'PAID' || inv.paidCents > 0);
    if (paid) return paid;

    return invoices[0];
  }

  async voidDuplicateBookingInvoices(
    orgId: string,
    bookingId: string,
    keepInvoiceId: string,
  ): Promise<number> {
    const duplicates = await this.prisma.orgInvoice.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        type: 'OUTGOING_BOOKING',
        id: { not: keepInvoiceId },
        status: { notIn: ['VOID', 'CANCELLED', 'CREDITED'] },
      },
      select: { id: true },
    });

    if (duplicates.length === 0) return 0;

    await this.prisma.orgInvoice.updateMany({
      where: { id: { in: duplicates.map((d) => d.id) } },
      data: {
        status: 'VOID',
        voidedAt: new Date(),
        outstandingCents: 0,
      },
    });

    this.logger.log(
      `Voided ${duplicates.length} duplicate OUTGOING_BOOKING invoice(s) for booking ${bookingId}`,
    );
    return duplicates.length;
  }

  /** Repair existing data: void duplicates, issue drafts, mark paid for confirmed rentals. */
  async repairBookingInvoicesForOrg(
    orgId: string,
    options?: { dryRun?: boolean; markConfirmedPaid?: boolean },
  ) {
    const dryRun = options?.dryRun !== false;
    const markConfirmedPaid = options?.markConfirmedPaid !== false;

    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED'] },
      },
      select: {
        id: true,
        status: true,
        handoverProtocols: { where: { kind: 'PICKUP' }, select: { id: true }, take: 1 },
      },
    });

    const report: Array<{
      bookingId: string;
      status: string;
      voided: number;
      issued: boolean;
      paid: boolean;
    }> = [];

    for (const booking of bookings) {
      const canonical = await this.resolveCanonicalBookingInvoice(orgId, booking.id);
      if (!canonical) continue;

      const duplicateCount = await this.prisma.orgInvoice.count({
        where: {
          organizationId: orgId,
          bookingId: booking.id,
          type: 'OUTGOING_BOOKING',
          id: { not: canonical.id },
          status: { notIn: ['VOID', 'CANCELLED', 'CREDITED'] },
        },
      });

      const shouldPay =
        markConfirmedPaid &&
        (booking.status === 'ACTIVE' ||
          booking.status === 'COMPLETED' ||
          booking.status === 'CONFIRMED' ||
          booking.handoverProtocols.length > 0);

      if (dryRun) {
        report.push({
          bookingId: booking.id,
          status: booking.status,
          voided: duplicateCount,
          issued: canonical.status === 'DRAFT',
          paid: shouldPay && canonical.status !== 'PAID',
        });
        continue;
      }

      await this.voidDuplicateBookingInvoices(orgId, booking.id, canonical.id);

      const synced = await this.syncOnBookingConfirmed(orgId, booking.id, {
        markPaid: shouldPay,
        paymentMethod: shouldPay ? 'card' : undefined,
      });

      report.push({
        bookingId: booking.id,
        status: booking.status,
        voided: duplicateCount,
        issued: canonical.status === 'DRAFT',
        paid: synced?.status === 'PAID',
      });
    }

    return {
      orgId,
      dryRun,
      bookingsProcessed: report.length,
      report,
    };
  }
}
