import { currencyMinorDecimals, minorUnitScale } from '@synq/money/currency-decimals';

import type {
  AnalyticsFxContext,
  FxConversionResult,
  FxConversionStatus,
  FxRateQuote,
  FxRoundingRule,
} from './fx.contract';

const ISO4217_PATTERN = /^[A-Z]{3}$/;

/** Parse document currency — never defaults missing/blank to EUR. */
export function parseDocumentCurrency(currency: string | null | undefined): string | null {
  if (currency == null) return null;
  const trimmed = currency.trim();
  if (!trimmed || trimmed === '€') return trimmed === '€' ? 'EUR' : null;
  const normalized = trimmed.toUpperCase();
  if (!ISO4217_PATTERN.test(normalized)) return null;
  return normalized;
}

export function toDateOnlyString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function daysBetweenDateOnly(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return Number.POSITIVE_INFINITY;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
}

function roundHalfUp(value: number): number {
  if (value >= 0) return Math.floor(value + 0.5);
  return Math.ceil(value - 0.5);
}

/**
 * Convert minor units across currencies using a major-unit rational rate.
 * Formula: minorTo = round_half_up((minorFrom * rateNum * scaleTo) / (rateDen * scaleFrom))
 */
export function convertMinorCrossCurrency(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string,
  quote: FxRateQuote,
  roundingRule: FxRoundingRule = 'HALF_UP_MINOR',
): number {
  if (!Number.isInteger(amountMinor)) {
    throw new Error('amountMinor must be an integer');
  }
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return amountMinor;

  const scaleFrom = minorUnitScale(from);
  const scaleTo = minorUnitScale(to);
  const numerator = amountMinor * quote.rateNumerator * scaleTo;
  const denominator = quote.rateDenominator * scaleFrom;
  if (denominator === 0) throw new Error('FX rate denominator must not be zero');

  const raw = numerator / denominator;
  if (roundingRule === 'HALF_UP_MINOR') {
    return roundHalfUp(raw);
  }
  return roundHalfUp(raw);
}

function buildResult(
  originalAmountMinor: number,
  originalCurrency: string,
  reportingCurrency: string,
  convertedAmountMinor: number | null,
  quote: FxRateQuote | null,
  status: FxConversionStatus,
  roundingRule: FxRoundingRule,
): FxConversionResult {
  return {
    originalCurrency,
    originalAmountMinor,
    reportingCurrency,
    convertedAmountMinor,
    exchangeRate: quote
      ? { numerator: quote.rateNumerator, denominator: quote.rateDenominator }
      : null,
    exchangeRateDate: quote?.effectiveDate ?? null,
    exchangeRateSource: quote?.source ?? null,
    conversionStatus: status,
    roundingRule,
  };
}

function isRateStale(quote: FxRateQuote, asOf: Date, maxRateAgeDays: number): boolean {
  const asOfDate = toDateOnlyString(asOf);
  const age = daysBetweenDateOnly(quote.effectiveDate, asOfDate);
  return age > maxRateAgeDays;
}

/** Resolve a document amount into reporting-currency minor units. */
export function convertMinorForReporting(
  amountMinor: number,
  documentCurrency: string | null | undefined,
  asOf: Date,
  context: AnalyticsFxContext,
): FxConversionResult {
  const roundingRule = context.roundingRule ?? 'HALF_UP_MINOR';
  const reportingCurrency = context.reportingCurrency.toUpperCase();
  const parsed = parseDocumentCurrency(documentCurrency);

  if (!parsed) {
    return buildResult(amountMinor, 'UNKNOWN', reportingCurrency, null, null, 'EXCLUDED_MISSING_CURRENCY', roundingRule);
  }

  if (parsed === reportingCurrency) {
    return buildResult(amountMinor, parsed, reportingCurrency, amountMinor, null, 'NATIVE', roundingRule);
  }

  const quote = context.rateProvider.getRate(parsed, reportingCurrency, asOf);
  if (!quote) {
    return buildResult(amountMinor, parsed, reportingCurrency, null, null, 'EXCLUDED_MISSING_RATE', roundingRule);
  }

  const maxAge = context.maxRateAgeDays ?? 30;
  if (isRateStale(quote, asOf, maxAge)) {
    return buildResult(amountMinor, parsed, reportingCurrency, null, quote, 'EXCLUDED_STALE_RATE', roundingRule);
  }

  const converted = convertMinorCrossCurrency(amountMinor, parsed, reportingCurrency, quote, roundingRule);
  return buildResult(amountMinor, parsed, reportingCurrency, converted, quote, 'CONVERTED', roundingRule);
}

import type { SupportedAnalyticsCurrency } from './fx.contract';
import { SUPPORTED_ANALYTICS_CURRENCIES } from './fx.contract';

export function isSupportedAnalyticsCurrency(currency: string): currency is SupportedAnalyticsCurrency {
  return (SUPPORTED_ANALYTICS_CURRENCIES as readonly string[]).includes(currency.toUpperCase());
}
