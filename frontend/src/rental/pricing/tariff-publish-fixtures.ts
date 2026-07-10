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

function withVersionBuckets(
  base: Omit<
    PriceTariffGroup,
    'activeVersion' | 'draftVersion' | 'scheduledVersions' | 'archivedVersions' | 'versions'
  >,
  versions: PriceTariffVersion[],
): PriceTariffGroup {
  const activeVersion = versions.find((v) => v.status === 'ACTIVE') ?? null;
  const draftVersion = versions.find((v) => v.status === 'DRAFT') ?? null;
  const scheduledVersions = versions.filter((v) => v.status === 'SCHEDULED');
  const archivedVersions = versions.filter((v) => v.status === 'ARCHIVED');
  return {
    ...base,
    activeVersion,
    draftVersion,
    scheduledVersions,
    archivedVersions,
    versions,
  };
}

const sedanGroupBase = {
  id: 'group-sedan',
  name: 'Sedan',
  category: 'Sedan',
  isActive: true,
  sortOrder: 0,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const activeV1 = version({
  id: 'version-active-v1',
  versionNumber: 1,
  status: 'ACTIVE',
  depositAmountCents: 17700,
});

/** Sedan ACTIVE-only catalog snapshot (drawer opened before first save). */
export function createStaleSedanGroupWithActiveOnly(): PriceTariffGroup {
  return withVersionBuckets(sedanGroupBase, [activeV1]);
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
  return withVersionBuckets(sedanGroupBase, [activeV1, createSedanDraftVersionSavedFromActive()]);
}

/** Catalog after correct backend publish. */
export function createSedanGroupAfterSuccessfulPublish(): PriceTariffGroup {
  const published = version({
    id: 'version-draft-v2',
    versionNumber: 2,
    status: 'ACTIVE',
    depositAmountCents: 50000,
    rateId: 'rate-draft-v2',
  });
  const archived = { ...activeV1, status: 'ARCHIVED' as const, validTo: '2026-07-10T00:00:00.000Z' };
  return withVersionBuckets(sedanGroupBase, [published, archived]);
}

export const SEDAN_DEPOSIT_ACTIVE_CENTS = 17700;
export const SEDAN_DEPOSIT_DRAFT_CENTS = 50000;
