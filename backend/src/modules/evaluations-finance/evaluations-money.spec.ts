import {
  MoneyCurrencyMismatchError,
  MoneyOverflowError,
  addMoney,
  compareMoney,
  decimalStringToMinor,
  getCurrencyMinorUnitExponent,
  moneyOfMinor,
  moneyZero,
  negateMoney,
  normalizeMoneyCurrency,
  subtractMoney,
  sumMoney,
  sumMoneyByCurrency,
} from '@synq/evaluations-finance/evaluations-money';

describe('evaluations money domain (E3)', () => {
  describe('currency authority', () => {
    it('normalizes and validates ISO-4217 codes', () => {
      expect(normalizeMoneyCurrency(' eur ')).toBe('EUR');
      expect(() => normalizeMoneyCurrency('EU')).toThrow();
      expect(() => normalizeMoneyCurrency('ZZZ')).toThrow();
    });

    it('never defaults a missing currency to EUR', () => {
      expect(() => moneyOfMinor(100, '')).toThrow();
      expect(() => normalizeMoneyCurrency(undefined as unknown as string)).toThrow();
    });

    it('resolves minor-unit exponents from a central authority', () => {
      expect(getCurrencyMinorUnitExponent('EUR')).toBe(2);
      expect(getCurrencyMinorUnitExponent('USD')).toBe(2);
      expect(getCurrencyMinorUnitExponent('JPY')).toBe(0);
      expect(getCurrencyMinorUnitExponent('KWD')).toBe(3);
      expect(getCurrencyMinorUnitExponent('CLF')).toBe(4);
    });
  });

  describe('arithmetic', () => {
    it('adds and subtracts same-currency money', () => {
      expect(addMoney(moneyOfMinor(1000, 'EUR'), moneyOfMinor(500, 'EUR'))).toEqual(
        moneyOfMinor(1500, 'EUR'),
      );
      expect(subtractMoney(moneyOfMinor(1000, 'EUR'), moneyOfMinor(300, 'EUR'))).toEqual(
        moneyOfMinor(700, 'EUR'),
      );
    });

    it('is commutative for same currency (a+b = b+a)', () => {
      const a = moneyOfMinor(1234, 'USD');
      const b = moneyOfMinor(9876, 'USD');
      expect(addMoney(a, b)).toEqual(addMoney(b, a));
    });

    it('satisfies (a+b)-b = a', () => {
      const a = moneyOfMinor(4200, 'EUR');
      const b = moneyOfMinor(1999, 'EUR');
      expect(subtractMoney(addMoney(a, b), b)).toEqual(a);
    });

    it('throws on cross-currency addition (EUR + USD)', () => {
      expect(() => addMoney(moneyOfMinor(1000, 'EUR'), moneyOfMinor(1000, 'USD'))).toThrow(
        MoneyCurrencyMismatchError,
      );
    });

    it('negates and compares', () => {
      expect(negateMoney(moneyOfMinor(500, 'EUR'))).toEqual(moneyOfMinor(-500, 'EUR'));
      expect(compareMoney(moneyOfMinor(1, 'EUR'), moneyOfMinor(2, 'EUR'))).toBe(-1);
      expect(compareMoney(moneyOfMinor(2, 'EUR'), moneyOfMinor(2, 'EUR'))).toBe(0);
      expect(compareMoney(moneyOfMinor(3, 'EUR'), moneyOfMinor(2, 'EUR'))).toBe(1);
    });
  });

  describe('sum + overflow safety', () => {
    it('sums with a BigInt accumulator and returns a safe integer', () => {
      expect(sumMoney([moneyOfMinor(100, 'EUR'), moneyOfMinor(200, 'EUR')])).toEqual(
        moneyOfMinor(300, 'EUR'),
      );
    });

    it('requires an explicit currency for empty sums (no implicit default)', () => {
      expect(() => sumMoney([])).toThrow();
      expect(sumMoney([], 'EUR')).toEqual(moneyZero('EUR'));
    });

    it('fails closed when a sum exceeds the safe integer boundary', () => {
      const near = moneyOfMinor(Number.MAX_SAFE_INTEGER, 'EUR');
      expect(() => sumMoney([near, moneyOfMinor(1, 'EUR'), moneyOfMinor(1, 'EUR')])).toThrow(
        MoneyOverflowError,
      );
    });

    it('accumulates a large list near the boundary without precision loss', () => {
      const items = Array.from({ length: 1000 }, () => moneyOfMinor(9_000_000_000, 'EUR'));
      expect(sumMoney(items)).toEqual(moneyOfMinor(9_000_000_000_000, 'EUR'));
    });

    it('groups mixed currencies without blending a false total', () => {
      const grouped = sumMoneyByCurrency([
        moneyOfMinor(100, 'EUR'),
        moneyOfMinor(100, 'USD'),
        moneyOfMinor(50, 'EUR'),
      ]);
      expect(grouped).toEqual([moneyOfMinor(150, 'EUR'), moneyOfMinor(100, 'USD')]);
    });
  });

  describe('decimal → minor conversion (migration/backfill safety)', () => {
    it.each([
      ['0.01', 'EUR', 1],
      ['0.1', 'EUR', 10],
      ['0.10', 'EUR', 10],
      ['19.99', 'EUR', 1999],
      ['-20.00', 'EUR', -2000],
      ['1000', 'JPY', 1000],
      ['1.234', 'KWD', 1234],
    ])('converts %s %s → %d minor', (decimal, currency, expected) => {
      expect(decimalStringToMinor(decimal as string, currency as string)).toBe(expected);
    });

    it('rejects precision-losing input (100.005 EUR) rather than guessing', () => {
      expect(() => decimalStringToMinor('100.005', 'EUR')).toThrow();
    });

    it('allows trailing-zero fractions beyond the exponent', () => {
      expect(decimalStringToMinor('19.9900', 'EUR')).toBe(1999);
    });
  });
});
