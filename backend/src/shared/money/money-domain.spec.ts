import { currencyMinorDecimals, minorUnitScale } from '@synq/money/currency-decimals';
import { formatMoneyMinor } from '@synq/money/money.format';
import {
  legacyInsightFinancialImpactWholeMajor,
  resolveLegacyInsightFinancialImpact,
} from '@synq/money/money.legacy-insight';
import { MoneyDomainError } from '@synq/money/money.contract';
import {
  absMoney,
  addMoney,
  compareMoney,
  majorUnitsStringToMinor,
  moneyFromMinor,
  negateMoney,
  roundMinorToCurrency,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from '@synq/money/money.util';

describe('currency decimals', () => {
  it('uses 2 decimals for EUR and USD', () => {
    expect(currencyMinorDecimals('EUR')).toBe(2);
    expect(currencyMinorDecimals('USD')).toBe(2);
    expect(minorUnitScale('EUR')).toBe(100);
  });

  it('uses 0 decimals for JPY', () => {
    expect(currencyMinorDecimals('JPY')).toBe(0);
    expect(minorUnitScale('JPY')).toBe(1);
  });

  it('uses 3 decimals for BHD', () => {
    expect(currencyMinorDecimals('BHD')).toBe(3);
    expect(minorUnitScale('BHD')).toBe(1000);
  });
});

describe('moneyFromMinor', () => {
  it.each([0, 1, 999, 1000])('accepts integer minor amount %i', (amount) => {
    expect(moneyFromMinor(amount, 'EUR')).toEqual({ amountMinor: amount, currency: 'EUR' });
  });

  it('rejects non-integer minor amounts', () => {
    expect(() => moneyFromMinor(1.5, 'EUR')).toThrow(MoneyDomainError);
  });

  it('normalizes currency to uppercase', () => {
    expect(moneyFromMinor(100, 'eur').currency).toBe('EUR');
  });
});

describe('addMoney / subtractMoney / compareMoney', () => {
  it('adds same-currency amounts', () => {
    const a = moneyFromMinor(100, 'EUR');
    const b = moneyFromMinor(250, 'EUR');
    expect(addMoney(a, b)).toEqual(moneyFromMinor(350, 'EUR'));
  });

  it('subtracts same-currency amounts', () => {
    expect(subtractMoney(moneyFromMinor(500, 'EUR'), moneyFromMinor(125, 'EUR'))).toEqual(
      moneyFromMinor(375, 'EUR'),
    );
  });

  it('compares same-currency amounts', () => {
    expect(compareMoney(moneyFromMinor(1, 'EUR'), moneyFromMinor(999, 'EUR'))).toBe(-1);
    expect(compareMoney(moneyFromMinor(1000, 'EUR'), moneyFromMinor(1000, 'EUR'))).toBe(0);
    expect(compareMoney(moneyFromMinor(1001, 'EUR'), moneyFromMinor(50, 'EUR'))).toBe(1);
  });

  it('rejects incompatible currencies on add', () => {
    expect(() => addMoney(moneyFromMinor(100, 'EUR'), moneyFromMinor(100, 'USD'))).toThrow(
      MoneyDomainError,
    );
  });

  it('rejects incompatible currencies on subtract', () => {
    expect(() => subtractMoney(moneyFromMinor(100, 'EUR'), moneyFromMinor(50, 'USD'))).toThrow(
      MoneyDomainError,
    );
  });

  it('rejects incompatible currencies on compare', () => {
    expect(() => compareMoney(moneyFromMinor(100, 'EUR'), moneyFromMinor(100, 'USD'))).toThrow(
      MoneyDomainError,
    );
  });
});

describe('sumMoney', () => {
  it('sums homogeneous currency list', () => {
    const values = [moneyFromMinor(1, 'EUR'), moneyFromMinor(999, 'EUR'), moneyFromMinor(1000, 'EUR')];
    expect(sumMoney(values)).toEqual(moneyFromMinor(2000, 'EUR'));
  });

  it('returns zero for empty list when currency provided', () => {
    expect(sumMoney([], 'EUR')).toEqual(zeroMoney('EUR'));
  });

  it('rejects mixed currencies', () => {
    expect(() =>
      sumMoney([moneyFromMinor(100, 'EUR'), moneyFromMinor(100, 'USD')]),
    ).toThrow(MoneyDomainError);
  });
});

describe('large and negative values', () => {
  it('handles very large minor amounts', () => {
    const large = 9_007_199_254_740_991;
    expect(addMoney(moneyFromMinor(large, 'EUR'), moneyFromMinor(0, 'EUR')).amountMinor).toBe(large);
  });

  it('handles negative minor amounts', () => {
    expect(addMoney(moneyFromMinor(-500, 'EUR'), moneyFromMinor(200, 'EUR'))).toEqual(
      moneyFromMinor(-300, 'EUR'),
    );
    expect(negateMoney(moneyFromMinor(150, 'EUR'))).toEqual(moneyFromMinor(-150, 'EUR'));
    expect(absMoney(moneyFromMinor(-150, 'EUR'))).toEqual(moneyFromMinor(150, 'EUR'));
  });
});

describe('majorUnitsStringToMinor', () => {
  it('converts EUR major strings without float drift', () => {
    expect(majorUnitsStringToMinor('0', 'EUR')).toBe(0);
    expect(majorUnitsStringToMinor('1', 'EUR')).toBe(100);
    expect(majorUnitsStringToMinor('9.99', 'EUR')).toBe(999);
    expect(majorUnitsStringToMinor('10.00', 'EUR')).toBe(1000);
    expect(majorUnitsStringToMinor('17.755', 'EUR')).toBe(1776);
  });

  it('converts JPY without fractional minor units', () => {
    expect(majorUnitsStringToMinor('1000', 'JPY')).toBe(1000);
    expect(majorUnitsStringToMinor('1000.4', 'JPY')).toBe(1000);
    expect(majorUnitsStringToMinor('1000.5', 'JPY')).toBe(1001);
  });

  it('converts BHD with three decimal places', () => {
    expect(majorUnitsStringToMinor('1.234', 'BHD')).toBe(1234);
    expect(majorUnitsStringToMinor('1.2345', 'BHD')).toBe(1235);
  });
});

describe('roundMinorToCurrency', () => {
  it('rounds EUR minor amounts to major precision', () => {
    expect(roundMinorToCurrency(1776, 'EUR')).toBe(1800);
    expect(roundMinorToCurrency(1749, 'EUR')).toBe(1700);
  });
});

describe('legacy insight financial impact', () => {
  it('treats financialImpactCents as minor units', () => {
    expect(resolveLegacyInsightFinancialImpact({ financialImpactCents: 12_500 })).toEqual(
      moneyFromMinor(12_500, 'EUR'),
    );
    expect(legacyInsightFinancialImpactWholeMajor({ financialImpactCents: 12_500 })).toBe(125);
  });

  it('treats lostRevenueEur as whole major EUR units', () => {
    expect(resolveLegacyInsightFinancialImpact({ lostRevenueEur: 350 })).toEqual(
      moneyFromMinor(35_000, 'EUR'),
    );
    expect(legacyInsightFinancialImpactWholeMajor({ lostRevenueEur: 350 })).toBe(350);
  });

  it('prefers financialImpactCents over lostRevenueEur', () => {
    expect(
      resolveLegacyInsightFinancialImpact({ financialImpactCents: 500, lostRevenueEur: 350 }),
    ).toEqual(moneyFromMinor(500, 'EUR'));
  });
});

describe('formatMoneyMinor', () => {
  it('formats EUR and JPY display without conversion', () => {
    expect(formatMoneyMinor(1000, 'EUR', 'de-DE')).toMatch(/10,00/);
    expect(formatMoneyMinor(1000, 'JPY', 'de-DE')).toMatch(/1\.000/);
  });
});
