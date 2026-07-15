import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TENANT_BILLING_SUB_TAB_PARAM,
  TENANT_SUBSCRIPTION_SUB_TABS,
  buildTenantBillingSubTabSearch,
  parseTenantSubscriptionSubTab,
  readTenantBillingSubTab,
} from './tenant-billing-navigation';

const billingDir = resolve(import.meta.dirname);

describe('tenant billing navigation', () => {
  it('defines five German subscription sub-tabs', () => {
    expect(TENANT_SUBSCRIPTION_SUB_TABS).toHaveLength(5);
    expect(TENANT_SUBSCRIPTION_SUB_TABS.map((tab) => tab.label)).toEqual([
      'Übersicht',
      'Tarif & Fahrzeuge',
      'Zusatzmodule',
      'Rechnungen',
      'Zahlungsmethode',
    ]);
  });

  it('parses valid sub-tab from search params', () => {
    expect(readTenantBillingSubTab(`?${TENANT_BILLING_SUB_TAB_PARAM}=invoices`)).toBe('invoices');
    expect(readTenantBillingSubTab(`?${TENANT_BILLING_SUB_TAB_PARAM}=payment-method`)).toBe(
      'payment-method',
    );
  });

  it('falls back to overview for unknown sub-tab', () => {
    expect(parseTenantSubscriptionSubTab('unknown')).toBe('overview');
    expect(readTenantBillingSubTab('?billingSubTab=invalid')).toBe('overview');
  });

  it('builds deep links preserving other query params', () => {
    expect(
      buildTenantBillingSubTabSearch('tariff-vehicles', '?settingsTab=billing&billingSection=subscription'),
    ).toBe('?settingsTab=billing&billingSection=subscription&billingSubTab=tariff-vehicles');
  });

  it('uses scrollable tab bar layout for mobile', () => {
    const source = readFileSync(resolve(billingDir, 'TenantSubscriptionTabBar.tsx'), 'utf8');
    expect(source).toContain('CHROME_TAB_BAR_SCROLL_CLASS');
    expect(source).toContain('max-sm:px-3');
    expect(source).toContain('data-testid="tenant-subscription-subtab-bar"');
  });
});
