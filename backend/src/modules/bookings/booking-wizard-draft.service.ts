import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Booking, BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { BookingInvoiceLifecycleService } from '@modules/invoices/booking-invoice-lifecycle.service';
import { BookingDocumentEmailService } from '@modules/outbound-email/booking-document-email.service';
import { PricingService } from '@modules/pricing/pricing.service';
import {
  PricingQuoteService,
  requireQuoteId,
} from '@modules/pricing/pricing-quote.service';
import { assertValidBookingWindow } from './booking-conflict.util';
import {
  isWizardDraftBooking,
  mergeWizardDraftNotes,
  stripWizardDraftMarker,
} from './booking-wizard-draft.util';
import type {
  BookingWizardDraftBodyDto,
  BookingWizardDraftConfirmDto,
  BookingWizardDraftUpdateDto,
} from './dto/booking-wizard-draft.dto';
import { BookingsService } from './bookings.service';

@Injectable()
export class BookingWizardDraftService {
  private readonly logger = new Logger(BookingWizardDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly pricingService: PricingService,
    private readonly pricingQuoteService: PricingQuoteService,
    private readonly bundleService: BookingDocumentBundleService,
    private readonly generatedDocuments: GeneratedDocumentsService,
    private readonly invoicesService: InvoicesService,
    private readonly bookingInvoiceLifecycle: BookingInvoiceLifecycleService,
    private readonly bookingDocumentEmailService: BookingDocumentEmailService,
  ) {}

  async createOrRefreshDraft(
    orgId: string,
    body: BookingWizardDraftBodyDto,
    options?: { userId?: string | null },
  ) {
    if (body.existingBookingId) {
      return this.updateDraftQuote(
        orgId,
        body.existingBookingId,
        { quoteId: body.quoteId, pricingInput: body.pricingInput },
        options,
      );
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid booking dates');
    }
    try {
      assertValidBookingWindow(startDate, endDate);
    } catch {
      throw new BadRequestException('endDate must be after startDate');
    }

    const quoteId = requireQuoteId(body.quoteId);
    const consumedBookingId = await this.pricingQuoteService.findConsumedBookingId(orgId, quoteId);
    if (consumedBookingId) {
      const consumed = await this.prisma.booking.findFirst({
        where: { id: consumedBookingId, organizationId: orgId },
      });
      if (consumed && isWizardDraftBooking(consumed)) {
        return this.refreshDraftBundle(orgId, consumed.id, options?.userId ?? null, consumed);
      }
      if (consumed) {
        const bundle = await this.bundleService.getBundleView(orgId, consumed.id);
        return { booking: consumed, bundle };
      }
    }

    const createPayload = {
      customer: { connect: { id: body.customerId } },
      vehicle: { connect: { id: body.vehicleId } },
      ...(body.pickupStationId ? { pickupStation: { connect: { id: body.pickupStationId } } } : {}),
      ...(body.returnStationId ? { returnStation: { connect: { id: body.returnStationId } } } : {}),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      quoteId,
      pricingInput: body.pricingInput,
      status: 'PENDING' as BookingStatus,
      notes: mergeWizardDraftNotes(body.notes),
    };

    const booking = await this.bookingsService.create(orgId, createPayload as never, {
      userId: options?.userId ?? null,
    });

    if (!isWizardDraftBooking(booking)) {
      throw new ConflictException('Wizard draft could not be created');
    }

    return this.refreshDraftBundle(orgId, booking.id, options?.userId ?? null, booking);
  }

  async updateDraftQuote(
    orgId: string,
    bookingId: string,
    body: BookingWizardDraftUpdateDto,
    options?: { userId?: string | null },
  ) {
    const booking = await this.requireWizardDraft(orgId, bookingId);
    const quoteId = requireQuoteId(body.quoteId);
    const pricingInput = body.pricingInput ?? {};

    const currentQuote = await this.prisma.pricingQuote.findFirst({
      where: { organizationId: orgId, consumedByBookingId: bookingId },
    });
    if (currentQuote?.id === quoteId) {
      return this.refreshDraftBundle(orgId, bookingId, options?.userId ?? null, booking);
    }

    const { simulation, pricingInput: quotedPricingInput } =
      await this.pricingQuoteService.consumeForBooking({
        organizationId: orgId,
        userId: options?.userId ?? null,
        quoteId,
        vehicleId: booking.vehicleId,
        pickupAt: booking.startDate,
        returnAt: booking.endDate,
        pricingInput,
      });

    const pricedFields = this.pricingService.legacyBookingFieldsFromSimulation(simulation);

    await this.prisma.$transaction(async (tx) => {
      if (currentQuote) {
        await this.pricingQuoteService.releaseQuoteFromWizardDraft(tx, orgId, bookingId);
      }
      await tx.booking.update({
        where: { id: bookingId },
        data: pricedFields as never,
      });
      await this.pricingQuoteService.markConsumed(tx, quoteId, orgId, bookingId);
      await this.pricingService.createBookingPriceSnapshotFromSimulation(
        orgId,
        bookingId,
        simulation,
        quotedPricingInput,
        tx,
      );
    });

    await this.regeneratePricingDocuments(orgId, bookingId, options?.userId ?? null);
    return this.refreshDraftBundle(orgId, bookingId, options?.userId ?? null);
  }

  async confirmDraft(
    orgId: string,
    bookingId: string,
    body: BookingWizardDraftConfirmDto,
    options?: { userId?: string | null },
  ) {
    const draft = await this.requireWizardDraft(orgId, bookingId);
    const targetStatus: BookingStatus = body.status === 'PENDING' ? 'PENDING' : 'CONFIRMED';
    const booking = await this.bookingsService.update(orgId, bookingId, {
      status: targetStatus,
      notes: stripWizardDraftMarker(draft.notes) || null,
    });

    await this.bookingInvoiceLifecycle
      .syncOnBookingConfirmed(orgId, bookingId, {
        paymentMethod: body.paymentMethod,
        userId: options?.userId ?? null,
      })
      .catch((err) => {
        // Non-blocking — booking is confirmed; finance sync can be repaired via ops script.
        console.error('[BookingWizardDraft] invoice sync failed', err);
      });

    const bundle = await this.bundleService.getBundleView(orgId, bookingId);
    const autoSend = await this.bookingDocumentEmailService.maybeAutoSendBookingDocuments(
      orgId,
      bookingId,
      options?.userId ?? null,
    );
    return { booking, bundle, autoSend };
  }

  async abortDraft(orgId: string, bookingId: string) {
    await this.requireWizardDraft(orgId, bookingId);
    await this.generatedDocuments.voidAllForBooking(orgId, bookingId);
    await this.prisma.$transaction(async (tx) => {
      await this.pricingQuoteService.releaseQuoteFromWizardDraft(tx, orgId, bookingId);
    });
    const booking = await this.bookingsService.cancel(orgId, bookingId);
    return { booking, aborted: true };
  }

  private async requireWizardDraft(orgId: string, bookingId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (!isWizardDraftBooking(booking)) {
      throw new BadRequestException({
        message: 'Diese Buchung ist kein Checkout-Entwurf',
        code: 'BOOKING_NOT_WIZARD_DRAFT',
        bookingId,
      });
    }
    return booking;
  }

  private async refreshDraftBundle(
    orgId: string,
    bookingId: string,
    userId: string | null,
    booking?: Booking,
  ) {
    const row =
      booking ??
      (await this.prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: orgId },
      }));

    await this.invoicesService.createBookingInvoice(orgId, {
      id: row.id,
      customerId: row.customerId,
      vehicleId: row.vehicleId,
      totalPriceCents: row.totalPriceCents,
      dailyRateCents: row.dailyRateCents,
      startDate: row.startDate,
      endDate: row.endDate,
      currency: row.currency,
      kmIncluded: row.kmIncluded,
    });

    const bundle = await this.bundleService.generateInitialBundle(orgId, bookingId, userId);
    return { booking: row, bundle };
  }

  private async regeneratePricingDocuments(orgId: string, bookingId: string, userId: string | null) {
    for (const type of ['BOOKING_INVOICE', 'RENTAL_CONTRACT', 'DEPOSIT_RECEIPT'] as const) {
      try {
        await this.bundleService.regenerate(orgId, bookingId, type, userId);
      } catch (err) {
        this.logger.warn(
          `regeneratePricingDocuments(${bookingId}) failed for ${type}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
