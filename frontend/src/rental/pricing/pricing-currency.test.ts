import { describe, expect, it } from 'vitest';

import { formatDepositCents, resolvePricingCurrency } from '../pricing/pricingUtils';
import { formatMoneyCents } from '../../lib/money';

describe('pricing currency display', () => {
  it('resolves simulation currency before price book', () => {
    expect(resolvePricingCurrency({ currency: 'USD' }, { currency: 'EUR' })).toBe('USD');
  });

  it('formats deposit correctly in EUR and USD without conversion', () => {
    expect(formatDepositCents(50000, 'EUR')).toMatch(/500,00\s*€/);
    expect(formatDepositCents(50000, 'USD')).toMatch(/500,00\s*\$/);
    expect(formatDepositCents(50000, 'USD')).not.toBe(formatDepositCents(50000, 'EUR'));
  });

  it('passes currency explicitly to formatters', () => {
    expect(formatMoneyCents(17700, 'EUR')).not.toBe(formatMoneyCents(17700, 'USD'));
  });
});
