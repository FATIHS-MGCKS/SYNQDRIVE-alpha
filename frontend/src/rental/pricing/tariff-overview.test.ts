import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import {
  buildTariffGroupRowView,
  computeTariffCatalogKpis,
  cloneVersionPayloadForNewGroup,
} from './tariff-catalog-metrics';
import type { PriceTariffCatalog, PriceTariffGroup, PriceTariffVersion } from './pricingTypes';

const PRICE_TARIFF_I18N_KEYS = Object.keys(en).filter((k) => k.startsWith('priceTariffs.'));

function version(
  partial: Partial<PriceTariffVersion> & Pick<PriceTariffVersion, 'id' | 'status'>,
): PriceTariffVersion {
  return {
    versionNumber: 1,
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null,
    rate: {
      id: 'rate-1',
      dailyRateCents: 4958,
      weeklyRateCents: 0,
      monthlyRateCents: 0,
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents: 17700,
      minimumRentalDays: null,
    },
    mileagePackages: [],
    insuranceOptions: [],
    extraOptions: [],
    ...partial,
  };
}

function group(partial: Partial<PriceTariffGroup> & Pick<PriceTariffGroup, 'id' | 'name'>): PriceTariffGroup {
  const active = partial.activeVersion ?? null;
  return {
    description: null,
    category: partial.name,
    isActive: true,
    sortOrder: 0,
    updatedAt: '2026-07-01T10:00:00.000Z',
    draftVersion: null,
    scheduledVersions: [],
    archivedVersions: [],
    versions: active ? [active] : [],
    ...partial,
    activeVersion: active,
  };
}

function catalog(groups: PriceTariffGroup[]): PriceTariffCatalog {
  return {
    priceBook: {
      id: 'book-1',
      name: 'Standard',
      currency: 'EUR',
      taxRatePercent: 19,
      isActive: true,
    },
    groups,
    assignments: [],
    unassignedVehicleCount: 2,
  };
}

describe('tariff catalog metrics', () => {
  it('computes KPIs from real group buckets (no versions[0] fallback)', () => {
    const live = version({ id: 'v-live', status: 'ACTIVE' });
    const draft = version({
      id: 'v-draft',
      status: 'DRAFT',
      rate: { ...live.rate!, depositAmountCents: 50000 },
    });
    const scheduled = version({ id: 'v-sched', status: 'SCHEDULED', versionNumber: 2 });

    const cat = catalog([
      group({ id: 'g1', name: 'Sedan', activeVersion: live, draftVersion: draft }),
      group({
        id: 'g2',
        name: 'SUV',
        activeVersion: null,
        draftVersion: draft,
        scheduledVersions: [scheduled],
        isActive: true,
        updatedAt: '2026-08-01T12:00:00.000Z',
      }),
    ]);

    const kpis = computeTariffCatalogKpis(cat);
    expect(kpis.activeGroups).toBe(1);
    expect(kpis.openDrafts).toBe(2);
    expect(kpis.unassignedVehicles).toBe(2);
    expect(kpis.scheduledChanges).toBe(1);
    expect(kpis.lastUpdatedAt).toBe('2026-08-01T12:00:00.000Z');
  });

  it('separates live and draft deposit display', () => {
    const live = version({ id: 'v-live', status: 'ACTIVE' });
    const draft = version({
      id: 'v-draft',
      status: 'DRAFT',
      rate: { ...live.rate!, depositAmountCents: 50000 },
    });
    const cat = catalog([group({ id: 'g1', name: 'Sedan', activeVersion: live, draftVersion: draft })]);
    const row = buildTariffGroupRowView(cat.groups[0], cat);

    expect(row.hasPublishedLive).toBe(true);
    expect(row.live?.depositLabel).toContain('177');
    expect(row.draft?.depositLabel).toContain('500');
    expect(row.live?.depositLabel).not.toBe(row.draft?.depositLabel);
  });

  it('shows not published when no active version exists', () => {
    const draft = version({ id: 'v-draft', status: 'DRAFT' });
    const cat = catalog([group({ id: 'g1', name: 'New', activeVersion: null, draftVersion: draft })]);
    const row = buildTariffGroupRowView(cat.groups[0], cat);
    expect(row.hasPublishedLive).toBe(false);
    expect(row.live).toBeNull();
    expect(row.draft).not.toBeNull();
  });

  it('uses catalog currency for formatted amounts', () => {
    const live = version({ id: 'v-live', status: 'ACTIVE' });
    const cat = catalog([group({ id: 'g1', name: 'Sedan', activeVersion: live })]);
    const row = buildTariffGroupRowView(cat.groups[0], cat);
    expect(row.currency).toBe('EUR');
    expect(row.live?.dailyGrossLabel).toMatch(/€|EUR/);
  });

  it('cloneVersionPayloadForNewGroup strips option IDs', () => {
    const src = version({
      id: 'v1',
      status: 'ACTIVE',
      insuranceOptions: [
        {
          id: 'ins-1',
          label: 'Vollkasko',
          priceCents: 1000,
          pricingType: 'PER_DAY',
          isDefault: true,
          isActive: true,
          sortOrder: 0,
        },
      ],
    });
    const cloned = cloneVersionPayloadForNewGroup(src);
    expect(cloned?.insuranceOptions[0]).not.toHaveProperty('id');
    expect(cloned?.rate.depositAmountCents).toBe(17700);
  });
});

describe('price tariffs overview UI guards', () => {
  it('does not use window.prompt for group creation', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/price-tariffs/PriceTariffsPage.tsx'),
      'utf8',
    );
    expect(source).not.toContain('window.prompt');
    expect(source).toContain('CreateTariffGroupDialog');
  });

  it('does not use versions[0] in overview components', () => {
    const files = [
      'src/rental/components/price-tariffs/PriceTariffsPage.tsx',
      'src/rental/components/price-tariffs/TariffGroupsTab.tsx',
      'src/rental/pricing/tariff-catalog-metrics.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source).not.toContain('versions[0]');
    }
  });

  it('rules tab is disabled with planned badge', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/price-tariffs/PriceTariffsPage.tsx'),
      'utf8',
    );
    expect(source).toContain("id: 'rules'");
    expect(source).toContain('disabled: true');
    expect(source).toContain('priceTariffs.tabs.planned');
    expect(source).not.toContain('RulesPlaceholderTab');
  });
});

describe('priceTariffs i18n', () => {
  it('has matching DE and EN keys for price tariffs', () => {
    for (const key of PRICE_TARIFF_I18N_KEYS) {
      expect(de[key as keyof typeof de], `missing de key ${key}`).toBeTruthy();
      expect(en[key as keyof typeof en], `missing en key ${key}`).toBeTruthy();
    }
  });
});
