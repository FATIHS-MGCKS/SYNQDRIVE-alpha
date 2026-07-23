import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingFinancialState,
  BookingInvoiceProcessingState,
  BookingPaymentRequestStatus,
  OrgInvoice,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BookingInvoiceLifecycleService,
  type SyncBookingInvoiceOptions,
} from '@modules/invoices/booking-invoice-lifecycle.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import {
  deriveBookingFinancialState,
  deriveInvoiceProcessingState,
  bookingRequiresIssuedInvoice,
} from './booking-financial-state.derive';
import {
  BOOKING_FINANCIAL_ERROR_CODES,
  type BookingFinancialReadModel,
} from './booking-financial-state.types';

const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000] as const;

export interface EnsureBookingInvoiceInput extends SyncBookingInvoiceOptions {
  isRetry?: boolean;
}

@Injectable()
export class BookingFinancialStateService {
  private readonly logger = new Logger(BookingFinancialStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingInvoiceLifecycle: BookingInvoiceLifecycleService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async ensureBookingInvoiceOnConfirm(
    orgId: string,
    bookingId: string,
    options?: EnsureBookingInvoiceInput,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (!bookingRequiresIssuedInvoice(booking.status)) {
      await this.markInvoiceProcessing(orgId, bookingId, {
        state: BookingInvoiceProcessingState.NOT_REQUIRED,
        error: null,
      });
      await this.syncPersistedFinancialState(orgId, bookingId);
      return null;
    }

    if ((booking.totalPriceCents ?? 0) <= 0) {
      await this.markInvoiceProcessing(orgId, bookingId, {
        state: BookingInvoiceProcessingState.NOT_REQUIRED,
        error: null,
      });
      await this.syncPersistedFinancialState(orgId, bookingId);
      return null;
    }

    await this.markInvoiceProcessing(orgId, bookingId, {
      state: BookingInvoiceProcessingState.PROCESSING,
      error: null,
      incrementAttempt: true,
    });

    try {
      await this.invoicesService.bootstrapBookingInvoice(orgId, {
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

      const issued = (await this.bookingInvoiceLifecycle.syncOnBookingConfirmed(
        orgId,
        bookingId,
        options,
      )) as OrgInvoice | null;
      if (!issued) {
        throw new ConflictException({
          message: 'Pflichtrechnung für bestätigte Buchung fehlt',
          code: BOOKING_FINANCIAL_ERROR_CODES.INVOICE_REQUIRED,
          bookingId,
        });
      }

      const invoiceId = issued.id;
      await this.assertInvoiceBindings(orgId, bookingId, invoiceId);

      await this.prisma.booking.updateMany({
        where: { id: bookingId, organizationId: orgId },
        data: {
          canonicalInvoiceId: invoiceId,
          invoiceProcessingState: BookingInvoiceProcessingState.READY,
          invoiceProcessingError: null,
          invoiceProcessingNextRetryAt: null,
        },
      });

      await this.syncPersistedFinancialState(orgId, bookingId);
      return issued;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = booking.invoiceProcessingAttemptCount + 1;
      const backoff = RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)];
      const nextRetryAt = new Date(Date.now() + backoff);

      await this.markInvoiceProcessing(orgId, bookingId, {
        state: BookingInvoiceProcessingState.FAILED,
        error: message,
        nextRetryAt,
      });
      await this.syncPersistedFinancialState(orgId, bookingId);

      this.logger.error(
        `Invoice processing failed for booking ${bookingId} (org ${orgId}, attempt ${attempt})`,
        error instanceof Error ? error.stack : message,
      );

      throw error instanceof ConflictException
        ? error
        : new ConflictException({
            message: 'Rechnungsverarbeitung für Buchung fehlgeschlagen',
            code: BOOKING_FINANCIAL_ERROR_CODES.INVOICE_PROCESSING_FAILED,
            bookingId,
            attempt,
            nextRetryAt: nextRetryAt.toISOString(),
            cause: message,
          });
    }
  }

  async retryInvoiceProcessing(orgId: string, bookingId: string, options?: SyncBookingInvoiceOptions) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { invoiceProcessingState: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.invoiceProcessingState !== BookingInvoiceProcessingState.FAILED) {
      throw new ConflictException({
        message: 'Rechnungsverarbeitung kann nur im Status FAILED erneut gestartet werden',
        code: 'BOOKING_INVOICE_RETRY_NOT_ALLOWED',
        bookingId,
        invoiceProcessingState: booking.invoiceProcessingState,
      });
    }
    return this.ensureBookingInvoiceOnConfirm(orgId, bookingId, {
      ...options,
      isRetry: true,
    });
  }

  async syncPersistedFinancialState(orgId: string, bookingId: string): Promise<BookingFinancialState> {
    const context = await this.loadDerivationContext(orgId, bookingId);
    const financialState = deriveBookingFinancialState(context);
    const invoiceProcessingState = deriveInvoiceProcessingState({
      bookingStatus: context.bookingStatus,
      totalPriceCents: context.totalPriceCents,
      persistedState: context.invoiceProcessingState,
      canonicalInvoice: context.canonicalInvoice,
    });

    await this.prisma.booking.updateMany({
      where: { id: bookingId, organizationId: orgId },
      data: {
        financialState,
        invoiceProcessingState,
      },
    });

    return financialState;
  }

  async buildReadModel(orgId: string, bookingId: string): Promise<BookingFinancialReadModel> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: {
        status: true,
        totalPriceCents: true,
        paymentStatus: true,
        financialState: true,
        invoiceProcessingState: true,
        invoiceProcessingError: true,
        invoiceProcessingAttemptCount: true,
        invoiceProcessingNextRetryAt: true,
        canonicalInvoiceId: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const snapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: { organizationId: orgId, bookingId },
      select: { id: true },
    });

    const canonicalInvoice = booking.canonicalInvoiceId
      ? await this.prisma.orgInvoice.findFirst({
          where: { id: booking.canonicalInvoiceId, organizationId: orgId },
          select: {
            id: true,
            status: true,
            totalCents: true,
            paidCents: true,
            outstandingCents: true,
            bookingPriceSnapshotId: true,
            customerId: true,
            currency: true,
          },
        })
      : await this.bookingInvoiceLifecycle.resolveCanonicalBookingInvoice(orgId, bookingId);

    const paymentRequests = await this.prisma.bookingPaymentRequest.findMany({
      where: { organizationId: orgId, bookingId },
      select: { status: true },
    });

    const financialState = deriveBookingFinancialState({
      bookingStatus: booking.status,
      totalPriceCents: booking.totalPriceCents,
      bookingPaymentStatus: booking.paymentStatus,
      invoiceProcessingState: booking.invoiceProcessingState,
      invoiceProcessingError: booking.invoiceProcessingError,
      canonicalInvoice: canonicalInvoice
        ? {
            id: canonicalInvoice.id,
            status: canonicalInvoice.status,
            totalCents: canonicalInvoice.totalCents,
            paidCents: canonicalInvoice.paidCents,
            outstandingCents: canonicalInvoice.outstandingCents,
            bookingPriceSnapshotId: canonicalInvoice.bookingPriceSnapshotId,
            customerId: canonicalInvoice.customerId,
            currency: canonicalInvoice.currency,
          }
        : null,
      paymentRequestStatuses: paymentRequests.map((r) => r.status),
      currentSnapshotId: snapshot?.id ?? null,
    });

    const invoiceProcessingState = deriveInvoiceProcessingState({
      bookingStatus: booking.status,
      totalPriceCents: booking.totalPriceCents,
      persistedState: booking.invoiceProcessingState,
      canonicalInvoice: canonicalInvoice
        ? {
            id: canonicalInvoice.id,
            status: canonicalInvoice.status,
            totalCents: canonicalInvoice.totalCents,
            paidCents: canonicalInvoice.paidCents,
            outstandingCents: canonicalInvoice.outstandingCents,
            bookingPriceSnapshotId: canonicalInvoice.bookingPriceSnapshotId,
            customerId: canonicalInvoice.customerId,
            currency: canonicalInvoice.currency,
          }
        : null,
    });

    return {
      financialState,
      invoiceProcessingState,
      invoiceProcessingError: booking.invoiceProcessingError,
      invoiceProcessingAttemptCount: booking.invoiceProcessingAttemptCount,
      invoiceProcessingNextRetryAt: booking.invoiceProcessingNextRetryAt?.toISOString() ?? null,
      canonicalInvoiceId: canonicalInvoice?.id ?? booking.canonicalInvoiceId,
      priceSnapshotId: snapshot?.id ?? canonicalInvoice?.bookingPriceSnapshotId ?? null,
      priceSnapshotRevision: 1,
      invoiceRequired: bookingRequiresIssuedInvoice(booking.status),
      invoiceReady:
        invoiceProcessingState === BookingInvoiceProcessingState.READY &&
        canonicalInvoice != null &&
        canonicalInvoice.status !== 'DRAFT',
      recoveryAvailable: booking.invoiceProcessingState === BookingInvoiceProcessingState.FAILED,
    };
  }

  private async loadDerivationContext(orgId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: {
        status: true,
        totalPriceCents: true,
        paymentStatus: true,
        invoiceProcessingState: true,
        invoiceProcessingError: true,
        canonicalInvoiceId: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const [canonicalInvoice, paymentRequests, snapshot] = await Promise.all([
      booking.canonicalInvoiceId
        ? this.prisma.orgInvoice.findFirst({
            where: { id: booking.canonicalInvoiceId, organizationId: orgId },
            select: {
              id: true,
              status: true,
              totalCents: true,
              paidCents: true,
              outstandingCents: true,
              bookingPriceSnapshotId: true,
              customerId: true,
              currency: true,
            },
          })
        : this.bookingInvoiceLifecycle.resolveCanonicalBookingInvoice(orgId, bookingId),
      this.prisma.bookingPaymentRequest.findMany({
        where: { organizationId: orgId, bookingId },
        select: { status: true },
      }),
      this.prisma.bookingPriceSnapshot.findFirst({
        where: { organizationId: orgId, bookingId },
        select: { id: true },
      }),
    ]);

    return {
      bookingStatus: booking.status,
      totalPriceCents: booking.totalPriceCents,
      bookingPaymentStatus: booking.paymentStatus,
      invoiceProcessingState: booking.invoiceProcessingState,
      invoiceProcessingError: booking.invoiceProcessingError,
      canonicalInvoice: canonicalInvoice
        ? {
            id: canonicalInvoice.id,
            status: canonicalInvoice.status,
            totalCents: canonicalInvoice.totalCents,
            paidCents: canonicalInvoice.paidCents,
            outstandingCents: canonicalInvoice.outstandingCents,
            bookingPriceSnapshotId: canonicalInvoice.bookingPriceSnapshotId,
            customerId: canonicalInvoice.customerId,
            currency: canonicalInvoice.currency,
          }
        : null,
      paymentRequestStatuses: paymentRequests.map((r) => r.status as BookingPaymentRequestStatus),
      currentSnapshotId: snapshot?.id ?? null,
    };
  }

  private async assertInvoiceBindings(orgId: string, bookingId: string, invoiceId: string) {
    const [booking, invoice, snapshot] = await Promise.all([
      this.prisma.booking.findFirst({
        where: { id: bookingId, organizationId: orgId },
        select: { customerId: true, currency: true },
      }),
      this.prisma.orgInvoice.findFirst({
        where: { id: invoiceId, organizationId: orgId },
        select: {
          bookingId: true,
          customerId: true,
          currency: true,
          bookingPriceSnapshotId: true,
        },
      }),
      this.prisma.bookingPriceSnapshot.findFirst({
        where: { organizationId: orgId, bookingId },
        select: { id: true, currency: true },
      }),
    ]);

    if (!booking || !invoice) {
      throw new NotFoundException('Booking or invoice not found for binding validation');
    }

    if (invoice.bookingId !== bookingId) {
      throw new ConflictException({
        message: 'Rechnung verweist auf falsche Buchung',
        code: BOOKING_FINANCIAL_ERROR_CODES.INVOICE_SNAPSHOT_MISMATCH,
        bookingId,
        invoiceId,
      });
    }

    if (invoice.customerId && invoice.customerId !== booking.customerId) {
      throw new ConflictException({
        message: 'Rechnung verweist auf falschen Kunden',
        code: BOOKING_FINANCIAL_ERROR_CODES.INVOICE_SNAPSHOT_MISMATCH,
        bookingId,
        invoiceId,
      });
    }

    if (snapshot) {
      if (invoice.bookingPriceSnapshotId && invoice.bookingPriceSnapshotId !== snapshot.id) {
        throw new ConflictException({
          message: 'Rechnung verweist auf veraltete Preis-Snapshot-Revision',
          code: BOOKING_FINANCIAL_ERROR_CODES.INVOICE_SNAPSHOT_MISMATCH,
          bookingId,
          invoiceId,
          expectedSnapshotId: snapshot.id,
          actualSnapshotId: invoice.bookingPriceSnapshotId,
        });
      }
      const invoiceCurrency = invoice.currency?.toUpperCase();
      const snapshotCurrency = snapshot.currency?.toUpperCase();
      if (invoiceCurrency && snapshotCurrency && invoiceCurrency !== snapshotCurrency) {
        throw new ConflictException({
          message: 'Rechnungswährung stimmt nicht mit Preis-Snapshot überein',
          code: BOOKING_FINANCIAL_ERROR_CODES.INVOICE_SNAPSHOT_MISMATCH,
          bookingId,
          invoiceId,
        });
      }
    }
  }

  private async markInvoiceProcessing(
    orgId: string,
    bookingId: string,
    input: {
      state: BookingInvoiceProcessingState;
      error: string | null;
      incrementAttempt?: boolean;
      nextRetryAt?: Date | null;
    },
  ) {
    const data: Prisma.BookingUpdateManyMutationInput = {
      invoiceProcessingState: input.state,
      invoiceProcessingError: input.error,
      invoiceProcessingNextRetryAt: input.nextRetryAt ?? null,
    };
    if (input.incrementAttempt) {
      await this.prisma.booking.updateMany({
        where: { id: bookingId, organizationId: orgId },
        data: {
          ...data,
          invoiceProcessingAttemptCount: { increment: 1 },
        },
      });
      return;
    }
    await this.prisma.booking.updateMany({
      where: { id: bookingId, organizationId: orgId },
      data,
    });
  }
}
