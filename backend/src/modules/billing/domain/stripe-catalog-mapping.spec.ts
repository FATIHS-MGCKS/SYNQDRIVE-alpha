import {
  BillingInterval,
  BillingModel,
  BillingStripeMode,
} from '@prisma/client';
import {
  assertCurrencyMatches,
  assertIntervalMatches,
  assertRuntimeStripeMode,
  isModernBillingContract,
  normalizeCurrency,
} from './stripe-catalog-mapping';

describe('stripe-catalog-mapping domain', () => {
  it('detects modern billing contracts by assigned price version', () => {
    expect(isModernBillingContract({ subscriptionPriceVersionId: 'ver-1' })).toBe(true);
    expect(isModernBillingContract({ subscriptionItemPriceVersionId: 'ver-1' })).toBe(true);
    expect(isModernBillingContract({})).toBe(false);
  });

  it('normalizes currency codes', () => {
    expect(normalizeCurrency('eur')).toBe('EUR');
  });

  it('rejects runtime stripe mode mismatch', () => {
    expect(() =>
      assertRuntimeStripeMode(BillingStripeMode.LIVE, BillingStripeMode.TEST),
    ).toThrow(expect.objectContaining({ code: 'STRIPE_CATALOG_MODE_MISMATCH' }));
  });

  it('rejects currency mismatch', () => {
    expect(() => assertCurrencyMatches('EUR', 'USD')).toThrow(
      expect.objectContaining({ code: 'STRIPE_CATALOG_CURRENCY_MISMATCH' }),
    );
  });

  it('rejects interval mismatch', () => {
    expect(() =>
      assertIntervalMatches(BillingInterval.MONTHLY, BillingInterval.YEARLY),
    ).toThrow(expect.objectContaining({ code: 'STRIPE_CATALOG_INTERVAL_MISMATCH' }));
  });
});
