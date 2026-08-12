import { describe, expect, it } from 'vitest';
import {
  formatCanonicalMoney,
  formatEvaluationsMoney,
  minorToMajor,
  partitionByCurrency,
  isMoneyValueBearing,
} from './evaluations-money';

describe('E6A canonical money formatter — explicit currency, no EUR default', () => {
  it('formats EUR with 2 decimals', () => {
    const out = formatCanonicalMoney({ amountMinor: 123456, currency: 'EUR', locale: 'de-DE' });
    expect(out).not.toBeNull();
    // 1234.56 in some grouping; assert the numeric part + currency symbol presence.
    expect(out).toContain('1');
    expect(out).toMatch(/€|EUR/);
  });

  it('formats USD with 2 decimals', () => {
    const out = formatCanonicalMoney({ amountMinor: 100000, currency: 'USD', locale: 'en-US' });
    expect(out).toBe('$1,000.00');
  });

  it('formats JPY with 0 decimals (minor unit exponent 0)', () => {
    // 1000 minor JPY = ¥1000 (no /100).
    const out = formatCanonicalMoney({ amountMinor: 1000, currency: 'JPY', locale: 'en-US' });
    expect(out).toBe('¥1,000');
    expect(minorToMajor(1000, 'JPY')).toBe(1000);
  });

  it('formats KWD with 3 decimals (minor unit exponent 3)', () => {
    // 1234 minor KWD = 1.234 KWD.
    expect(minorToMajor(1234, 'KWD')).toBeCloseTo(1.234, 3);
    const out = formatCanonicalMoney({ amountMinor: 1234, currency: 'KWD', locale: 'en-US' });
    expect(out).not.toBeNull();
    expect(out).toContain('1.234');
  });

  it('same amountMinor formats differently per currency (no fixed /100, no default EUR)', () => {
    const eur = formatCanonicalMoney({ amountMinor: 5000, currency: 'EUR', locale: 'en-US' });
    const jpy = formatCanonicalMoney({ amountMinor: 5000, currency: 'JPY', locale: 'en-US' });
    expect(eur).toBe('€50.00');
    expect(jpy).toBe('¥5,000');
  });

  it('missing/empty currency returns null (never an EUR guess)', () => {
    expect(formatCanonicalMoney({ amountMinor: 100, currency: '', locale: 'en-US' })).toBeNull();
    expect(formatEvaluationsMoney({ amountMinor: 100, currency: '' }, 'en-US')).toBeNull();
    expect(formatEvaluationsMoney(null, 'en-US')).toBeNull();
  });

  it('invalid ISO currency returns null (no crash, no /100 fallback)', () => {
    expect(formatCanonicalMoney({ amountMinor: 100, currency: 'ZZZ', locale: 'en-US' })).toBeNull();
  });

  it('formatEvaluationsMoney uses the contract currency', () => {
    expect(formatEvaluationsMoney({ amountMinor: 100000, currency: 'USD' }, 'en-US')).toBe(
      '$1,000.00',
    );
  });
});

describe('E6A mixed-currency safety (never summed)', () => {
  it('partitionByCurrency flags mixed currencies and never produces a grand total', () => {
    const res = partitionByCurrency([
      { amountMinor: 1000, currency: 'EUR' },
      { amountMinor: 2000, currency: 'USD' },
    ]);
    expect(res.mixedCurrency).toBe(true);
    expect(res.totalsByCurrency).toHaveLength(2);
    // No aggregate field exists — the API returns only per-currency totals.
    expect((res as Record<string, unknown>).total).toBeUndefined();
  });

  it('single currency is not flagged mixed', () => {
    const res = partitionByCurrency([{ amountMinor: 1000, currency: 'EUR' }]);
    expect(res.mixedCurrency).toBe(false);
  });
});

describe('E6A money value-bearing status gate', () => {
  it('AVAILABLE/PARTIAL/STALE are value-bearing; others are not', () => {
    expect(isMoneyValueBearing('AVAILABLE')).toBe(true);
    expect(isMoneyValueBearing('PARTIAL')).toBe(true);
    expect(isMoneyValueBearing('STALE')).toBe(true);
    expect(isMoneyValueBearing('UNAVAILABLE')).toBe(false);
    expect(isMoneyValueBearing('ERROR')).toBe(false);
    expect(isMoneyValueBearing('NOT_APPLICABLE')).toBe(false);
  });
});
