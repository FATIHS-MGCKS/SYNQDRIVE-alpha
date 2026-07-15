import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCustomerPaymentsReturnUrl,
  isLegacyBillingCustomerPaymentsUrl,
  parseFinanceViewFromUrl,
  stripLegacyBillingCustomerPaymentsParams,
} from './finance-navigation';

const rentalDir = resolve(import.meta.dirname);

describe('finance navigation', () => {
  it('detects legacy billing customer-payments deep links', () => {
    expect(isLegacyBillingCustomerPaymentsUrl('?settingsTab=billing&billingSection=customer-payments')).toBe(
      true,
    );
    expect(isLegacyBillingCustomerPaymentsUrl('?settingsTab=billing&billingSection=subscription')).toBe(
      false,
    );
  });

  it('parses finance views from modern and legacy URLs', () => {
    expect(parseFinanceViewFromUrl('?view=customer-payments')).toBe('customer-payments');
    expect(parseFinanceViewFromUrl('?settingsTab=billing&billingSection=customer-payments')).toBe(
      'customer-payments',
    );
    expect(parseFinanceViewFromUrl('?view=invoices')).toBe('invoices');
    expect(parseFinanceViewFromUrl('?settingsTab=billing')).toBeNull();
  });

  it('strips legacy billing customer-payments params', () => {
    expect(
      stripLegacyBillingCustomerPaymentsParams('?settingsTab=billing&billingSection=customer-payments'),
    ).toBe('');
    expect(stripLegacyBillingCustomerPaymentsParams('?settingsTab=billing&billingSubTab=invoices')).toBe(
      '?settingsTab=billing&billingSubTab=invoices',
    );
  });

  it('builds Stripe Connect return URL for finance customer payments', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'https://app.synqdrive.eu',
        pathname: '/rental',
      },
    });
    expect(buildCustomerPaymentsReturnUrl()).toBe('https://app.synqdrive.eu/rental?view=customer-payments');
    vi.unstubAllGlobals();
  });
});

describe('billing vs finance separation', () => {
  it('keeps CustomerPaymentsTab out of BillingTab', () => {
    const billingSource = readFileSync(resolve(rentalDir, 'billing/BillingTab.tsx'), 'utf8');
    expect(billingSource).not.toContain('CustomerPaymentsTab');
    expect(billingSource).not.toContain('BillingSectionTabBar');
    expect(billingSource).toContain('billing.saasOnlyHint');
    expect(billingSource).toContain('TenantSubscriptionTabBar');
  });

  it('renders CustomerPaymentsTab from FinanceView', () => {
    const financeSource = readFileSync(resolve(rentalDir, 'FinanceView.tsx'), 'utf8');
    expect(financeSource).toContain('CustomerPaymentsTab');
    expect(financeSource).toContain('finance.separationHint');
    expect(financeSource).toContain("activeTab === 'customer-payments'");
  });

  it('exposes customer payments in finance sidebar navigation', () => {
    const sidebarSource = readFileSync(resolve(rentalDir, 'Sidebar.tsx'), 'utf8');
    expect(sidebarSource).toContain("handleViewChange('customer-payments')");
    expect(sidebarSource).toContain("hasPermission('payments-connect', 'read')");
    expect(sidebarSource).toContain('nav.customerPayments');
    expect(sidebarSource).toContain("currentView === 'customer-payments'");
  });

  it('gates billing subscription settings on billing.read permission', () => {
    const sidebarSource = readFileSync(resolve(rentalDir, 'Sidebar.tsx'), 'utf8');
    expect(sidebarSource).toContain("hasPermission('billing', 'read')");
    expect(sidebarSource).toContain('canBillingSubscription');
    expect(sidebarSource).toContain("settingsTab === 'billing'");
  });

  it('redirects legacy billingSection customer-payments in App', () => {
    const appSource = readFileSync(resolve(rentalDir, '../App.tsx'), 'utf8');
    expect(appSource).toContain('stripLegacyBillingCustomerPaymentsParams');
    expect(appSource).toContain('parseFinanceViewFromUrl');
    expect(appSource).toContain("'customer-payments'");
  });
});
