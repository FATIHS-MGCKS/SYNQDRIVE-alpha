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
  buildTariffPricingBreakdownRows,
  formatTierRangeDisplay,
  resolveOverviewHeaderBadge,
  resolvePricingModelDisplayLabel,
} from '../lib/rental-tenant-billing-i18n';
import {
  buildTenantBillingSubTabSearch,
  readTenantBillingSubTab,
} from './billing/tenant-billing-navigation';
import type {
  TenantBillableVehicleListItemDto,
  TenantSubscriptionTariffDto,
  TenantVehicleBillingChangeDto,
} from '../types/billing.types';

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

const P255_ENFORCE_CLEAN_EXACT = [
  'rental/components/billing/TenantBillingTariffVehiclesTab.tsx',
  'rental/components/billing/TenantTariffSummarySection.tsx',
  'rental/components/billing/TenantPricingBreakdownSection.tsx',
  'rental/components/billing/TenantBillableVehiclesTable.tsx',
  'rental/components/billing/TenantVehicleChangesSection.tsx',
  'rental/components/billing/BillingPriceTierLadder.tsx',
  'rental/components/billing/tenant-tariff-vehicles.utils.ts',
  'rental/lib/rental-tenant-billing-i18n.ts',
];

const RAW_PLAN_NAME = 'SynqDrive Enterprise X7';
const RAW_INTERVAL_LABEL = 'Provider Interval X7';
const RAW_TIER_LABEL = 'Provider Tier X7';
const RAW_VEHICLE_NAME = 'Mietwagen Sonderfall X7';
const RAW_PLATE = 'KS-FS-7777';
const RAW_REASON = 'Provider Reason X7';
const RAW_DISCOUNT = 'Provider Discount X7';
const PROVIDER_FORMATTED = '123,45 € PROVIDER-X7';

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

const money = (cents: number, formatted: string) => ({
  cents,
  currency: 'EUR',
  formatted,
});

function buildTariffFixture(): TenantSubscriptionTariffDto {
  return {
    asOf: '2026-09-30T12:00:00.000Z',
    tariff: {
      planKind: 'RENTAL',
      planName: RAW_PLAN_NAME,
      billingIntervalLabel: RAW_INTERVAL_LABEL,
      priceVersionLabel: 'Provider Version X7',
      contractStartedAt: '2026-06-01T00:00:00.000Z',
      nextPeriodStart: '2026-10-01T00:00:00.000Z',
      nextPeriodEnd: '2026-10-31T00:00:00.000Z',
      cancellationStatusLabel: 'Provider Cancel X7',
      appliedTierLabel: RAW_TIER_LABEL,
    },
    pricing: {
      calculatedAt: '2026-09-30T12:00:00.000Z',
      billableVehicleCount: 4,
      connectedVehicleCount: 5,
      pricingModel: 'VOLUME',
      appliedTier: {
        label: RAW_TIER_LABEL,
        minVehicles: 1,
        maxVehicles: 10,
        unitPrice: money(12345, PROVIDER_FORMATTED),
      },
      priceTiers: [
        {
          label: RAW_TIER_LABEL,
          minVehicles: 1,
          maxVehicles: 10,
          unitPrice: money(12345, PROVIDER_FORMATTED),
          isCurrent: true,
        },
        {
          label: 'Provider Tier Next',
          minVehicles: 11,
          maxVehicles: null,
          unitPrice: money(10000, '100,00 €'),
          isCurrent: false,
        },
      ],
      tierBreakdown: [],
      baseAmount: money(12345, PROVIDER_FORMATTED),
      discounts: [{ label: RAW_DISCOUNT, amount: money(500, '5,00 €') }],
      netAmount: money(11845, PROVIDER_FORMATTED),
      taxAmount: money(0, '0,00 €'),
      grossAmount: money(12345, PROVIDER_FORMATTED),
      currency: 'EUR',
      taxConfigured: true,
    },
    sectionErrors: [],
  };
}

function buildVehicleFixture(): TenantBillableVehicleListItemDto {
  return {
    id: 'veh-1',
    licensePlate: RAW_PLATE,
    make: 'VW',
    model: 'Golf',
    vehicleLabel: RAW_VEHICLE_NAME,
    stationName: 'Station X7',
    billableFrom: '2026-09-01T00:00:00.000Z',
    billableUntil: null,
    billingStatus: 'BILLABLE',
    billingStatusLabel: 'Provider Status X7',
    reasonLabel: RAW_REASON,
  };
}

function buildChangeFixture(): TenantVehicleBillingChangeDto {
  return {
    id: 'chg-1',
    licensePlate: RAW_PLATE,
    vehicleLabel: RAW_VEHICLE_NAME,
    changeType: 'ADDED',
    eventTypeLabel: 'Provider Event X7',
    effectiveAt: '2026-09-15T00:00:00.000Z',
    prorationAmount: money(12345, PROVIDER_FORMATTED),
    reason: RAW_REASON,
  };
}

const vehicleQuery = { page: 1, pageSize: 10, sort: 'licensePlate' };
const changesQuery = { page: 1, pageSize: 5, sort: '-effectiveAt' };

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
  useBillingTariffVehicles: () => ({
    tariff: buildTariffFixture(),
    tariffLoading: false,
    tariffError: null,
    reloadTariff: vi.fn(),
    vehicles: [buildVehicleFixture()],
    vehiclesMeta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    vehiclesLoading: false,
    vehiclesError: null,
    vehicleQuery,
    setVehicleQuery: vi.fn(),
    reloadVehicles: vi.fn(),
    changes: [buildChangeFixture()],
    changesMeta: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
    changesLoading: false,
    changesError: null,
    changesQuery,
    setChangesQuery: vi.fn(),
    reloadChanges: vi.fn(),
    reloadAll: vi.fn(),
  }),
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

describe('P2.2.55 rental tenant billing tariff & vehicles localization', () => {
  it('has zero P255 enforce-clean scanner debt', () => {
    const scoped = inventory.findings.filter((f) => P255_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(scoped).toHaveLength(0);
  });

  it('has zero P254 enforce-clean regression', () => {
    const scoped = inventory.findings.filter((f) => P254_ENFORCE_CLEAN_EXACT.includes(f.file));
    expect(scoped).toHaveLength(0);
  });

  it('preserves tariff-vehicles sub-tab query semantics', () => {
    expect(readTenantBillingSubTab('?billingSubTab=tariff-vehicles')).toBe('tariff-vehicles');
    expect(buildTenantBillingSubTabSearch('tariff-vehicles', '?settingsTab=billing')).toBe(
      '?settingsTab=billing&billingSubTab=tariff-vehicles',
    );
  });

  it('preserves raw provider fields and localizes host chrome', () => {
    const tariff = buildTariffFixture();
    expect(tariff.tariff?.planName).toBe(RAW_PLAN_NAME);
    expect(tariff.tariff?.billingIntervalLabel).toBe(RAW_INTERVAL_LABEL);
    expect(tariff.tariff?.appliedTierLabel).toBe(RAW_TIER_LABEL);
    expect(tariff.pricing?.grossAmount?.formatted).toBe(PROVIDER_FORMATTED);

    expect(resolvePricingModelDisplayLabel('VOLUME', tDe)).toBe('Mengenpreis');
    expect(resolvePricingModelDisplayLabel('VOLUME', tEn)).toBe('Volume pricing');
    expect(formatTierRangeDisplay(1, 10, tDe)).toBe('1–10 Fahrzeuge');
    expect(formatTierRangeDisplay(1, 10, tEn)).toBe('1–10 vehicles');

    const deBadge = resolveOverviewHeaderBadge('ACTIVE', 'OK', tDe);
    const enBadge = resolveOverviewHeaderBadge('ACTIVE', 'OK', tEn);
    expect(deBadge.label).toBe('Aktiv');
    expect(enBadge.label).toBe('Active');
  });

  it('preserves money formatted precedence in breakdown rows', () => {
    const rows = buildTariffPricingBreakdownRows(buildTariffFixture().pricing, tDe, 'de');
    expect(rows.some((row) => row.value === PROVIDER_FORMATTED)).toBe(true);
    expect(rows.some((row) => row.label === RAW_DISCOUNT)).toBe(true);
  });

  it('preserves same-mount tariff tab state across DE↔EN', async () => {
    window.history.replaceState(
      null,
      '',
      '/rental/settings?settingsTab=billing&billingSubTab=tariff-vehicles',
    );

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

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(window.location.search).toContain('billingSubTab=tariff-vehicles');
    expect(container.textContent).toContain(RAW_PLAN_NAME);
    expect(container.textContent).toContain(RAW_PLATE);
    expect(container.textContent).toContain(RAW_VEHICLE_NAME);
    expect(container.textContent).toContain(RAW_REASON);
    expect(container.textContent).toContain(PROVIDER_FORMATTED);
    expect(container.textContent).toContain('Plan & vehicles');

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(window.location.search).toContain('billingSubTab=tariff-vehicles');
    expect(container.textContent).toContain('Tarif & Fahrzeuge');
    expect(container.textContent).toContain(RAW_PLAN_NAME);

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });
});
