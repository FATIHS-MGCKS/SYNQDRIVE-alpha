import { describe, expect, it } from 'vitest';
import {
  buildMasterBillingSearch,
  defaultSubTabForSection,
  normalizeMasterBillingSection,
  parseMasterBillingSection,
  parseMasterBillingSubTab,
  readMasterBillingLocation,
  sectionNeedsOperationalData,
  MASTER_BILLING_SECTIONS,
  MASTER_BILLING_PRICING_TABS,
} from './master-billing-navigation';

describe('master billing navigation', () => {
  it('defines six canonical sections in German', () => {
    expect(MASTER_BILLING_SECTIONS).toHaveLength(6);
    expect(MASTER_BILLING_SECTIONS.map((section) => section.label)).toEqual([
      'Übersicht',
      'Verträge',
      'Rechnungen',
      'Tarife & Preise',
      'Abgleich',
      'Audit',
    ]);
  });

  it('maps legacy section ids to canonical sections', () => {
    expect(normalizeMasterBillingSection('organizations')).toBe('subscriptions');
    expect(normalizeMasterBillingSection('invoices-payments')).toBe('invoices');
    expect(normalizeMasterBillingSection('system-sync')).toBe('reconciliation');
  });

  it('parses valid section from search params', () => {
    expect(readMasterBillingLocation('?masterBilling=pricing')).toEqual({
      section: 'pricing',
      subTab: null,
      orgId: null,
      subscriptionId: null,
    });
  });

  it('falls back to overview for unknown section', () => {
    expect(parseMasterBillingSection('unknown')).toBe('overview');
  });

  it('builds deep links with section, sub tab and subscription id', () => {
    expect(
      buildMasterBillingSearch({
        section: 'subscriptions',
        subTab: null,
        subscriptionId: 'org-1',
      }),
    ).toBe('?masterBilling=subscriptions&subscriptionId=org-1');
  });

  it('clears subscription id when explicitly set to null', () => {
    expect(
      buildMasterBillingSearch(
        { subscriptionId: null },
        '?masterBilling=subscriptions&subscriptionId=org-1',
      ),
    ).toBe('?masterBilling=subscriptions');
  });

  it('provides default sub tabs for merged sections', () => {
    expect(defaultSubTabForSection('invoices')).toBe('invoices');
    expect(defaultSubTabForSection('reconciliation')).toBe('drifts');
    expect(defaultSubTabForSection('audit')).toBe('contracts');
    expect(defaultSubTabForSection('pricing')).toBe('products');
    expect(defaultSubTabForSection('overview')).toBeNull();
  });

  it('parses pricing sub tabs', () => {
    const allowed = MASTER_BILLING_PRICING_TABS.map((tab) => tab.id);
    expect(parseMasterBillingSubTab('simulation', allowed, 'products')).toBe('simulation');
    expect(parseMasterBillingSubTab('invalid', allowed, 'products')).toBe('products');
  });

  it('marks overview and subscriptions as operational-data sections', () => {
    expect(sectionNeedsOperationalData('overview')).toBe(true);
    expect(sectionNeedsOperationalData('subscriptions')).toBe(true);
    expect(sectionNeedsOperationalData('invoices')).toBe(false);
    expect(sectionNeedsOperationalData('pricing')).toBe(false);
    expect(sectionNeedsOperationalData('reconciliation')).toBe(false);
    expect(sectionNeedsOperationalData('audit')).toBe(false);
  });
});
