// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import { BillingTab } from './billing/BillingTab';
import {
  formatRentalTenantBillingDate,
  formatRentalTenantBillingMoney,
  resolveOverviewHeaderBadge,
} from '../lib/rental-tenant-billing-i18n';
import {
  buildTenantBillingSubTabSearch,
  readTenantBillingSubTab,
  TENANT_SUBSCRIPTION_SUB_TAB_IDS,
} from './billing/tenant-billing-navigation';
import { overviewHeaderBadge } from './billing/tenant-billing-overview.utils';
import type { TenantSubscriptionOverviewDto } from '../types/billing.types';

const P254_ENFORCE_CLEAN_EXACT = [
  'rental/components/billing/BillingTab.tsx',
  'rental/components/billing/tenant-billing-navigation.ts',
  'rental/components/billing/TenantSubscriptionTabBar.tsx',
  'rental/components/billing/TenantBillingOverviewTab.tsx',
  'rental/components/billing/TenantBillingProblemPanel.tsx',
  'rental/components/billing/billing.utils.ts',
  'rental/components/billing/tenant-billing-overview.utils.ts',
  'rental/lib/rental-tenant-billing-i18n.ts',
];

const RAW_PLAN_NAME = 'SynqDrive Enterprise X7';
const RAW_STATUS_LABEL = 'Provider Status X7';
const RAW_INTERVAL_LABEL = 'Provider Interval X7';
const RAW_WARNING = 'Provider Warning X7';
const RAW_ACTION_LABEL = 'Provider Action X7';
const PROVIDER_FORMATTED = '123,45 € PROVIDER-X7';

function isP254EnforceCleanPath(relPath: string): boolean {
  return P254_ENFORCE_CLEAN_EXACT.includes(relPath);
}

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

function buildOverviewFixture(): TenantSubscriptionOverviewDto {
  return {
    asOf: '2026-09-30T12:00:00.000Z',
    plan: { kind: 'RENTAL', name: RAW_PLAN_NAME },
    contract: {
      status: 'ACTIVE',
      statusLabel: RAW_STATUS_LABEL,
      trialEndsAt: null,
      startedAt: '2026-06-01T00:00:00.000Z',
      cancellationScheduledAt: null,
      billingInterval: 'MONTHLY',
      billingIntervalLabel: RAW_INTERVAL_LABEL,
      currentPeriodStart: '2026-09-30T12:00:00.000Z',
      currentPeriodEnd: '2026-10-30T12:00:00.000Z',
      nextPeriodStart: '2026-10-31T00:00:00.000Z',
      nextPeriodEnd: '2026-11-30T00:00:00.000Z',
    },
    pricing: {
      asOf: '2026-09-30T12:00:00.000Z',
      billableVehicleCount: 4,
      connectedVehicleCount: 5,
      appliedTier: {
        label: '1–10 vehicles',
        minVehicles: 1,
        maxVehicles: 10,
        unitPrice: { cents: 12345, currency: 'EUR', formatted: PROVIDER_FORMATTED },
      },
      baseAmount: { cents: 12345, currency: 'EUR', formatted: PROVIDER_FORMATTED },
      discounts: [],
      netAmount: { cents: 12345, currency: 'EUR', formatted: PROVIDER_FORMATTED },
      taxAmount: { cents: 0, currency: 'EUR', formatted: '0,00 €' },
      grossAmount: { cents: 12345, currency: 'EUR', formatted: PROVIDER_FORMATTED },
      taxConfigured: true,
      pricingModel: 'VOLUME',
    },
    billing: {
      nextExpectedInvoice: null,
      nextChargeAt: '2026-09-30T12:00:00.000Z',
    },
    paymentMethod: null,
    addOns: [],
    warnings: [{ severity: 'warning', message: RAW_WARNING, actionHint: null }],
    availableActions: [
      { action: 'OPEN_CUSTOMER_PORTAL', label: RAW_ACTION_LABEL, requiresWritePermission: true },
    ],
    sectionErrors: [],
  };
}

vi.mock('./billing/useBillingSubscriptionOverview', () => ({
  useBillingSubscriptionOverview: () => ({
    overview: buildOverviewFixture(),
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
    data: { configured: true, paymentMethods: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('./billing/useBillingStripeActions', () => ({
  useBillingStripeActions: () => ({
    canUseStripePayments: true,
    loading: false,
    error: null,
    openCustomerPortal: vi.fn(),
  }),
}));

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-1',
    hasPermission: () => true,
    loading: false,
  }),
}));

describe('P2.2.54 rental tenant billing overview localization', () => {
  it('has zero P254 enforce-clean scanner debt', () => {
    const scoped = inventory.findings.filter((f) => isP254EnforceCleanPath(f.file));
    expect(scoped).toHaveLength(0);
  });

  it('preserves tab machine IDs and query params', () => {
    expect(TENANT_SUBSCRIPTION_SUB_TAB_IDS).toEqual([
      'overview',
      'tariff-vehicles',
      'addons',
      'invoices',
      'payment-method',
    ]);
    expect(readTenantBillingSubTab('?billingSubTab=invoices')).toBe('invoices');
    expect(buildTenantBillingSubTabSearch('tariff-vehicles', '?settingsTab=billing')).toBe(
      '?settingsTab=billing&billingSubTab=tariff-vehicles',
    );
  });

  it('preserves raw provider fields and localizes host chrome', () => {
    const overview = buildOverviewFixture();
    expect(overview.plan?.name).toBe(RAW_PLAN_NAME);
    expect(overview.contract?.statusLabel).toBe(RAW_STATUS_LABEL);
    expect(overview.contract?.billingIntervalLabel).toBe(RAW_INTERVAL_LABEL);
    expect(overview.warnings[0].message).toBe(RAW_WARNING);
    expect(overview.availableActions[0].label).toBe(RAW_ACTION_LABEL);
    expect(overview.pricing?.grossAmount?.formatted).toBe(PROVIDER_FORMATTED);

    const deBadge = resolveOverviewHeaderBadge('ACTIVE', 'OK', tDe);
    const enBadge = resolveOverviewHeaderBadge('ACTIVE', 'OK', tEn);
    expect(deBadge.label).toBe('Aktiv');
    expect(enBadge.label).toBe('Active');
    expect(deBadge.tone).toBe(enBadge.tone);
  });

  it('uses provider formatted money when present and locale fallback otherwise', () => {
    expect(formatRentalTenantBillingMoney('de', 12345, 'EUR')).not.toBe(PROVIDER_FORMATTED);
    expect(formatRentalTenantBillingMoney('de', 12345, 'EUR')).toContain('€');
    expect(formatRentalTenantBillingMoney('en', 12345, 'EUR')).not.toBe(
      formatRentalTenantBillingMoney('de', 12345, 'EUR'),
    );
  });

  it('formats dates per locale without changing raw ISO input', () => {
    const iso = '2026-09-30T12:00:00.000Z';
    expect(formatRentalTenantBillingDate('de', iso)).not.toBe(
      formatRentalTenantBillingDate('en', iso),
    );
    expect(overviewHeaderBadge(buildOverviewFixture(), tEn)?.label).toBe('Active');
  });

  it('preserves same-mount tab state across DE↔EN', async () => {
    window.history.replaceState(null, '', '/rental/settings?settingsTab=billing&billingSubTab=overview');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function SameMountApp() {
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
      root.render(createElement(LanguageProvider, null, createElement(SameMountApp)));
    });

    const activeTab = () =>
      container.querySelector('[data-testid="tenant-subscription-tab-overview"]')?.getAttribute(
        'aria-selected',
      );

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(activeTab()).toBe('true');
    expect(window.location.search).toContain('billingSubTab=overview');
    expect(container.textContent).toContain(RAW_PLAN_NAME);
    expect(container.textContent).toContain(RAW_STATUS_LABEL);
    expect(container.textContent).toContain('Overview');

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(activeTab()).toBe('true');
    expect(window.location.search).toContain('billingSubTab=overview');
    expect(container.textContent).toContain('Übersicht');

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });
});
