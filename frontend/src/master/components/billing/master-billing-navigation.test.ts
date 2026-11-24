import { describe, expect, it } from 'vitest';
import { buildMasterBillingSearch, readMasterBillingLocation } from './master-billing-navigation';

describe('master-billing-navigation', () => {
  it('round-trips credit-notes invoice sub-tab', () => {
    const search = buildMasterBillingSearch({
      section: 'invoices',
      subTab: 'credit-notes',
      orgId: null,
      subscriptionId: null,
    });
    const location = readMasterBillingLocation(search);
    expect(location.section).toBe('invoices');
    expect(location.subTab).toBe('credit-notes');
  });

  it('preserves pricing product key deep link', () => {
    const search = buildMasterBillingSearch({
      section: 'pricing',
      subTab: 'versions',
      pricingProductKey: 'RENTAL',
      orgId: null,
      subscriptionId: null,
    });
    const location = readMasterBillingLocation(search);
    expect(location.pricingProductKey).toBe('RENTAL');
  });
});