// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MASTER_BILLING_INVOICES_PAYMENTS_TABS, MASTER_BILLING_SYSTEM_SYNC_TABS } from './master-billing-navigation';

describe('master invoices and system sync tabs', () => {
  it('defines invoices payments operational tabs', () => {
    expect(MASTER_BILLING_INVOICES_PAYMENTS_TABS.map((tab) => tab.id)).toEqual([
      'invoices',
      'payment-methods',
      'payment-attempts',
      'refunds',
      'credit-notes',
    ]);
  });

  it('defines system sync operational tabs', () => {
    expect(MASTER_BILLING_SYSTEM_SYNC_TABS.map((tab) => tab.id)).toEqual([
      'stripe-api',
      'webhooks',
      'reconciliation',
      'resend',
      'outbox',
    ]);
  });
});
