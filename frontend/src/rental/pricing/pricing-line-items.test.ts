import { describe, expect, it } from 'vitest';
import type { PricingLineItem } from './pricingTypes';
import { findLineItemBySourceId, resolveLineItemSourceId } from './pricingLineItems';

describe('pricingLineItems source identity', () => {
  const lines: PricingLineItem[] = [
    {
      type: 'EXTRA',
      label: 'Child seat',
      quantity: 1,
      unitPriceCents: 500,
      totalNetCents: 500,
      taxRatePercent: 19,
      totalGrossCents: 595,
      metadataJson: {
        sourceType: 'TARIFF_EXTRA',
        sourceId: 'extra-a',
        lineItemType: 'EXTRA',
        label: 'Child seat',
      },
    },
    {
      type: 'EXTRA',
      label: 'Child seat',
      quantity: 1,
      unitPriceCents: 700,
      totalNetCents: 700,
      taxRatePercent: 19,
      totalGrossCents: 833,
      metadataJson: {
        sourceType: 'TARIFF_EXTRA',
        sourceId: 'extra-b',
        lineItemType: 'EXTRA',
        label: 'Child seat',
      },
    },
  ];

  it('resolves duplicate labels by stable source id', () => {
    expect(findLineItemBySourceId(lines, 'extra-b')?.totalGrossCents).toBe(833);
    expect(resolveLineItemSourceId(lines[0].metadataJson)).toBe('extra-a');
  });

  it('reads legacy optionId metadata', () => {
    expect(resolveLineItemSourceId({ optionId: 'legacy-1' })).toBe('legacy-1');
  });
});
