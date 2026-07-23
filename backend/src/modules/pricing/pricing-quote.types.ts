import type { PricingContextDto } from './pricing-context.types';
import type { BookingPriceSimulation } from './pricing.service';
import type { BookingPricingInputDto } from './dto';
import type { FrozenBookingDeposit } from '@modules/deposit/frozen-booking-deposit.types';

export interface PricingQuoteTotals {
  rentalDays: number;
  subtotalNetCents: number;
  taxAmountCents: number;
  totalGrossCents: number;
  depositAmountCents: number;
  includedKm: number;
  extraKmPriceCents: number;
  totalDueNowCents: number;
  currency: string;
  effectiveDailyRateCents: number;
  frozenDeposit?: FrozenBookingDeposit | null;
}

export interface PricingSimulationWithQuote extends BookingPriceSimulation {
  quoteId: string;
  calculatedAt: string;
  expiresAt: string;
  totals: PricingQuoteTotals;
}

export type PricingQuoteErrorCode =
  | 'PRICING_QUOTE_REQUIRED'
  | 'PRICING_QUOTE_NOT_FOUND'
  | 'PRICING_QUOTE_EXPIRED'
  | 'PRICING_QUOTE_ALREADY_CONSUMED'
  | 'PRICING_QUOTE_STALE'
  | 'PRICING_QUOTE_VEHICLE_MISMATCH'
  | 'PRICING_QUOTE_PERIOD_MISMATCH'
  | 'PRICING_QUOTE_OPTIONS_MISMATCH'
  | 'PRICING_QUOTE_USER_MISMATCH'
  | 'PRICING_QUOTE_ORG_MISMATCH';

export const PRICING_QUOTE_STALE_MESSAGE =
  'Der Preis wurde inzwischen geändert. Bitte aktualisieren Sie die Preisberechnung.';

export function totalsFromSimulation(simulation: BookingPriceSimulation): PricingQuoteTotals {
  const frozenDeposit =
    simulation.resolvedDeposit != null
      ? {
          amountCents: simulation.resolvedDeposit.amount,
          currency: simulation.resolvedDeposit.currency,
          source: simulation.resolvedDeposit.source,
          ruleRevisionId: simulation.resolvedDeposit.ruleRevisionId,
          reason: simulation.resolvedDeposit.reason,
          manualOverride: simulation.resolvedDeposit.manualOverride,
          calculatedAt: simulation.resolvedDeposit.calculatedAt,
          frozenAt: null,
        }
      : simulation.pricingContext.resolvedDeposit
        ? {
            amountCents: simulation.pricingContext.resolvedDeposit.amount,
            currency: simulation.pricingContext.resolvedDeposit.currency,
            source: simulation.pricingContext.resolvedDeposit.source,
            ruleRevisionId: simulation.pricingContext.resolvedDeposit.ruleRevisionId,
            reason: simulation.pricingContext.resolvedDeposit.reason,
            manualOverride: simulation.pricingContext.resolvedDeposit.manualOverride,
            calculatedAt: simulation.pricingContext.resolvedDeposit.calculatedAt,
            frozenAt: null,
          }
        : null;

  return {
    rentalDays: simulation.rentalDays,
    subtotalNetCents: simulation.subtotalNetCents,
    taxAmountCents: simulation.taxAmountCents,
    totalGrossCents: simulation.totalGrossCents,
    depositAmountCents: simulation.depositAmountCents,
    includedKm: simulation.includedKm,
    extraKmPriceCents: simulation.extraKmPriceCents,
    totalDueNowCents: simulation.totalDueNowCents,
    currency: simulation.currency,
    effectiveDailyRateCents: simulation.effectiveDailyRateCents,
    frozenDeposit,
  };
}

export interface StoredPricingQuotePayload {
  pricingContext: PricingContextDto;
  pricingInput: BookingPricingInputDto;
  lineItems: BookingPriceSimulation['lineItems'];
  totals: PricingQuoteTotals;
  simulation: BookingPriceSimulation;
}
