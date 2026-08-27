import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TENANT_BILLING_SUB_TAB_PARAM,
  TENANT_SUBSCRIPTION_SUB_TAB_IDS,
  TENANT_SUBSCRIPTION_SUB_TABS,
  buildTenantBillingSubTabSearch,
  parseTenantSubscriptionSubTab,
  readTenantBillingSubTab,
} from './tenant-billing-navigation';

const billingDir = resolve(import.meta.dirname);

describe('tenant billing navigation', () => {
  it('defines five stable subscription sub-tab machine IDs', () => {
    expect(TENANT_SUBSCRIPTION_SUB_TAB_IDS).toEqual([
      'overview',
      'tariff-vehicles',
      'addons',
      'invoices',
      'payment-method',
    ]);
    expect(TENANT_SUBSCRIPTION_SUB_TABS.map((tab) => tab.id)).toEqual(
      TENANT_SUBSCRIPTION_SUB_TAB_IDS,
    );
    expect(TENANT_SUBSCRIPTION_SUB_TABS.every((tab) => tab.label === tab.id)).toBe(true);
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
      buildTenantBillingSubTabSearch('tariff-vehicles', '?settingsTab=billing'),
    ).toBe('?settingsTab=billing&billingSubTab=tariff-vehicles');
  });

  it('uses scrollable tab bar layout for mobile', () => {
    const source = readFileSync(resolve(billingDir, 'TenantSubscriptionTabBar.tsx'), 'utf8');
    expect(source).toContain('CHROME_TAB_BAR_SCROLL_CLASS');
    expect(source).toContain('max-sm:px-3');
    expect(source).toContain('data-testid="tenant-subscription-subtab-bar"');
    expect(source).not.toContain('truncate');
    expect(source).toContain('resolveTenantBillingTabLabel');
  });

  it('uses mobile-safe layout in BillingTab shell', () => {
    const source = readFileSync(resolve(billingDir, 'BillingTab.tsx'), 'utf8');
    expect(source).toContain('safe-area-inset-bottom');
    expect(source).toContain('TenantBillingProblemPanel');
    expect(source).toContain('TenantSubscriptionTabBar');
    expect(source).toContain('overviewHeaderBadge(overview, t)');
  });
});
