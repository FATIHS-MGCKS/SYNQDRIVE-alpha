import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Booking, Prisma, PricingQuote } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { BookingPricingInputDto } from './dto';
import {
  PRICING_ENGINE_VERSION,
  PRICING_QUOTE_ATOMIC_ERROR_CODES,
} from './pricing-engine.constants';
import { PricingQuoteService, type ConsumePricingQuoteInput } from './pricing-quote.service';
import { PricingService, type BookingPriceSimulation } from './pricing.service';

export interface AtomicQuoteCreateInput {
  organizationId: string;
  userId?: string | null;
  quoteId: string;
  vehicleId: string;
  pickupAt: Date;
  returnAt: Date;
  pricingInput?: BookingPricingInputDto;
  /** When set, enables idempotent replay if the quote was already consumed for this booking. */
  bookingId?: string;
  createBooking: (
    tx: Prisma.TransactionClient,
    pricedFields: ReturnType<PricingService['legacyBookingFieldsFromSimulation']>,
  ) => Promise<Booking>;
}

export interface AtomicQuoteRepriceInput {
  organizationId: string;
  userId?: string | null;
  bookingId: string;
  quoteId: string;
  vehicleId: string;
  pickupAt: Date;
  returnAt: Date;
  pricingInput?: BookingPricingInputDto;
  bookingUpdate: Prisma.BookingUpdateManyMutationInput;
  expectedUpdatedAt?: Date;
  releasePreviousQuote?: boolean;
}

export interface AtomicQuoteResult {
  booking: Booking;
  snapshotId: string;
  snapshotRevision: number;
  simulation: BookingPriceSimulation;
  idempotentReplay: boolean;
}

@Injectable()
export class PricingQuoteApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingQuoteService: PricingQuoteService,
    private readonly pricingService: PricingService,
  ) {}

  async createBookingWithQuote(input: AtomicQuoteCreateInput): Promise<AtomicQuoteResult> {
    const existingBookingId = await this.pricingQuoteService.findConsumedBookingId(
      input.organizationId,
      input.quoteId,
    );
    if (existingBookingId) {
      if (input.bookingId && existingBookingId === input.bookingId) {
        return this.loadIdempotentResult(input.organizationId, existingBookingId);
      }
      throw new ConflictException({
        message: 'Diese Preisquote wurde bereits für eine Buchung verwendet',
        code: 'PRICING_QUOTE_ALREADY_CONSUMED',
        quoteId: input.quoteId,
        bookingId: existingBookingId,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.pricingQuoteService.lockAndPrepareQuote(
        tx,
        input as ConsumePricingQuoteInput,
      );
      if (locked.idempotentBookingId) {
        const booking = await tx.booking.findFirstOrThrow({
          where: { id: locked.idempotentBookingId, organizationId: input.organizationId },
        });
        const snapshot = await this.pricingService.findCurrentBookingPriceSnapshot(
          input.organizationId,
          booking.id,
          tx,
        );
        return {
          booking,
          snapshotId: snapshot?.id ?? '',
          snapshotRevision: snapshot?.revision ?? 1,
          simulation: locked.simulation,
          idempotentReplay: true,
        };
      }

      const pricedFields = this.pricingService.legacyBookingFieldsFromSimulation(
        locked.simulation,
      );
      const booking = await input.createBooking(tx, pricedFields);

      const { snapshot } = await this.pricingService.appendBookingPriceSnapshotRevision({
        organizationId: input.organizationId,
        bookingId: booking.id,
        quoteId: input.quoteId,
        simulation: locked.simulation,
        pricingInput: locked.pricingInput,
        calculatedAt: locked.quote.calculatedAt,
        tx,
      });

      await this.pricingQuoteService.markConsumed(
        tx,
        input.quoteId,
        input.organizationId,
        booking.id,
      );

      return {
        booking,
        snapshotId: snapshot.id,
        snapshotRevision: snapshot.revision,
        simulation: locked.simulation,
        idempotentReplay: false,
      };
    });
  }

  async repriceBookingWithQuote(input: AtomicQuoteRepriceInput): Promise<AtomicQuoteResult> {
    const existingBookingId = await this.pricingQuoteService.findConsumedBookingId(
      input.organizationId,
      input.quoteId,
    );
    if (existingBookingId && existingBookingId === input.bookingId) {
      return this.loadIdempotentResult(input.organizationId, input.bookingId);
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await this.pricingQuoteService.lockAndPrepareQuote(
        tx,
        {
          organizationId: input.organizationId,
          userId: input.userId ?? null,
          quoteId: input.quoteId,
          vehicleId: input.vehicleId,
          pickupAt: input.pickupAt,
          returnAt: input.returnAt,
          pricingInput: input.pricingInput,
        },
        { allowConsumedForBookingId: input.bookingId },
      );

      if (locked.idempotentBookingId) {
        const booking = await tx.booking.findFirstOrThrow({
          where: { id: locked.idempotentBookingId, organizationId: input.organizationId },
        });
        const snapshot = await this.pricingService.findCurrentBookingPriceSnapshot(
          input.organizationId,
          booking.id,
          tx,
        );
        return {
          booking,
          snapshotId: snapshot?.id ?? '',
          snapshotRevision: snapshot?.revision ?? 1,
          simulation: locked.simulation,
          idempotentReplay: true,
        };
      }

      if (input.releasePreviousQuote) {
        await this.pricingQuoteService.releaseQuoteFromWizardDraft(
          tx,
          input.organizationId,
          input.bookingId,
        );
      }

      const pricedFields = this.pricingService.legacyBookingFieldsFromSimulation(
        locked.simulation,
      );
      const updateData = {
        ...input.bookingUpdate,
        ...pricedFields,
      } as Prisma.BookingUpdateManyMutationInput;

      let booking: Booking;
      if (input.expectedUpdatedAt) {
        booking = await tx.booking.updateMany({
          where: {
            id: input.bookingId,
            organizationId: input.organizationId,
            updatedAt: input.expectedUpdatedAt,
          },
          data: updateData,
        }).then(async (result) => {
          if (result.count !== 1) {
            throw new ConflictException({
              message: 'Booking was modified by another user. Reload and retry.',
              code: 'BOOKING_VERSION_CONFLICT',
            });
          }
          return tx.booking.findFirstOrThrow({
            where: { id: input.bookingId, organizationId: input.organizationId },
          });
        });
      } else {
        const result = await tx.booking.updateMany({
          where: { id: input.bookingId, organizationId: input.organizationId },
          data: updateData,
        });
        if (result.count !== 1) {
          throw new NotFoundException('Booking not found for organization');
        }
        booking = await tx.booking.findFirstOrThrow({
          where: { id: input.bookingId, organizationId: input.organizationId },
        });
      }

      const { snapshot } = await this.pricingService.appendBookingPriceSnapshotRevision({
        organizationId: input.organizationId,
        bookingId: booking.id,
        quoteId: input.quoteId,
        simulation: locked.simulation,
        pricingInput: locked.pricingInput,
        calculatedAt: locked.quote.calculatedAt,
        tx,
      });

      await this.pricingQuoteService.markConsumed(
        tx,
        input.quoteId,
        input.organizationId,
        booking.id,
      );

      return {
        booking,
        snapshotId: snapshot.id,
        snapshotRevision: snapshot.revision,
        simulation: locked.simulation,
        idempotentReplay: false,
      };
    });
  }

  private async loadIdempotentResult(
    organizationId: string,
    bookingId: string,
  ): Promise<AtomicQuoteResult> {
    const booking = await this.prisma.booking.findFirstOrThrow({
      where: { id: bookingId, organizationId },
    });
    const snapshot = await this.pricingService.findCurrentBookingPriceSnapshot(
      organizationId,
      bookingId,
    );
    if (!snapshot) {
      throw new ConflictException({
        message: 'Quote consumed but price snapshot missing',
        code: PRICING_QUOTE_ATOMIC_ERROR_CODES.SNAPSHOT_FAILED,
        bookingId,
      });
    }
    const simulation = {
      rentalDays: snapshot.rentalDays,
      lineItems: snapshot.lineItems.map((li) => ({
        type: li.type,
        label: li.label,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        totalNetCents: li.totalNetCents,
        taxRatePercent: li.taxRatePercent,
        totalGrossCents: li.totalGrossCents,
        metadataJson: li.metadataJson as Record<string, unknown> | null,
        sortOrder: li.sortOrder,
      })),
      subtotalNetCents: snapshot.subtotalNetCents,
      taxAmountCents: snapshot.taxAmountCents,
      totalGrossCents: snapshot.totalGrossCents,
      depositAmountCents: snapshot.depositAmountCents,
      includedKm: snapshot.includedKm,
      extraKmPriceCents: snapshot.extraKmPriceCents,
      totalDueNowCents: snapshot.totalDueNowCents ?? 0,
      warnings: [],
      tariffVersionId: snapshot.tariffVersionId ?? '',
      priceBookId: snapshot.priceBookId ?? '',
      tariffGroupId: snapshot.tariffGroupId ?? '',
      currency: snapshot.currency,
      effectiveDailyRateCents: Math.round(snapshot.totalGrossCents / Math.max(1, snapshot.rentalDays)),
      pricingContext: snapshot.metadataJson as never,
    } as unknown as BookingPriceSimulation;
    return {
      booking,
      snapshotId: snapshot.id,
      snapshotRevision: snapshot.revision,
      simulation,
      idempotentReplay: true,
    };
  }
}
