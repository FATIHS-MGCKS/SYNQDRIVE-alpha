import { describe, expect, it } from 'vitest';

import type { PricingLineItem } from './pricingTypes';
import {
  countDepositLineItems,
  sumExtrasGrossCents,
} from './pricingLineItems';
import { formatDepositCents, formatNetAsGross, grossFromNetCents } from './pricingUtils';

const line = (partial: Partial<PricingLineItem> & Pick<PricingLineItem, 'type' | 'totalGrossCents'>): PricingLineItem => ({
  label: partial.label ?? partial.type,
  quantity: partial.quantity ?? 1,
  unitPriceCents: partial.unitPriceCents ?? partial.totalGrossCents,
  totalNetCents: partial.totalNetCents ?? partial.totalGrossCents,
  taxRatePercent: partial.taxRatePercent ?? 19,
  ...partial,
});

describe('deposit display and aggregation', () => {
  it('formats 50000 cents as €500.00 in price book currency', () => {
    expect(formatDepositCents(50000, 'EUR')).toMatch(/500,00\s*€/);
  });

  it('does not apply VAT when formatting deposit (unlike net rates)', () => {
    const depositDisplay = formatDepositCents(50000, 'EUR');
    const wrongNetDisplay = formatNetAsGross(50000, 19, 'EUR');
    expect(depositDisplay).toMatch(/500,00\s*€/);
    expect(wrongNetDisplay).toMatch(/595,00\s*€/);
    expect(grossFromNetCents(50000, 19)).toBe(59500);
  });

  it('tax rate change does not affect deposit formatter output', () => {
    expect(formatDepositCents(50000, 'EUR')).toBe(formatDepositCents(50000, 'EUR'));
    expect(formatNetAsGross(50000, 7, 'EUR')).not.toBe(formatDepositCents(50000, 'EUR'));
  });

  it('sums only mileage, insurance, and extra lines in extrasTotal', () => {
    const items: PricingLineItem[] = [
      line({ type: 'BASE_RENTAL', totalGrossCents: 10000 }),
      line({ type: 'MILEAGE_PACKAGE', totalGrossCents: 2000 }),
      line({ type: 'INSURANCE', totalGrossCents: 3000 }),
      line({ type: 'EXTRA', totalGrossCents: 500 }),
      line({ type: 'DEPOSIT', totalGrossCents: 50000, taxRatePercent: 0 }),
      line({ type: 'DISCOUNT', totalGrossCents: -1000 }),
      line({ type: 'MANUAL_ADJUSTMENT', totalGrossCents: 400 }),
    ];
    expect(sumExtrasGrossCents(items)).toBe(5500);
  });

  it('counts exactly one DEPOSIT line item in typical simulation shape', () => {
    const items: PricingLineItem[] = [
      line({ type: 'BASE_RENTAL', totalGrossCents: 17850 }),
      line({ type: 'DEPOSIT', totalGrossCents: 50000, taxRatePercent: 0 }),
    ];
    expect(countDepositLineItems(items)).toBe(1);
  });
});
