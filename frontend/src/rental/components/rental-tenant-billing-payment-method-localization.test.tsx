// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import { BillingTab } from './billing/BillingTab';
import { TenantPaymentMethodsSection } from './billing/TenantPaymentMethodsSection';
import {
  formatPaymentMethodDisplayLocalized,
  resolvePaymentMethodBillingStateLabel,
} from '../lib/rental-tenant-billing-i18n';
import { paymentMethodBillingStateTone } from './billing/tenant-payment-methods.utils';
import type { TenantPaymentMethodDto } from '../types/billing.types';

const P257_ENFORCE_CLEAN_EXACT = [
  'rental/components/billing/TenantBillingPaymentMethodTab.tsx',
  'rental/components/billing/TenantPaymentMethodsSection.tsx',
  'rental/components/billing/tenant-payment-methods.utils.ts',
  'rental/components/billing/billing-stripe-ui.ts',
  'rental/components/billing/useBillingPaymentMethodActions.ts',
  'rental/components/billing/useBillingStripeActions.ts',
];

const P256_ENFORCE_CLEAN_EXACT = [
  'rental/components/billing/TenantInvoicesSection.tsx',
  'rental/components/billing/TenantInvoiceDetailDrawer.tsx',
  'rental/components/billing/tenant-invoices.utils.ts',
  'rental/components/billing/useBillingInvoiceDetail.ts',
];

const PAYMENT_METHOD_ID = 'pm_provider_X7';
const RAW_BRAND = 'visa';
const RAW_LAST4 = '4242';
const RAW_TYPE_LABEL = 'Provider Payment Type X7';
const RAW_BANK_NAME = 'Provider Bank X7';
const RAW_MANDATE_LABEL = 'Provider Mandate Status X7';
const PROVIDER_TYPE_LABEL = RAW_TYPE_LABEL;

const cardMethod: TenantPaymentMethodDto = {
  id: PAYMENT_METHOD_ID,
  type: 'CARD',
  typeLabel: RAW_TYPE_LABEL,
  brand: RAW_BRAND,
  last4: RAW_LAST4,
  expMonth: 12,
  expYear: 2028,
  bankName: null,
  mandateStatusLabel: null,
  isDefault: true,
  statusLabel: 'Provider Payment Method Status X7',
  billingState: 'READY',
};

const sepaMethod: TenantPaymentMethodDto = {
  id: 'pm_sepa_x7',
  type: 'SEPA_DEBIT',
  typeLabel: RAW_TYPE_LABEL,
  brand: null,
  last4: '3000',
  expMonth: null,
  expYear: null,
  bankName: RAW_BANK_NAME,
  mandateStatusLabel: RAW_MANDATE_LABEL,
  isDefault: false,
  statusLabel: 'Provider Payment Method Status X7',
  billingState: 'REQUIRES_ACTION',
};

const paymentMethods = [cardMethod, sepaMethod];
const reloadPaymentMethods = vi.fn();
const setDefaultSpy = vi.fn(async () => true);
const detachSpy = vi.fn(async () => true);
const openPortalSpy = vi.fn();

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

const tDe = translate(de);
const tEn = translate(en);

vi.mock('./billing/useBillingSubscriptionOverview', () => ({
  useBillingSubscriptionOverview: () => ({
    overview: null,
    summary: { stripeConfigured: true, stripePortalPrepared: true },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('./billing/useBillingTariffVehicles', () => ({
  useBillingTariffVehicles: () => ({ reloadAll: vi.fn() }),
}));

vi.mock('./billing/useBillingInvoices', () => ({
  useBillingInvoices: () => ({
    invoices: [],
    loading: false,
    error: null,
    meta: null,
    query: {},
    setQuery: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock('./billing/useBillingPaymentMethods', () => ({
  useBillingPaymentMethods: () => ({
    data: { configured: true, defaultMethodId: PAYMENT_METHOD_ID, paymentMethods },
    loading: false,
    error: null,
    reload: reloadPaymentMethods,
  }),
}));

vi.mock('./billing/useBillingPaymentMethodActions', () => ({
  useBillingPaymentMethodActions: () => ({
    loadingId: PAYMENT_METHOD_ID,
    error: null,
    clearError: vi.fn(),
    setDefault: setDefaultSpy,
    detach: detachSpy,
    canWrite: true,
  }),
}));

vi.mock('./billing/useBillingStripeActions', () => ({
  useBillingStripeActions: () => ({
    canUseStripePayments: true,
    loading: true,
    error: null,
    openCustomerPortal: openPortalSpy,
  }),
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-1',
    hasPermission: () => true,
    loading: false,
  }),
}));

describe('P2.2.57 rental tenant billing payment method localization', () => {
  beforeEach(() => {
    reloadPaymentMethods.mockClear();
    setDefaultSpy.mockClear();
    detachSpy.mockClear();
    openPortalSpy.mockClear();
    window.history.replaceState(
      null,
      '',
      '/settings?settingsTab=billing&billingSubTab=payment-method',
    );
  });

  it('has zero P257 enforce-clean scanner debt on active paths', () => {
    const scoped = inventory.findings.filter((f) => P257_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(scoped).toHaveLength(0);
  });

  it('certifies dead legacy payment components remain untouched', () => {
    const legacyCard = readFileSync(
      resolve(import.meta.dirname, 'billing/BillingPaymentMethodCard.tsx'),
      'utf8',
    );
    expect(legacyCard).toContain('Zahlungsmethode');
    expect(legacyCard).toContain('stripeStateLabel(stripeState)');
  });

  it('certifies P256 invoice paths remain semantically unchanged', () => {
    const invoiceSection = readFileSync(
      resolve(import.meta.dirname, 'billing/TenantInvoicesSection.tsx'),
      'utf8',
    );
    expect(invoiceSection).toContain("t('tenantBilling.invoices.list.title')");
    expect(invoiceSection).not.toContain('paymentMethod');
    const p256Debt = inventory.findings.filter((f) => P256_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(p256Debt).toHaveLength(0);
  });

  it('preserves raw brand, last4, typeLabel, bankName and mandate labels', () => {
    const cardDisplay = formatPaymentMethodDisplayLocalized(cardMethod, tEn);
    expect(cardDisplay.title).toContain(RAW_BRAND);
    expect(cardDisplay.title).toContain(RAW_LAST4);
    expect(cardDisplay.subtitle).toBe(RAW_TYPE_LABEL);
    expect(cardDisplay.detail).toContain('12/2028');

    const sepaDisplay = formatPaymentMethodDisplayLocalized(sepaMethod, tEn);
    expect(sepaDisplay.title).toContain(RAW_BANK_NAME);
    expect(sepaDisplay.subtitle).toBe(RAW_TYPE_LABEL);
    expect(sepaDisplay.detail).toContain(RAW_MANDATE_LABEL);
  });

  it('localizes billing state labels without changing tone machine', () => {
    expect(paymentMethodBillingStateTone('READY')).toBe('sq-tone-success');
    expect(paymentMethodBillingStateTone('REQUIRES_ACTION')).toBe('sq-tone-warning');
    expect(resolvePaymentMethodBillingStateLabel('READY', tEn)).toBe(
      en['tenantBilling.paymentMethod.state.ready'],
    );
    expect(resolvePaymentMethodBillingStateLabel('READY', tDe)).toBe(
      de['tenantBilling.paymentMethod.state.ready'],
    );
  });

  it('localizes section chrome in EN while preserving raw provider fields in DOM', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function EnSection() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(TenantPaymentMethodsSection, {
          paymentMethods,
          stripeState: 'configured',
          canUseStripePayments: true,
          canWrite: true,
          loadingId: null,
          actionError: null,
          portalLoading: false,
          portalError: null,
          onOpenPortal: openPortalSpy,
          onSetDefault: setDefaultSpy,
          onDetach: detachSpy,
        }),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(EnSection)));
    });
    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(container.textContent).toContain(en['tenantBilling.paymentMethod.section.title']);
    expect(container.textContent).toContain(RAW_BRAND);
    expect(container.textContent).toContain(RAW_LAST4);
    expect(container.textContent).toContain(PROVIDER_TYPE_LABEL);
    expect(container.textContent).toContain(RAW_BANK_NAME);
    expect(container.textContent).toContain(RAW_MANDATE_LABEL);

    root.unmount();
    container.remove();
  });

  it('preserves payment-method tab same-mount state across DE→EN→DE', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function BillingSurface() {
      const { setLocale } = useLanguage();
      return createElement(
        'div',
        null,
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-de',
          onClick: () => setLocale('de'),
        }),
        createElement('button', {
          type: 'button',
          'data-testid': 'locale-en',
          onClick: () => setLocale('en'),
        }),
        createElement(BillingTab),
      );
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(BillingSurface)));
    });

    expect(window.location.search).toContain('billingSubTab=payment-method');
    expect(container.textContent).toContain(RAW_BRAND);
    expect(container.textContent).toContain(RAW_LAST4);

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(container.textContent).toContain(en['tenantBilling.paymentMethod.section.title']);
    expect(container.textContent).toContain(RAW_BRAND);

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(window.location.search).toContain('billingSubTab=payment-method');
    expect(container.textContent).toContain(de['tenantBilling.paymentMethod.section.title']);
    expect(container.textContent).toContain(RAW_BRAND);
    expect(reloadPaymentMethods).not.toHaveBeenCalled();
    expect(setDefaultSpy).not.toHaveBeenCalled();
    expect(detachSpy).not.toHaveBeenCalled();
    expect(openPortalSpy).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it('has no locale-based React keys in P257 paths', () => {
    for (const relPath of P257_ENFORCE_CLEAN_EXACT) {
      const source = readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
      expect(source).not.toMatch(/key=\{locale\}/);
      expect(source).not.toMatch(/key=\{t\(/);
      expect(source).not.toMatch(/key=\{translatedLabel\}/);
    }
  });
});
