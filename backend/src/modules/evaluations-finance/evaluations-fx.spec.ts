import {
  EVALUATIONS_FX_CONVERSION_VERSION,
  type EvaluationsFxRate,
  aggregateMoney,
  aggregateMoneyToReportingCurrency,
  convertMoney,
} from '@synq/evaluations-finance/evaluations-fx';
import { moneyOfMinor } from '@synq/evaluations-finance/evaluations-money';

function rate(
  source: string,
  target: string,
  value: string,
  observedAt = '2026-07-15T00:00:00.000Z',
): EvaluationsFxRate {
  return {
    sourceCurrency: source,
    targetCurrency: target,
    rate: value,
    rateSource: 'TEST_FIXTURE',
    rateObservedAt: observedAt,
    roundingMode: 'HALF_UP',
    conversionVersion: EVALUATIONS_FX_CONVERSION_VERSION,
  };
}

describe('evaluations FX + multi-currency (E3)', () => {
  describe('convertMoney', () => {
    it('converts with exact scaled arithmetic and preserves the original', () => {
      const result = convertMoney(moneyOfMinor(10000, 'USD'), rate('USD', 'EUR', '0.92'));
      expect(result.original).toEqual(moneyOfMinor(10000, 'USD'));
      expect(result.converted).toEqual(moneyOfMinor(9200, 'EUR'));
      expect(result.fx.rateSource).toBe('TEST_FIXTURE');
      expect(result.fx.rateObservedAt).toBe('2026-07-15T00:00:00.000Z');
    });

    it('rounds half up deterministically', () => {
      // 1 minor USD * 0.925 = 0.925 target minor → rounds to 1
      expect(convertMoney(moneyOfMinor(1, 'USD'), rate('USD', 'EUR', '0.925')).converted).toEqual(
        moneyOfMinor(1, 'EUR'),
      );
    });

    it('handles cross-exponent conversion (EUR → JPY)', () => {
      // 100.00 EUR (10000 minor) * 160 = 16000 JPY (0-decimal)
      expect(convertMoney(moneyOfMinor(10000, 'EUR'), rate('EUR', 'JPY', '160')).converted).toEqual(
        moneyOfMinor(16000, 'JPY'),
      );
    });

    it('rejects a rate whose source does not match the money currency', () => {
      expect(() => convertMoney(moneyOfMinor(100, 'GBP'), rate('USD', 'EUR', '0.9'))).toThrow();
    });

    it('rejects non-positive / malformed rates', () => {
      expect(() => convertMoney(moneyOfMinor(100, 'USD'), rate('USD', 'EUR', '0'))).toThrow();
      expect(() => convertMoney(moneyOfMinor(100, 'USD'), rate('USD', 'EUR', 'abc'))).toThrow();
    });
  });

  describe('aggregateMoney (no reporting currency)', () => {
    it('returns EMPTY for no items', () => {
      expect(aggregateMoney([])).toEqual({ mode: 'EMPTY' });
    });

    it('collapses a single currency to one total', () => {
      expect(aggregateMoney([moneyOfMinor(100, 'EUR'), moneyOfMinor(50, 'EUR')])).toEqual({
        mode: 'SINGLE_CURRENCY',
        total: moneyOfMinor(150, 'EUR'),
      });
    });

    it('keeps mixed currencies per-currency (no false total)', () => {
      const result = aggregateMoney([moneyOfMinor(100, 'EUR'), moneyOfMinor(100, 'USD')]);
      expect(result.mode).toBe('PER_CURRENCY');
      if (result.mode === 'PER_CURRENCY') {
        expect(result.perCurrency).toEqual([moneyOfMinor(100, 'EUR'), moneyOfMinor(100, 'USD')]);
      }
    });
  });

  describe('aggregateMoneyToReportingCurrency', () => {
    it('converts fully and exposes provenance + preserved originals', () => {
      const provider = (s: string, t: string) => (s === 'USD' && t === 'EUR' ? rate('USD', 'EUR', '0.9') : null);
      const result = aggregateMoneyToReportingCurrency(
        [moneyOfMinor(10000, 'EUR'), moneyOfMinor(10000, 'USD')],
        'EUR',
        provider,
      );
      expect(result.mode).toBe('CONVERTED');
      if (result.mode === 'CONVERTED') {
        expect(result.total).toEqual(moneyOfMinor(19000, 'EUR'));
        expect(result.conversions).toHaveLength(1);
        expect(result.conversions[0].original).toEqual(moneyOfMinor(10000, 'USD'));
      }
    });

    it('fails closed (INCOMPLETE_FX) when a required rate is missing', () => {
      const provider = () => null;
      const result = aggregateMoneyToReportingCurrency(
        [moneyOfMinor(10000, 'EUR'), moneyOfMinor(10000, 'USD')],
        'EUR',
        provider,
      );
      expect(result.mode).toBe('INCOMPLETE_FX');
      if (result.mode === 'INCOMPLETE_FX') {
        expect(result.missingCurrencies).toEqual(['USD']);
      }
    });

    it('never fabricates a mixed 100 EUR + 100 USD = 200 EUR total', () => {
      const provider = () => null;
      const result = aggregateMoneyToReportingCurrency(
        [moneyOfMinor(10000, 'EUR'), moneyOfMinor(10000, 'USD')],
        'EUR',
        provider,
      );
      expect(result.mode).not.toBe('CONVERTED');
    });
  });
});
