import type { PriceTariffGroup, PriceTariffVersion, TariffRate } from './pricingTypes';

const sedanRate = (depositAmountCents: number, id = 'rate-1'): TariffRate => ({
  id,
  dailyRateCents: 4958,
  weeklyRateCents: 27269,
  monthlyRateCents: 99160,
  includedKmPerDay: 200,
  extraKmPriceCents: 22,
  depositAmountCents,
});

const version = (
  partial: Pick<PriceTariffVersion, 'id' | 'versionNumber' | 'status'> & {
    depositAmountCents: number;
    rateId?: string;
  },
): PriceTariffVersion => ({
  id: partial.id,
  versionNumber: partial.versionNumber,
  status: partial.status,
  validFrom: '2026-01-01T00:00:00.000Z',
  rate: sedanRate(partial.depositAmountCents, partial.rateId ?? `rate-${partial.id}`),
  mileagePackages: [],
  insuranceOptions: [],
  extraOptions: [],
});

/** Sedan ACTIVE-only catalog snapshot (drawer opened before first save). */
export function createStaleSedanGroupWithActiveOnly(): PriceTariffGroup {
  return {
    id: 'group-sedan',
    name: 'Sedan',
    category: 'Sedan',
    isActive: true,
    sortOrder: 0,
    updatedAt: '2026-07-01T00:00:00.000Z',
    versions: [
      version({
        id: 'version-active-v1',
        versionNumber: 1,
        status: 'ACTIVE',
        depositAmountCents: 17700,
      }),
    ],
  };
}

/** Draft returned by upsertVersion when editing ACTIVE (500 € deposit). */
export function createSedanDraftVersionSavedFromActive(): PriceTariffVersion {
  return version({
    id: 'version-draft-v2',
    versionNumber: 2,
    status: 'DRAFT',
    depositAmountCents: 50000,
    rateId: 'rate-draft-v2',
  });
}

/** Catalog after reload when draft exists but ACTIVE was not replaced. */
export function createSedanGroupWithActiveAndDraft(): PriceTariffGroup {
  return {
    ...createStaleSedanGroupWithActiveOnly(),
    versions: [
      version({
        id: 'version-active-v1',
        versionNumber: 1,
        status: 'ACTIVE',
        depositAmountCents: 17700,
      }),
      createSedanDraftVersionSavedFromActive(),
    ],
  };
}

/** Catalog after correct backend publish. */
export function createSedanGroupAfterSuccessfulPublish(): PriceTariffGroup {
  return {
    ...createStaleSedanGroupWithActiveOnly(),
    versions: [
      version({
        id: 'version-draft-v2',
        versionNumber: 2,
        status: 'ACTIVE',
        depositAmountCents: 50000,
        rateId: 'rate-draft-v2',
      }),
    ],
  };
}

export const SEDAN_DEPOSIT_ACTIVE_CENTS = 17700;
export const SEDAN_DEPOSIT_DRAFT_CENTS = 50000;
