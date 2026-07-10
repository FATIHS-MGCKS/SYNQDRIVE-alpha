import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import {
  createEditorSnapshot,
  isEditorDirty,
} from './tariff-editor-form-state';
import { buildLiveDraftComparison } from './tariff-live-draft-compare';
import {
  firstValidationError,
  validateTariffEditorForm,
} from './tariff-editor-validation';
import {
  buildSimulatorPriceBreakdown,
  resolveSimulatorDraftDepositHint,
} from './simulator-price-breakdown';
import type { PricingSimulationResult } from './pricingTypes';
import { runPublishFlow } from './tariff-publish-flow';

const EDITOR_I18N_KEYS = Object.keys(en).filter(
  (k) => k.startsWith('priceTariffs.editor.') || k.startsWith('priceTariffs.simulator.'),
);

describe('tariff editor form state', () => {
  const baseline = createEditorSnapshot({
    name: 'Sedan',
    description: '',
    isActive: true,
    rate: {
      id: 'r1',
      dailyRateCents: 4958,
      weeklyRateCents: 0,
      monthlyRateCents: 0,
      includedKmPerDay: 200,
      extraKmPriceCents: 22,
      depositAmountCents: 17700,
      minimumRentalDays: null,
    },
    packages: [],
    insurances: [],
    extras: [],
  });

  it('detects dirty state only when values change', () => {
    expect(isEditorDirty(baseline, baseline)).toBe(false);
    const changed = createEditorSnapshot({
      ...baseline,
      rate: { ...baseline.rate, depositAmountCents: 50000 },
    });
    expect(isEditorDirty(changed, baseline)).toBe(true);
  });

  it('validates required daily rate and currency', () => {
    const invalid = createEditorSnapshot({
      ...baseline,
      rate: { ...baseline.rate, dailyRateCents: 0 },
    });
    const errors = validateTariffEditorForm(invalid, null);
    expect(errors.dailyRateCents).toBeTruthy();
    expect(errors.currency).toBeTruthy();
    expect(firstValidationError(errors)).toBeTruthy();
  });

  it('rejects negative deposit', () => {
    const invalid = createEditorSnapshot({
      ...baseline,
      rate: { ...baseline.rate, depositAmountCents: -1 },
    });
    const errors = validateTariffEditorForm(invalid, 'EUR');
    expect(errors.depositAmountCents).toBe('priceTariffs.editor.errors.negativeDeposit');
  });
});

describe('live vs draft comparison', () => {
  it('highlights deposit changes', () => {
    const fields = buildLiveDraftComparison({
      liveVersion: {
        id: 'live',
        versionNumber: 1,
        status: 'ACTIVE',
        validFrom: '2026-01-01T00:00:00.000Z',
        rate: {
          id: 'r',
          dailyRateCents: 4958,
          weeklyRateCents: 0,
          monthlyRateCents: 0,
          includedKmPerDay: 200,
          extraKmPriceCents: 22,
          depositAmountCents: 17700,
        },
        mileagePackages: [],
        insuranceOptions: [],
        extraOptions: [],
      },
      draftRate: {
        id: 'd',
        dailyRateCents: 4958,
        weeklyRateCents: 0,
        monthlyRateCents: 0,
        includedKmPerDay: 200,
        extraKmPriceCents: 22,
        depositAmountCents: 50000,
        minimumRentalDays: null,
      },
      draftPackagesCount: 0,
      draftInsurancesCount: 0,
      draftExtrasCount: 0,
      taxRate: 19,
      currency: 'EUR',
    });
    const deposit = fields.find((f) => f.key === 'deposit');
    expect(deposit?.changed).toBe(true);
    expect(deposit?.liveLabel).not.toBe(deposit?.draftLabel);
  });
});

describe('simulator breakdown', () => {
  it('keeps deposit separate from rental revenue lines', () => {
    const result: PricingSimulationResult = {
      rentalDays: 3,
      lineItems: [
        {
          type: 'BASE_RENTAL',
          label: 'Miete',
          quantity: 3,
          unitPriceCents: 10000,
          totalNetCents: 30000,
          taxRatePercent: 19,
          totalGrossCents: 35700,
        },
        {
          type: 'DEPOSIT',
          label: 'Kaution',
          quantity: 1,
          unitPriceCents: 17700,
          totalNetCents: 17700,
          taxRatePercent: 0,
          totalGrossCents: 17700,
        },
      ],
      subtotalNetCents: 30000,
      taxAmountCents: 5700,
      totalGrossCents: 35700,
      depositAmountCents: 17700,
      includedKm: 600,
      extraKmPriceCents: 22,
      totalDueNowCents: 53400,
      warnings: [],
      tariffVersionId: 'v1',
      priceBookId: 'b1',
      tariffGroupId: 'g1',
      currency: 'EUR',
      effectiveDailyRateCents: 11900,
      pricingContext: {
        priceBookId: 'b1',
        currency: 'EUR',
        assignmentId: 'a1',
        tariffGroupId: 'g1',
        tariffGroupName: 'Sedan',
        tariffVersionId: 'v1',
        versionNumber: 1,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        vehicleId: 'veh1',
        pickupAt: '2026-08-01T10:00:00.000Z',
        depositAmountCents: 17700,
        taxRatePercent: 19,
        mileagePackages: [],
        insuranceOptions: [],
        extraOptions: [],
        rate: {
          dailyRateCents: 4958,
          weeklyRateCents: 0,
          monthlyRateCents: 0,
          includedKmPerDay: 200,
          extraKmPriceCents: 22,
          minimumRentalDays: null,
        },
      },
      quoteId: 'quote-1',
      calculatedAt: '2026-07-10T10:00:00.000Z',
      expiresAt: '2026-07-10T10:15:00.000Z',
      totals: {
        rentalDays: 3,
        subtotalNetCents: 30000,
        taxAmountCents: 5700,
        totalGrossCents: 35700,
        depositAmountCents: 17700,
        includedKm: 600,
        extraKmPriceCents: 22,
        totalDueNowCents: 53400,
        currency: 'EUR',
        effectiveDailyRateCents: 11900,
      },
    };

    const breakdown = buildSimulatorPriceBreakdown(result);
    expect(breakdown.baseRentalGrossCents).toBe(35700);
    expect(breakdown.depositAmountCents).toBe(17700);
    expect(breakdown.rentalRevenueGrossCents).toBe(35700);
  });

  it('detects draft deposit mismatch hint', () => {
    expect(
      resolveSimulatorDraftDepositHint({
        tariffGroupId: 'g1',
        liveDepositCents: 17700,
        draftDepositCents: 50000,
      }),
    ).toBe(true);
    expect(
      resolveSimulatorDraftDepositHint({
        tariffGroupId: 'g1',
        liveDepositCents: 17700,
        draftDepositCents: 17700,
      }),
    ).toBe(false);
  });
});

describe('publish flow', () => {
  it('publishes after successful draft save', async () => {
    const result = await runPublishFlow({
      groupId: 'g1',
      saveDraft: async () => ({
        ok: true,
        savedVersion: {
          id: 'draft-1',
          versionNumber: 2,
          status: 'DRAFT',
          validFrom: '2026-01-01T00:00:00.000Z',
          mileagePackages: [],
          insuranceOptions: [],
          extraOptions: [],
        },
      }),
      publishDraft: async (id) => {
        expect(id).toBe('draft-1');
      },
    });
    expect(result.publishCalled).toBe(true);
    expect(result.toast).toBe('success');
  });
});

describe('tariff editor & simulator UI guards', () => {
  it('TariffGroupDrawer uses real dirty state and publish labels', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/price-tariffs/TariffGroupDrawer.tsx'),
      'utf8',
    );
    expect(source).toContain('isEditorDirty');
    expect(source).not.toContain('useMemo(() => true');
    expect(source).not.toContain('Activate version');
    expect(source).toContain('publishChanges');
    expect(source).toContain('scheduleChange');
    expect(source).toContain('unsavedClose');
  });

  it('PricingSimulatorTab shows pricing context and quote fields', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/price-tariffs/PricingSimulatorTab.tsx'),
      'utf8',
    );
    expect(source).toContain('pricingContext');
    expect(source).toContain('quoteId');
    expect(source).toContain('expiresAt');
    expect(source).toContain('draftDepositHint');
    expect(source).toContain('buildSimulatorPriceBreakdown');
  });

  it('deposit section is separate from rental rates', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/price-tariffs/TariffGroupDrawer.tsx'),
      'utf8',
    );
    const depositIdx = source.indexOf('id="deposit"');
    const rentalIdx = source.indexOf('id="rental"');
    expect(depositIdx).toBeGreaterThan(rentalIdx);
    expect(source).toContain('TariffEditorDepositField');
  });
});

describe('editor & simulator i18n', () => {
  it('has matching DE and EN keys', () => {
    for (const key of EDITOR_I18N_KEYS) {
      expect(de[key as keyof typeof de], `missing de ${key}`).toBeTruthy();
      expect(en[key as keyof typeof en], `missing en ${key}`).toBeTruthy();
    }
  });
});
