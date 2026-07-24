import { currencyMinorDecimals, minorUnitScale } from './currency-decimals';
import { Money, MoneyDomainError } from './money.contract';

const ISO4217_PATTERN = /^[A-Z]{3}$/;

export function normalizeMoneyCurrency(currency: string): string {
  const trimmed = typeof currency === 'string' ? currency.trim() : '';
  if (!trimmed) {
    throw new MoneyDomainError('CURRENCY_REQUIRED', 'Currency code is required');
  }
  const normalized = trimmed.toUpperCase();
  if (!ISO4217_PATTERN.test(normalized)) {
    throw new MoneyDomainError('CURRENCY_INVALID', `Invalid currency code: ${currency}`);
  }
  return normalized;
}

export function assertValidMinorAmount(amountMinor: number, field = 'amountMinor'): void {
  if (!Number.isFinite(amountMinor)) {
    throw new MoneyDomainError('AMOUNT_INVALID', `${field} must be a finite number`);
  }
  if (!Number.isInteger(amountMinor)) {
    throw new MoneyDomainError('AMOUNT_NOT_INTEGER', `${field} must be an integer minor-unit amount`);
  }
}

export function moneyFromMinor(amountMinor: number, currency: string): Money {
  assertValidMinorAmount(amountMinor);
  return {
    amountMinor,
    currency: normalizeMoneyCurrency(currency),
  };
}

export function zeroMoney(currency: string): Money {
  return moneyFromMinor(0, currency);
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyDomainError(
      'CURRENCY_MISMATCH',
      `Cannot combine ${a.currency} with ${b.currency}`,
    );
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return moneyFromMinor(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return moneyFromMinor(a.amountMinor - b.amountMinor, a.currency);
}

export type MoneyComparison = -1 | 0 | 1;

export function compareMoney(a: Money, b: Money): MoneyComparison {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export function sumMoney(values: Money[], currency?: string): Money {
  if (values.length === 0) {
    if (!currency) {
      throw new MoneyDomainError('SUM_EMPTY', 'sumMoney requires currency when values is empty');
    }
    return zeroMoney(currency);
  }
  const resolvedCurrency = values[0]!.currency;
  let total = 0;
  for (const value of values) {
    assertSameCurrency(value, { amountMinor: 0, currency: resolvedCurrency });
    total += value.amountMinor;
  }
  return moneyFromMinor(total, resolvedCurrency);
}

/**
 * Round a major-unit decimal string to minor units without float arithmetic.
 * Accepts optional sign; supports up to the currency's minor decimals.
 */
export function majorUnitsStringToMinor(amount: string, currency: string): number {
  const code = normalizeMoneyCurrency(currency);
  const decimals = currencyMinorDecimals(code);
  const trimmed = amount.trim();
  if (!trimmed) {
    throw new MoneyDomainError('AMOUNT_INVALID', 'Amount string is required');
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1).trim() : trimmed;
  const normalized = unsigned.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new MoneyDomainError('AMOUNT_INVALID', `Invalid major-unit amount: ${amount}`);
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const paddedFraction = fractionPart.padEnd(decimals + 1, '0');
  const roundingDigit = Number(paddedFraction[decimals] ?? '0');
  const truncatedFraction = paddedFraction.slice(0, decimals);
  let minor = Number(wholePart) * minorUnitScale(code) + Number(truncatedFraction || '0');
  if (roundingDigit >= 5) minor += 1;
  return negative ? -minor : minor;
}

/** @deprecated Prefer majorUnitsStringToMinor — numeric major input may carry float noise. */
export function majorUnitsNumberToMinor(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) {
    throw new MoneyDomainError('AMOUNT_INVALID', 'Major-unit amount must be finite');
  }
  return majorUnitsStringToMinor(String(amount), currency);
}

export function roundMinorToCurrency(amountMinor: number, currency: string): number {
  assertValidMinorAmount(amountMinor);
  const scale = minorUnitScale(currency);
  const halfMinor = scale / 2;
  if (amountMinor >= 0) {
    return Math.floor((amountMinor + halfMinor) / scale) * scale;
  }
  return Math.ceil((amountMinor - halfMinor) / scale) * scale;
}

/** Integer major units for whole-currency display (truncates sub-major remainder). */
export function minorToWholeMajorUnits(amountMinor: number, currency: string): number {
  assertValidMinorAmount(amountMinor);
  const scale = minorUnitScale(currency);
  return Math.trunc(amountMinor / scale);
}

/** Display ratio for Intl.NumberFormat — not for business calculations. */
export function minorToMajorDisplayValue(amountMinor: number, currency: string): number {
  assertValidMinorAmount(amountMinor);
  return amountMinor / minorUnitScale(currency);
}

export function isZeroMoney(value: Money): boolean {
  return value.amountMinor === 0;
}

export function negateMoney(value: Money): Money {
  return moneyFromMinor(-value.amountMinor, value.currency);
}

export function absMoney(value: Money): Money {
  return moneyFromMinor(Math.abs(value.amountMinor), value.currency);
}
