export type { Money } from '@synq/money/money.contract';
export { MoneyDomainError } from '@synq/money/money.contract';

export {
  currencyMinorDecimals,
  minorUnitScale,
} from '@synq/money/currency-decimals';

export {
  absMoney,
  addMoney,
  assertSameCurrency,
  assertValidMinorAmount,
  compareMoney,
  majorUnitsNumberToMinor,
  majorUnitsStringToMinor,
  minorToMajorDisplayValue,
  minorToWholeMajorUnits,
  moneyFromMinor,
  negateMoney,
  normalizeMoneyCurrency,
  roundMinorToCurrency,
  subtractMoney,
  sumMoney,
  zeroMoney,
  isZeroMoney,
} from '@synq/money/money.util';

export {
  legacyInsightFinancialImpactWholeMajor,
  resolveLegacyInsightFinancialImpact,
} from '@synq/money/money.legacy-insight';

export {
  formatMoney,
  formatMoneyMajorUnits,
  formatMoneyMinor,
  tryNormalizeCurrencyCode,
} from '@synq/money/money.format';

// Re-export backend-specific currency validation (throws on invalid codes with Nest exceptions).
export {
  assertClientCurrencyMatches,
  normalizeCurrencyCode,
  resolvePriceBookCurrency,
  toBookingCurrencyStorage,
} from './money.util';
