import { isIso4217CurrencyCode } from './iso4217-currency-codes';

describe('iso4217-currency-codes', () => {
  it('accepts canonical active codes', () => {
    expect(isIso4217CurrencyCode('EUR')).toBe(true);
    expect(isIso4217CurrencyCode('usd')).toBe(true);
  });

  it('rejects arbitrary strings', () => {
    expect(isIso4217CurrencyCode('FAKE')).toBe(false);
    expect(isIso4217CurrencyCode('EURO')).toBe(false);
  });
});
