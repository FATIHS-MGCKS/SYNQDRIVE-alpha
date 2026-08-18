import { describe, expect, it } from 'vitest';
import { MASTER_BILLING_RECONCILIATION_TABS } from './master-billing-navigation';

describe('master billing invoices and reconciliation navigation', () => {
  it('exposes reconciliation sub tabs for the canonical Abgleich section', () => {
    expect(MASTER_BILLING_RECONCILIATION_TABS.map((tab) => tab.id)).toEqual([
      'drifts',
      'platform-sync',
      'webhooks',
    ]);
  });
});
