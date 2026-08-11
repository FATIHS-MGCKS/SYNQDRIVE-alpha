/**
 * E3 canonical money arithmetic authority (shared, framework-free).
 *
 * This module is the single source of truth for evaluations money arithmetic.
 * It builds on the E1 wire contract and NEVER replaces it:
 *   - `EvaluationsMoney { amountMinor, currency }` remains the value authority.
 *   - `currency` is the concrete ISO-4217 currency of the value; there is no
 *     implicit EUR default anywhere in this file.
 *
 * Rules enforced here:
 *   - No floating-point money arithmetic. Intermediate sums accumulate in BigInt
 *     and are only projected back to `number` after a `Number.isSafeInteger`
 *     boundary check (fail-closed on overflow).
 *   - Money of different currencies is never added implicitly; cross-currency
 *     operations throw. Multi-currency aggregation is handled explicitly in
 *     `evaluations-fx.ts`.
 *   - Minor-unit exponents come from a central ISO-4217 authority, not a blanket
 *     "everything has 2 decimals" assumption.
 */
import type { EvaluationsMoney } from '@synq/evaluations-metrics/evaluations-metric-response.contract';
import { isIso4217CurrencyCode } from '../money/iso4217-currency-codes';

const ISO_4217_PATTERN = /^[A-Z]{3}$/;

/**
 * ISO-4217 minor-unit exponents that deviate from the common 2-decimal default.
 * Zero-decimal and three/four-decimal currencies must not be treated as 2dp.
 * Anything not listed here resolves to the 2-decimal default via
 * `getCurrencyMinorUnitExponent`.
 */
export const MONEY_MINOR_UNIT_EXPONENTS: Readonly<Record<string, number>> = {
  // Zero-decimal currencies
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0,
  RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Three-decimal currencies
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // Four-decimal currencies
  CLF: 4, UYW: 4,
};

export const DEFAULT_MONEY_MINOR_UNIT_EXPONENT = 2;

export class EvaluationsMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluationsMoneyError';
  }
}

export class MoneyCurrencyMismatchError extends EvaluationsMoneyError {
  readonly left: string;
  readonly right: string;
  constructor(left: string, right: string) {
    super(`Cannot combine money of different currencies: ${left} vs ${right}`);
    this.name = 'MoneyCurrencyMismatchError';
    this.left = left;
    this.right = right;
  }
}

export class MoneyOverflowError extends EvaluationsMoneyError {
  constructor(message = 'Money amount exceeds the safe integer boundary') {
    super(message);
    this.name = 'MoneyOverflowError';
  }
}

/** Normalize + validate a currency code against the shared ISO-4217 authority. */
export function normalizeMoneyCurrency(currency: string): string {
  const normalized = (currency ?? '').trim().toUpperCase();
  if (!ISO_4217_PATTERN.test(normalized) || !isIso4217CurrencyCode(normalized)) {
    throw new EvaluationsMoneyError(
      `Currency must be an assigned uppercase ISO-4217 code, received: ${String(currency)}`,
    );
  }
  return normalized;
}

/** Resolve the ISO-4217 minor-unit exponent for a currency (central authority). */
export function getCurrencyMinorUnitExponent(currency: string): number {
  const normalized = normalizeMoneyCurrency(currency);
  return MONEY_MINOR_UNIT_EXPONENTS[normalized] ?? DEFAULT_MONEY_MINOR_UNIT_EXPONENT;
}

export function assertValidMoney(money: EvaluationsMoney): void {
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new MoneyOverflowError('Money amountMinor must be a safe integer');
  }
  normalizeMoneyCurrency(money.currency);
}

/** Construct a validated money value from integer minor units. */
export function moneyOfMinor(amountMinor: number, currency: string): EvaluationsMoney {
  const normalized = normalizeMoneyCurrency(currency);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new MoneyOverflowError('Money amountMinor must be a safe integer');
  }
  return { amountMinor, currency: normalized };
}

/** Zero of a concrete currency (never a currency-less placeholder). */
export function moneyZero(currency: string): EvaluationsMoney {
  return { amountMinor: 0, currency: normalizeMoneyCurrency(currency) };
}

export function isSameCurrency(a: EvaluationsMoney, b: EvaluationsMoney): boolean {
  return normalizeMoneyCurrency(a.currency) === normalizeMoneyCurrency(b.currency);
}

function assertSameCurrency(a: EvaluationsMoney, b: EvaluationsMoney): string {
  const left = normalizeMoneyCurrency(a.currency);
  const right = normalizeMoneyCurrency(b.currency);
  if (left !== right) throw new MoneyCurrencyMismatchError(left, right);
  return left;
}

function fromSafeBigInt(value: bigint, currency: string): EvaluationsMoney {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new MoneyOverflowError();
  }
  return { amountMinor: Number(value), currency };
}

export function addMoney(a: EvaluationsMoney, b: EvaluationsMoney): EvaluationsMoney {
  assertValidMoney(a);
  assertValidMoney(b);
  const currency = assertSameCurrency(a, b);
  return fromSafeBigInt(BigInt(a.amountMinor) + BigInt(b.amountMinor), currency);
}

export function subtractMoney(a: EvaluationsMoney, b: EvaluationsMoney): EvaluationsMoney {
  assertValidMoney(a);
  assertValidMoney(b);
  const currency = assertSameCurrency(a, b);
  return fromSafeBigInt(BigInt(a.amountMinor) - BigInt(b.amountMinor), currency);
}

export function negateMoney(a: EvaluationsMoney): EvaluationsMoney {
  assertValidMoney(a);
  return fromSafeBigInt(-BigInt(a.amountMinor), normalizeMoneyCurrency(a.currency));
}

/** -1 if a<b, 0 if equal, 1 if a>b. Throws on currency mismatch. */
export function compareMoney(a: EvaluationsMoney, b: EvaluationsMoney): -1 | 0 | 1 {
  assertValidMoney(a);
  assertValidMoney(b);
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export function isZeroMoney(a: EvaluationsMoney): boolean {
  return a.amountMinor === 0;
}

/**
 * Sum same-currency money using a BigInt accumulator (overflow-safe). When the
 * list is empty a currency must be provided, so the zero still carries an
 * explicit currency authority rather than an implicit default.
 */
export function sumMoney(
  items: readonly EvaluationsMoney[],
  currencyWhenEmpty?: string,
): EvaluationsMoney {
  if (items.length === 0) {
    if (!currencyWhenEmpty) {
      throw new EvaluationsMoneyError(
        'Cannot sum an empty money list without an explicit currency',
      );
    }
    return moneyZero(currencyWhenEmpty);
  }
  let currency: string | null = null;
  let acc = 0n;
  for (const item of items) {
    assertValidMoney(item);
    const itemCurrency = normalizeMoneyCurrency(item.currency);
    if (currency === null) {
      currency = itemCurrency;
    } else if (currency !== itemCurrency) {
      throw new MoneyCurrencyMismatchError(currency, itemCurrency);
    }
    acc += BigInt(item.amountMinor);
  }
  return fromSafeBigInt(acc, currency as string);
}

/**
 * Group money by currency and sum each group independently. This is the
 * currency-safe foundation for multi-currency aggregation: it never blends
 * currencies into a single false total. Result is sorted by currency code.
 */
export function sumMoneyByCurrency(
  items: readonly EvaluationsMoney[],
): EvaluationsMoney[] {
  const acc = new Map<string, bigint>();
  for (const item of items) {
    assertValidMoney(item);
    const currency = normalizeMoneyCurrency(item.currency);
    acc.set(currency, (acc.get(currency) ?? 0n) + BigInt(item.amountMinor));
  }
  return [...acc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currency, total]) => fromSafeBigInt(total, currency));
}

/**
 * Deterministic decimal-string → integer minor-unit conversion (no float).
 *
 * Used by money-migration backfill validation and decimal→minor tests. Throws
 * when the fractional precision exceeds the currency's minor-unit exponent
 * (ambiguous/precision-losing input is never silently rounded).
 */
export function decimalStringToMinor(decimal: string, currency: string): number {
  const exponent = getCurrencyMinorUnitExponent(currency);
  const raw = (decimal ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new EvaluationsMoneyError(`Invalid decimal money literal: ${String(decimal)}`);
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [integerPart, fractionPart = ''] = unsigned.split('.');
  if (fractionPart.length > exponent) {
    const overflowDigits = fractionPart.slice(exponent);
    if (/[^0]/.test(overflowDigits)) {
      throw new EvaluationsMoneyError(
        `Decimal ${raw} exceeds ${exponent} minor digits for ${normalizeMoneyCurrency(currency)} (precision loss)`,
      );
    }
  }
  const paddedFraction = fractionPart
    .slice(0, exponent)
    .padEnd(exponent, '0');
  const combined = `${integerPart}${paddedFraction}` || '0';
  const magnitude = BigInt(combined);
  const signed = negative ? -magnitude : magnitude;
  return Number(fromSafeBigInt(signed, normalizeMoneyCurrency(currency)).amountMinor);
}
