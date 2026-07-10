import { describe, expect, it } from 'vitest';

import {
  formatMoneyCents,
  formatMoneyMajorUnits,
  normalizeCurrencyCode,
  resolvePricingCurrency,
} from './money';

describe('money', () => {
  it('resolves simulation currency over price book', () => {
    expect(resolvePricingCurrency({ currency: 'USD' }, { currency: 'EUR' })).toBe('USD');
    expect(resolvePricingCurrency(null, { currency: 'eur' })).toBe('EUR');
  });

  it('formats EUR and USD deposits without conversion', () => {
    expect(formatMoneyCents(50000, 'EUR')).toMatch(/500,00\s*€/);
    expect(formatMoneyCents(50000, 'USD')).toMatch(/500,00\s*\$/);
    expect(formatMoneyCents(50000, 'EUR')).not.toBe(formatMoneyCents(50000, 'USD'));
  });

  it('does not implicitly convert amounts between currencies', () => {
    const cents = 50000;
    expect(formatMoneyCents(cents, 'USD')).not.toBe(formatMoneyCents(cents, 'EUR'));
  });

  it('formats major units from simulation totals', () => {
    expect(formatMoneyMajorUnits(177.5, 'EUR')).toMatch(/177,50\s*€/);
  });

  it('rejects invalid currency codes for display', () => {
    expect(normalizeCurrencyCode('EURO')).toBeNull();
    expect(formatMoneyCents(1000, 'EURO')).toBe('—');
  });

  it('returns null when pricing currency is missing', () => {
    expect(resolvePricingCurrency(null, null)).toBeNull();
    expect(resolvePricingCurrency({}, { currency: '' })).toBeNull();
  });
});
