import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PricingQuoteStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { BookingPricingInputDto } from './dto';
import type { BookingPriceSimulation } from './pricing.service';
import {
  buildQuoteIntegrityHash,
  canonicalPricingInput,
  instantsEqual,
  pricingInputsEqual,
} from './pricing-quote-integrity.util';
import {
  PRICING_QUOTE_STALE_MESSAGE,
  StoredPricingQuotePayload,
  totalsFromSimulation,
  type PricingQuoteTotals,
} from './pricing-quote.types';
import { PricingService } from './pricing.service';

const DEFAULT_QUOTE_TTL_SECONDS = 15 * 60;

export interface CreatePricingQuoteInput {
  organizationId: string;
  createdByUserId?: string | null;
  vehicleId: string;
  pickupAt: Date;
  returnAt: Date;
  pricingInput?: BookingPricingInputDto;
  simulation: BookingPriceSimulation;
}

export interface ConsumePricingQuoteInput {
  organizationId: string;
  userId?: string | null;
  quoteId: string;
  vehicleId: string;
  pickupAt: Date;
  returnAt: Date;
  pricingInput?: BookingPricingInputDto;
}

@Injectable()
export class PricingQuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  getQuoteTtlMs(): number {
    const raw = process.env.PRICING_QUOTE_TTL_SECONDS;
    const seconds = raw ? Number.parseInt(raw, 10) : DEFAULT_QUOTE_TTL_SECONDS;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return DEFAULT_QUOTE_TTL_SECONDS * 1000;
    }
    return seconds * 1000;
  }

  async createQuote(input: CreatePricingQuoteInput) {
    const calculatedAt = new Date();
    const expiresAt = new Date(calculatedAt.getTime() + this.getQuoteTtlMs());
    const pricingInput = input.pricingInput ?? {};
    const totals = totalsFromSimulation(input.simulation);
    const integrityHash = buildQuoteIntegrityHash({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      pickupAt: input.pickupAt.toISOString(),
      returnAt: input.returnAt.toISOString(),
      tariffVersionId: input.simulation.tariffVersionId,
      currency: input.simulation.currency,
      pricingInput: canonicalPricingInput(pricingInput),
      totals: {
        subtotalNetCents: totals.subtotalNetCents,
        taxAmountCents: totals.taxAmountCents,
        totalGrossCents: totals.totalGrossCents,
        depositAmountCents: totals.depositAmountCents,
      },
    });

    const quote = await this.prisma.pricingQuote.create({
      data: {
        organizationId: input.organizationId,
        createdByUserId: input.createdByUserId ?? null,
        vehicleId: input.vehicleId,
        pickupAt: input.pickupAt,
        returnAt: input.returnAt,
        tariffVersionId: input.simulation.tariffVersionId,
        currency: input.simulation.currency,
        status: PricingQuoteStatus.ACTIVE,
        calculatedAt,
        expiresAt,
        pricingContextJson: input.simulation.pricingContext as unknown as Prisma.InputJsonValue,
        pricingInputJson: pricingInput as unknown as Prisma.InputJsonValue,
        lineItemsJson: input.simulation.lineItems as unknown as Prisma.InputJsonValue,
        totalsJson: totals as unknown as Prisma.InputJsonValue,
        integrityHash,
      },
    });

    return {
      quoteId: quote.id,
      calculatedAt: quote.calculatedAt.toISOString(),
      expiresAt: quote.expiresAt.toISOString(),
      totals,
    };
  }

  async expireStaleQuotes(organizationId?: string): Promise<number> {
    const now = new Date();
    const result = await this.prisma.pricingQuote.updateMany({
      where: {
        status: PricingQuoteStatus.ACTIVE,
        expiresAt: { lt: now },
        ...(organizationId ? { organizationId } : {}),
      },
      data: { status: PricingQuoteStatus.EXPIRED },
    });
    return result.count;
  }

  async findConsumedBookingId(
    organizationId: string,
    quoteId: string,
  ): Promise<string | null> {
    const quote = await this.prisma.pricingQuote.findFirst({
      where: { id: quoteId, organizationId },
      select: { status: true, consumedByBookingId: true },
    });
    if (!quote || quote.status !== PricingQuoteStatus.CONSUMED) return null;
    return quote.consumedByBookingId;
  }

  async consumeForBooking(
    input: ConsumePricingQuoteInput,
  ): Promise<{ simulation: BookingPriceSimulation; pricingInput: BookingPricingInputDto }> {
    const existingBookingId = await this.findConsumedBookingId(
      input.organizationId,
      input.quoteId,
    );
    if (existingBookingId) {
      throw new ConflictException({
        message: 'Diese Preisquote wurde bereits für eine Buchung verwendet',
        code: 'PRICING_QUOTE_ALREADY_CONSUMED',
        quoteId: input.quoteId,
        bookingId: existingBookingId,
      });
    }

    const quote = await this.prisma.pricingQuote.findFirst({
      where: { id: input.quoteId, organizationId: input.organizationId },
    });
    if (!quote) {
      throw new NotFoundException({
        message: 'Preisquote nicht gefunden',
        code: 'PRICING_QUOTE_NOT_FOUND',
        quoteId: input.quoteId,
      });
    }

    if (quote.status === PricingQuoteStatus.CONSUMED) {
      throw new ConflictException({
        message: 'Diese Preisquote wurde bereits verwendet',
        code: 'PRICING_QUOTE_ALREADY_CONSUMED',
        quoteId: input.quoteId,
        bookingId: quote.consumedByBookingId,
      });
    }

    if (quote.status === PricingQuoteStatus.EXPIRED || quote.expiresAt <= new Date()) {
      if (quote.status === PricingQuoteStatus.ACTIVE) {
        await this.prisma.pricingQuote.update({
          where: { id: quote.id },
          data: { status: PricingQuoteStatus.EXPIRED },
        });
      }
      throw new ConflictException({
        message: PRICING_QUOTE_STALE_MESSAGE,
        code: 'PRICING_QUOTE_EXPIRED',
        quoteId: input.quoteId,
        expiresAt: quote.expiresAt.toISOString(),
      });
    }

    if (quote.createdByUserId && input.userId && quote.createdByUserId !== input.userId) {
      throw new ConflictException({
        message: 'Diese Preisquote gehört einem anderen Benutzer',
        code: 'PRICING_QUOTE_USER_MISMATCH',
        quoteId: input.quoteId,
      });
    }

    if (quote.vehicleId !== input.vehicleId) {
      throw new ConflictException({
        message: PRICING_QUOTE_STALE_MESSAGE,
        code: 'PRICING_QUOTE_VEHICLE_MISMATCH',
        quoteId: input.quoteId,
      });
    }

    if (!instantsEqual(quote.pickupAt, input.pickupAt) || !instantsEqual(quote.returnAt, input.returnAt)) {
      throw new ConflictException({
        message: PRICING_QUOTE_STALE_MESSAGE,
        code: 'PRICING_QUOTE_PERIOD_MISMATCH',
        quoteId: input.quoteId,
      });
    }

    const storedPricingInput = quote.pricingInputJson as BookingPricingInputDto;
    if (!pricingInputsEqual(storedPricingInput, input.pricingInput)) {
      throw new ConflictException({
        message: PRICING_QUOTE_STALE_MESSAGE,
        code: 'PRICING_QUOTE_OPTIONS_MISMATCH',
        quoteId: input.quoteId,
      });
    }

    await this.assertTariffStillMatchesQuote(input.organizationId, quote, input);

    const payload = this.decodeStoredQuote(quote);
    return {
      simulation: payload.simulation,
      pricingInput: storedPricingInput,
    };
  }

  async markConsumed(
    tx: Prisma.TransactionClient,
    quoteId: string,
    organizationId: string,
    bookingId: string,
  ): Promise<void> {
    const updated = await tx.pricingQuote.updateMany({
      where: {
        id: quoteId,
        organizationId,
        status: PricingQuoteStatus.ACTIVE,
      },
      data: {
        status: PricingQuoteStatus.CONSUMED,
        consumedAt: new Date(),
        consumedByBookingId: bookingId,
      },
    });
    if (updated.count !== 1) {
      const quote = await tx.pricingQuote.findFirst({
        where: { id: quoteId, organizationId },
      });
      if (quote?.status === PricingQuoteStatus.CONSUMED && quote.consumedByBookingId) {
        throw new ConflictException({
          message: 'Diese Preisquote wurde bereits für eine Buchung verwendet',
          code: 'PRICING_QUOTE_ALREADY_CONSUMED',
          quoteId,
          bookingId: quote.consumedByBookingId,
        });
      }
      throw new ConflictException({
        message: PRICING_QUOTE_STALE_MESSAGE,
        code: 'PRICING_QUOTE_STALE',
        quoteId,
      });
    }
  }

  decodeStoredQuote(quote: {
    pricingContextJson: Prisma.JsonValue;
    pricingInputJson: Prisma.JsonValue;
    lineItemsJson: Prisma.JsonValue;
    totalsJson: Prisma.JsonValue;
    tariffVersionId: string;
    currency: string;
    vehicleId: string;
    pickupAt: Date;
    tariffGroupId?: string;
    priceBookId?: string;
  }): StoredPricingQuotePayload {
    const pricingContext = quote.pricingContextJson as unknown as StoredPricingQuotePayload['pricingContext'];
    const pricingInput = quote.pricingInputJson as BookingPricingInputDto;
    const lineItems = quote.lineItemsJson as unknown as BookingPriceSimulation['lineItems'];
    const totals = quote.totalsJson as unknown as PricingQuoteTotals;

    const simulation: BookingPriceSimulation = {
      rentalDays: totals.rentalDays,
      lineItems,
      subtotalNetCents: totals.subtotalNetCents,
      taxAmountCents: totals.taxAmountCents,
      totalGrossCents: totals.totalGrossCents,
      depositAmountCents: totals.depositAmountCents,
      includedKm: totals.includedKm,
      extraKmPriceCents: totals.extraKmPriceCents,
      totalDueNowCents: totals.totalDueNowCents,
      warnings: [],
      tariffVersionId: quote.tariffVersionId,
      priceBookId: pricingContext.priceBookId,
      tariffGroupId: pricingContext.tariffGroupId,
      currency: quote.currency,
      effectiveDailyRateCents: totals.effectiveDailyRateCents,
      pricingContext,
    };

    return { pricingContext, pricingInput, lineItems, totals, simulation };
  }

  private async assertTariffStillMatchesQuote(
    orgId: string,
    quote: {
      vehicleId: string;
      pickupAt: Date;
      returnAt: Date;
      tariffVersionId: string;
      currency: string;
      totalsJson: Prisma.JsonValue;
    },
    input: ConsumePricingQuoteInput,
  ): Promise<void> {
    const currentContext = await this.pricingService.resolvePricingContext(
      orgId,
      input.vehicleId,
      input.pickupAt,
      input.returnAt,
    );
    const storedTotals = quote.totalsJson as unknown as PricingQuoteTotals;

    if (currentContext.tariffVersionId !== quote.tariffVersionId) {
      throw new ConflictException({
        message: PRICING_QUOTE_STALE_MESSAGE,
        code: 'PRICING_QUOTE_STALE',
        quoteId: input.quoteId,
        reason: 'TARIFF_VERSION_CHANGED',
        expectedTariffVersionId: quote.tariffVersionId,
        currentTariffVersionId: currentContext.tariffVersionId,
      });
    }

    if (currentContext.currency !== quote.currency) {
      throw new ConflictException({
        message: PRICING_QUOTE_STALE_MESSAGE,
        code: 'PRICING_QUOTE_STALE',
        quoteId: input.quoteId,
        reason: 'CURRENCY_CHANGED',
      });
    }

    if (currentContext.depositAmountCents !== storedTotals.depositAmountCents) {
      throw new ConflictException({
        message: PRICING_QUOTE_STALE_MESSAGE,
        code: 'PRICING_QUOTE_STALE',
        quoteId: input.quoteId,
        reason: 'DEPOSIT_CHANGED',
      });
    }
  }
}

export function requireQuoteId(quoteId: unknown): string {
  if (typeof quoteId !== 'string' || !quoteId.trim()) {
    throw new BadRequestException({
      message: 'quoteId ist für die Buchung erforderlich',
      code: 'PRICING_QUOTE_REQUIRED',
    });
  }
  return quoteId.trim();
}
