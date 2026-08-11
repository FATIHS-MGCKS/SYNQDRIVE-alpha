/**
 * E3 FX provenance + multi-currency aggregation authority (shared).
 *
 * Cross-currency money is only ever combined through an explicit, fully
 * provenanced conversion. There is no implicit rate, no float rate math, and no
 * silent mixed-currency total:
 *   - A conversion always records source/target currency, the rate, its source,
 *     and the observed time (`EvaluationsFxRate`).
 *   - Rate arithmetic is exact (BigInt scaled), with a single documented
 *     rounding mode (`HALF_UP`) versioned by `EVALUATIONS_FX_CONVERSION_VERSION`.
 *   - The original money is always preserved alongside the converted value.
 *   - Aggregating to a reporting currency fails closed when any required rate is
 *     missing — it never drops rows and reports a false "complete" total.
 */
import type { EvaluationsMoney } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import {
  EvaluationsMoneyError,
  MoneyOverflowError,
  getCurrencyMinorUnitExponent,
  normalizeMoneyCurrency,
  sumMoney,
  sumMoneyByCurrency,
} from './evaluations-money';

/** Version of the deterministic conversion + rounding policy. */
export const EVALUATIONS_FX_CONVERSION_VERSION = '1.0.0' as const;

/** Only rounding mode E3 defines for conversions; documented and deterministic. */
export type EvaluationsFxRoundingMode = 'HALF_UP';

export class EvaluationsFxError extends EvaluationsMoneyError {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationsFxError';
  }
}

/** Full provenance of a single FX rate used for a conversion. */
export interface EvaluationsFxRate {
  readonly sourceCurrency: string;
  readonly targetCurrency: string;
  /** Decimal rate string (target major units per one source major unit). */
  readonly rate: string;
  readonly rateSource: string;
  /** UTC ISO-8601 instant the rate was observed / is valid for. */
  readonly rateObservedAt: string;
  readonly roundingMode: EvaluationsFxRoundingMode;
  readonly conversionVersion: string;
}

/** A converted value that always retains its original money. */
export interface EvaluationsConvertedMoney {
  readonly original: EvaluationsMoney;
  readonly converted: EvaluationsMoney;
  readonly fx: EvaluationsFxRate;
}

/** Resolves an authoritative rate for (source → target), or null when missing. */
export type EvaluationsFxRateProvider = (
  sourceCurrency: string,
  targetCurrency: string,
) => EvaluationsFxRate | null;

function pow10(exp: number): bigint {
  let result = 1n;
  for (let i = 0; i < exp; i += 1) result *= 10n;
  return result;
}

/** Exact BigInt division with HALF_UP rounding away from zero on the .5 case. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new EvaluationsFxError('FX conversion denominator must be non-zero');
  }
  const negative = numerator < 0n !== denominator < 0n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  const rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function parseRate(rate: string): { scaled: bigint; scale: number } {
  const raw = (rate ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw) || Number(raw) <= 0) {
    throw new EvaluationsFxError(`FX rate must be a positive decimal string, received: ${String(rate)}`);
  }
  const [integerPart, fractionPart = ''] = raw.split('.');
  return {
    scaled: BigInt(`${integerPart}${fractionPart}` || '0'),
    scale: fractionPart.length,
  };
}

function toSafeNumber(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new MoneyOverflowError();
  }
  return Number(value);
}

/**
 * Convert money into the rate's target currency using exact scaled arithmetic.
 * The source currency must match the rate. The original money is preserved.
 */
export function convertMoney(
  money: EvaluationsMoney,
  fx: EvaluationsFxRate,
): EvaluationsConvertedMoney {
  const sourceCurrency = normalizeMoneyCurrency(money.currency);
  const rateSource = normalizeMoneyCurrency(fx.sourceCurrency);
  const targetCurrency = normalizeMoneyCurrency(fx.targetCurrency);
  if (sourceCurrency !== rateSource) {
    throw new EvaluationsFxError(
      `FX rate source ${rateSource} does not match money currency ${sourceCurrency}`,
    );
  }
  const { scaled: rateScaled, scale: rateScale } = parseRate(fx.rate);
  const sourceExponent = getCurrencyMinorUnitExponent(sourceCurrency);
  const targetExponent = getCurrencyMinorUnitExponent(targetCurrency);

  // targetMinor = round( amountMinor * rate * 10^targetExp / 10^(sourceExp + rateScale) )
  const numerator =
    BigInt(money.amountMinor) * rateScaled * pow10(targetExponent);
  const denominator = pow10(sourceExponent + rateScale);
  const targetMinor = divRoundHalfUp(numerator, denominator);

  return {
    original: { amountMinor: money.amountMinor, currency: sourceCurrency },
    converted: { amountMinor: toSafeNumber(targetMinor), currency: targetCurrency },
    fx: {
      sourceCurrency,
      targetCurrency,
      rate: fx.rate.trim(),
      rateSource: fx.rateSource,
      rateObservedAt: fx.rateObservedAt,
      roundingMode: fx.roundingMode,
      conversionVersion: fx.conversionVersion,
    },
  };
}

export type EvaluationsMoneyAggregationMode =
  | 'EMPTY'
  | 'SINGLE_CURRENCY'
  | 'PER_CURRENCY'
  | 'CONVERTED'
  | 'INCOMPLETE_FX';

/**
 * Result of aggregating a set of money values. A single scalar total only exists
 * for `SINGLE_CURRENCY` and `CONVERTED`; `PER_CURRENCY` and `INCOMPLETE_FX`
 * intentionally have no blended total (callers must fail closed / go partial).
 */
export type EvaluationsMoneyAggregation =
  | { readonly mode: 'EMPTY' }
  | { readonly mode: 'SINGLE_CURRENCY'; readonly total: EvaluationsMoney }
  | { readonly mode: 'PER_CURRENCY'; readonly perCurrency: readonly EvaluationsMoney[] }
  | {
      readonly mode: 'CONVERTED';
      readonly reportingCurrency: string;
      readonly total: EvaluationsMoney;
      readonly conversions: readonly EvaluationsConvertedMoney[];
      readonly perCurrency: readonly EvaluationsMoney[];
    }
  | {
      readonly mode: 'INCOMPLETE_FX';
      readonly reportingCurrency: string;
      readonly missingCurrencies: readonly string[];
      readonly perCurrency: readonly EvaluationsMoney[];
    };

/**
 * Aggregate money values without inventing a reporting currency. Same-currency
 * inputs collapse to a single total; mixed currencies stay separated per
 * currency. This never produces a mixed-currency false total.
 */
export function aggregateMoney(
  items: readonly EvaluationsMoney[],
): EvaluationsMoneyAggregation {
  if (items.length === 0) return { mode: 'EMPTY' };
  const perCurrency = sumMoneyByCurrency(items);
  if (perCurrency.length === 1) {
    return { mode: 'SINGLE_CURRENCY', total: perCurrency[0] };
  }
  return { mode: 'PER_CURRENCY', perCurrency };
}

/**
 * Aggregate money into a reporting currency with full FX provenance. Any missing
 * rate makes the result `INCOMPLETE_FX` (fail closed) — rows are never dropped
 * to fabricate a complete total.
 */
export function aggregateMoneyToReportingCurrency(
  items: readonly EvaluationsMoney[],
  reportingCurrency: string,
  rateProvider: EvaluationsFxRateProvider,
): EvaluationsMoneyAggregation {
  const target = normalizeMoneyCurrency(reportingCurrency);
  if (items.length === 0) return { mode: 'EMPTY' };
  const perCurrency = sumMoneyByCurrency(items);

  const conversions: EvaluationsConvertedMoney[] = [];
  const missingCurrencies: string[] = [];
  const convertedTotals: EvaluationsMoney[] = [];

  for (const bucket of perCurrency) {
    if (bucket.currency === target) {
      convertedTotals.push(bucket);
      continue;
    }
    const rate = rateProvider(bucket.currency, target);
    if (!rate) {
      missingCurrencies.push(bucket.currency);
      continue;
    }
    const converted = convertMoney(bucket, rate);
    conversions.push(converted);
    convertedTotals.push(converted.converted);
  }

  if (missingCurrencies.length > 0) {
    return {
      mode: 'INCOMPLETE_FX',
      reportingCurrency: target,
      missingCurrencies: missingCurrencies.sort(),
      perCurrency,
    };
  }

  return {
    mode: 'CONVERTED',
    reportingCurrency: target,
    total: sumMoney(convertedTotals, target),
    conversions,
    perCurrency,
  };
}
