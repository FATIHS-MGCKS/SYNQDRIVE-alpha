import { BadRequestException } from '@nestjs/common';
import {
  assertClientCurrencyMatches,
  normalizeCurrencyCode,
  resolvePriceBookCurrency,
  toBookingCurrencyStorage,
} from './money.util';

describe('money.util', () => {
  describe('normalizeCurrencyCode', () => {
    it('accepts EUR and USD case-insensitively', () => {
      expect(normalizeCurrencyCode('eur')).toBe('EUR');
      expect(normalizeCurrencyCode('Usd')).toBe('USD');
    });

    it('rejects missing currency', () => {
      expect(() => normalizeCurrencyCode('')).toThrow(BadRequestException);
      expect(() => normalizeCurrencyCode(null)).toThrow(BadRequestException);
    });

    it('rejects invalid currency codes', () => {
      expect(() => normalizeCurrencyCode('EURO')).toThrow(BadRequestException);
      expect(() => normalizeCurrencyCode('12')).toThrow(BadRequestException);
    });
  });

  describe('resolvePriceBookCurrency', () => {
    it('returns normalized currency from price book', () => {
      expect(resolvePriceBookCurrency({ currency: 'usd' })).toBe('USD');
    });

    it('throws when price book currency is missing', () => {
      expect(() => resolvePriceBookCurrency({ currency: '' })).toThrow(BadRequestException);
      expect(() => resolvePriceBookCurrency({})).toThrow(BadRequestException);
    });
  });

  describe('assertClientCurrencyMatches', () => {
    it('allows matching client currency', () => {
      expect(() => assertClientCurrencyMatches('eur', 'EUR')).not.toThrow();
    });

    it('rejects mismatched client currency', () => {
      expect(() => assertClientCurrencyMatches('USD', 'EUR')).toThrow(BadRequestException);
    });

    it('ignores omitted client currency', () => {
      expect(() => assertClientCurrencyMatches(undefined, 'EUR')).not.toThrow();
    });
  });

  describe('toBookingCurrencyStorage', () => {
    it('stores lowercase ISO code for booking legacy column', () => {
      expect(toBookingCurrencyStorage('USD')).toBe('usd');
      expect(toBookingCurrencyStorage('eur')).toBe('eur');
    });
  });
});
