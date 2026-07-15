import { BillingStripeMode } from '@prisma/client';
import {
  StripeCatalogSyncErrorCode,
  StripeCatalogSyncMetadataKeys,
  assertStripeMetadataMatches,
  assertStripePriceMatchesLocal,
  buildStripeCatalogPriceIdempotencyKey,
  buildStripeCatalogPriceMetadata,
  buildStripeCatalogProductIdempotencyKey,
  buildStripeCatalogProductMetadata,
  resolveCatalogStripeUnitAmountCents,
  stripeModeToEnvironment,
  translateStripeProviderError,
} from './stripe-catalog-sync';

describe('stripe-catalog-sync domain', () => {
  it('builds stable product and price idempotency keys', () => {
    expect(
      buildStripeCatalogProductIdempotencyKey('prod-1', BillingStripeMode.TEST),
    ).toBe('stripe-catalog-sync:product:prod-1:TEST:v1');
    expect(buildStripeCatalogPriceIdempotencyKey('ver-1', BillingStripeMode.LIVE)).toBe(
      'stripe-catalog-sync:price:ver-1:LIVE:v1',
    );
  });

  it('builds required stripe metadata keys', () => {
    const productMetadata = buildStripeCatalogProductMetadata({
      billingProductId: 'bprod-1',
      productKey: 'RENTAL',
      stripeMode: BillingStripeMode.TEST,
    });
    expect(productMetadata[StripeCatalogSyncMetadataKeys.billingProductId]).toBe('bprod-1');
    expect(productMetadata[StripeCatalogSyncMetadataKeys.productKey]).toBe('RENTAL');
    expect(productMetadata[StripeCatalogSyncMetadataKeys.environment]).toBe('test');
    expect(productMetadata[StripeCatalogSyncMetadataKeys.schemaVersion]).toBe('1');

    const priceMetadata = buildStripeCatalogPriceMetadata({
      billingProductId: 'bprod-1',
      productKey: 'RENTAL',
      priceVersionId: 'ver-1',
      stripeMode: BillingStripeMode.LIVE,
    });
    expect(priceMetadata[StripeCatalogSyncMetadataKeys.priceVersionId]).toBe('ver-1');
    expect(stripeModeToEnvironment(BillingStripeMode.LIVE)).toBe('live');
  });

  it('resolves entry tier unit amount for stripe catalog price', () => {
    expect(
      resolveCatalogStripeUnitAmountCents([
        { minVehicles: 1, maxVehicles: 10, unitPriceCents: 1500, sortOrder: 0 },
        { minVehicles: 11, maxVehicles: null, unitPriceCents: 1200, sortOrder: 1 },
      ]),
    ).toBe(1500);
  });

  it('rejects missing unit price for sync', () => {
    expect(() =>
      resolveCatalogStripeUnitAmountCents([
        { minVehicles: 1, maxVehicles: null, unitPriceCents: null, sortOrder: 0 },
      ]),
    ).toThrow(
      expect.objectContaining({ code: StripeCatalogSyncErrorCode.UNIT_PRICE_MISSING }),
    );
  });

  it('detects stripe price amount drift without mutating amount', () => {
    expect(() =>
      assertStripePriceMatchesLocal({
        stripePrice: {
          id: 'price_1',
          active: true,
          currency: 'eur',
          unit_amount: 1200,
          product: 'prod_1',
          recurring: { interval: 'month' },
        },
        expectedUnitAmountCents: 1500,
        expectedCurrency: 'EUR',
        expectedInterval: 'month',
        expectedProductId: 'prod_1',
      }),
    ).toThrow(
      expect.objectContaining({ code: StripeCatalogSyncErrorCode.PRICE_AMOUNT_DRIFT }),
    );
  });

  it('detects inconsistent stripe metadata', () => {
    expect(() =>
      assertStripeMetadataMatches(
        { synqdriveBillingProductId: 'other' },
        { synqdriveBillingProductId: 'bprod-1' },
      ),
    ).toThrow(
      expect.objectContaining({ code: StripeCatalogSyncErrorCode.METADATA_INCONSISTENT }),
    );
  });

  it('translates stripe provider errors to domain codes', () => {
    expect(
      translateStripeProviderError({ type: 'StripeRateLimitError', message: 'rate limit' }),
    ).toEqual({
      code: StripeCatalogSyncErrorCode.RATE_LIMITED,
      message: StripeCatalogSyncErrorCode.RATE_LIMITED,
    });

    expect(
      translateStripeProviderError({ type: 'StripeConnectionError', code: 'timeout' }),
    ).toEqual({
      code: StripeCatalogSyncErrorCode.PROVIDER_TIMEOUT,
      message: StripeCatalogSyncErrorCode.PROVIDER_TIMEOUT,
    });

    expect(
      translateStripeProviderError({ type: 'StripeInvalidRequestError', message: 'bad request' }),
    ).toEqual({
      code: StripeCatalogSyncErrorCode.PROVIDER_INVALID_REQUEST,
      message: StripeCatalogSyncErrorCode.PROVIDER_INVALID_REQUEST,
    });
  });
});
