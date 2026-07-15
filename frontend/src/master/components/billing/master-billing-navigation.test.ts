import { describe, expect, it } from 'vitest';
import {
  buildMasterBillingSearch,
  defaultSubTabForSection,
  parseMasterBillingSection,
  parseMasterBillingSubTab,
  readMasterBillingLocation,
  sectionNeedsCoreData,
  MASTER_BILLING_SECTIONS,
} from './master-billing-navigation';

describe('master billing navigation', () => {
  it('defines six operational sections in German', () => {
    expect(MASTER_BILLING_SECTIONS).toHaveLength(6);
    expect(MASTER_BILLING_SECTIONS.map((section) => section.label)).toEqual([
      'Übersicht',
      'Unternehmen & Verträge',
      'Tarife & Preise',
      'Rechnungen & Zahlungen',
      'System & Synchronisation',
      'Audit',
    ]);
  });

  it('parses valid section from search params', () => {
    expect(readMasterBillingLocation('?masterBilling=pricing')).toEqual({
      section: 'pricing',
      subTab: null,
      orgId: null,
    });
  });

  it('falls back to overview for unknown section', () => {
    expect(parseMasterBillingSection('unknown')).toBe('overview');
  });

  it('builds deep links with section, sub tab and org id', () => {
    expect(
      buildMasterBillingSearch({
        section: 'invoices-payments',
        subTab: 'payment-methods',
        orgId: 'org-1',
      }),
    ).toBe('?masterBilling=invoices-payments&masterBillingTab=payment-methods&orgId=org-1');
  });

  it('clears org id when explicitly set to null', () => {
    expect(
      buildMasterBillingSearch(
        { orgId: null },
        '?masterBilling=organizations&orgId=org-1',
      ),
    ).toBe('?masterBilling=organizations');
  });

  it('provides default sub tabs for merged sections', () => {
    expect(defaultSubTabForSection('invoices-payments')).toBe('invoices');
    expect(defaultSubTabForSection('system-sync')).toBe('stripe-api');
    expect(defaultSubTabForSection('audit')).toBe('contracts');
    expect(defaultSubTabForSection('overview')).toBeNull();
  });

  it('validates sub tab values against allowed ids', () => {
    expect(parseMasterBillingSubTab('refunds', ['invoices', 'refunds'], 'invoices')).toBe(
      'refunds',
    );
    expect(parseMasterBillingSubTab('invalid', ['invoices', 'refunds'], 'invoices')).toBe(
      'invoices',
    );
  });

  it('marks overview, organizations and invoices-payments as core-data sections', () => {
    expect(sectionNeedsCoreData('overview')).toBe(true);
    expect(sectionNeedsCoreData('organizations')).toBe(true);
    expect(sectionNeedsCoreData('invoices-payments')).toBe(true);
    expect(sectionNeedsCoreData('pricing')).toBe(false);
    expect(sectionNeedsCoreData('system-sync')).toBe(false);
    expect(sectionNeedsCoreData('audit')).toBe(false);
  });
});
