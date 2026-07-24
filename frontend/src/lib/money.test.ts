import { describe, expect, it } from 'vitest';

import {
  addMoney,
  formatMoneyCents,
  formatMoneyMinor,
  majorUnitsFromCents,
  moneyFromMinor,
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
    expect(formatMoneyCents(17750, 'EUR')).toMatch(/177,50\s*€/);
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

describe('shared money domain (frontend re-export)', () => {
  it('adds money in minor units', () => {
    expect(addMoney(moneyFromMinor(100, 'EUR'), moneyFromMinor(250, 'EUR'))).toEqual(
      moneyFromMinor(350, 'EUR'),
    );
  });

  it('exposes display-only major unit conversion', () => {
    expect(majorUnitsFromCents(999, 'EUR')).toBe(9.99);
  });

  it('formats JPY without cent assumption', () => {
    expect(formatMoneyMinor(1000, 'JPY', 'de-DE')).toMatch(/1\.000/);
  });
});
