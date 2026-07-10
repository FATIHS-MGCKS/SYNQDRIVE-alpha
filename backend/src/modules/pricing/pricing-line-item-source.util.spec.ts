import {
  buildPricingLineMetadata,
  lineItemMatchesSourceId,
  PRICING_LINE_SOURCE_TYPES,
  resolveLineItemSourceId,
} from './pricing-line-item-source.util';

describe('pricing-line-item-source.util', () => {
  it('builds canonical metadata with legacy optionId', () => {
    const meta = buildPricingLineMetadata({
      sourceType: PRICING_LINE_SOURCE_TYPES.TARIFF_EXTRA,
      sourceId: 'extra-1',
      lineItemType: 'EXTRA',
      label: 'GPS',
      quantity: 1,
      unitAmountCents: 500,
      totalAmountCents: 595,
      currency: 'EUR',
      pricingType: 'PER_BOOKING',
    });
    expect(meta.sourceId).toBe('extra-1');
    expect(meta.optionId).toBe('extra-1');
    expect(meta.currency).toBe('EUR');
  });

  it('resolves sourceId from legacy packageId', () => {
    expect(resolveLineItemSourceId({ packageId: 'pkg-1' })).toBe('pkg-1');
    expect(resolveLineItemSourceId({ sourceId: 'pkg-2', packageId: 'pkg-1' })).toBe('pkg-2');
  });

  it('matches line items by source id', () => {
    expect(
      lineItemMatchesSourceId(
        { metadataJson: { sourceId: 'extra-abc', lineItemType: 'EXTRA' } },
        'extra-abc',
      ),
    ).toBe(true);
  });
});
