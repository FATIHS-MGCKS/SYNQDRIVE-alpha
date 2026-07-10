import type { PriceTariffCatalog, PriceTariffGroup, PriceTariffVersion } from './pricingTypes';
import {
  catalogCurrency,
  countVehiclesInGroup,
  formatDepositCents,
  formatNetAsGross,
  getActiveVersion,
  getDraftVersion,
  getScheduledVersions,
  resolveGroupStatus,
} from './pricingUtils';

export interface TariffCatalogKpis {
  activeGroups: number;
  openDrafts: number;
  unassignedVehicles: number;
  scheduledChanges: number;
  lastUpdatedAt: string | null;
}

export interface TariffRateSummary {
  dailyGrossLabel: string;
  depositLabel: string;
  includedKmPerDay: number | null;
  validFrom: string | null;
}

export interface TariffGroupRowView {
  group: PriceTariffGroup;
  status: ReturnType<typeof resolveGroupStatus>;
  currency: string | null;
  vehicleCount: number;
  isGroupActive: boolean;
  live: TariffRateSummary | null;
  draft: Omit<TariffRateSummary, 'validFrom'> | null;
  scheduled: Array<TariffRateSummary & { versionNumber: number }>;
  hasPublishedLive: boolean;
}

function summarizeVersion(
  version: PriceTariffVersion | null | undefined,
  taxRate: number,
  currency: string | null,
  includeValidFrom: boolean,
): TariffRateSummary | null {
  if (!version?.rate || !currency || version.rate.dailyRateCents <= 0) return null;
  const rate = version.rate;
  return {
    dailyGrossLabel: formatNetAsGross(rate.dailyRateCents, taxRate, currency),
    depositLabel: formatDepositCents(rate.depositAmountCents, currency),
    includedKmPerDay: rate.includedKmPerDay ?? null,
    validFrom: includeValidFrom ? version.validFrom : null,
  };
}

export function computeTariffCatalogKpis(catalog: PriceTariffCatalog | null): TariffCatalogKpis {
  const groups = catalog?.groups ?? [];
  const activeGroups = groups.filter(
    (g) => g.isActive && !!getActiveVersion(g)?.rate,
  ).length;
  const openDrafts = groups.filter((g) => !!getDraftVersion(g)).length;
  const scheduledChanges = groups.reduce(
    (sum, g) => sum + getScheduledVersions(g).length,
    0,
  );
  const lastUpdatedAt =
    groups.length > 0
      ? groups.reduce(
          (max, g) => (g.updatedAt > max ? g.updatedAt : max),
          groups[0].updatedAt,
        )
      : null;

  return {
    activeGroups,
    openDrafts,
    unassignedVehicles: catalog?.unassignedVehicleCount ?? 0,
    scheduledChanges,
    lastUpdatedAt,
  };
}

export function buildTariffGroupRowView(
  group: PriceTariffGroup,
  catalog: PriceTariffCatalog,
): TariffGroupRowView {
  const taxRate = catalog.priceBook?.taxRatePercent ?? 19;
  const currency = catalogCurrency(catalog);
  const liveVersion = getActiveVersion(group);
  const draftVersion = getDraftVersion(group);
  const scheduledVersions = getScheduledVersions(group);

  return {
    group,
    status: resolveGroupStatus(group, catalog),
    currency,
    vehicleCount: countVehiclesInGroup(catalog, group.id),
    isGroupActive: group.isActive,
    live: summarizeVersion(liveVersion, taxRate, currency, true),
    draft: summarizeVersion(draftVersion, taxRate, currency, false),
    scheduled: scheduledVersions
      .map((version) => {
        const summary = summarizeVersion(version, taxRate, currency, true);
        if (!summary) return null;
        return { ...summary, versionNumber: version.versionNumber };
      })
      .filter((row): row is TariffRateSummary & { versionNumber: number } => row != null),
    hasPublishedLive: !!liveVersion?.rate && liveVersion.rate.dailyRateCents > 0,
  };
}

/** Strip option IDs when cloning a version payload for a new group draft. */
export function cloneVersionPayloadForNewGroup(source: PriceTariffVersion) {
  const rate = source.rate;
  if (!rate) return null;
  return {
    rate: {
      dailyRateCents: rate.dailyRateCents,
      weeklyRateCents: rate.weeklyRateCents,
      monthlyRateCents: rate.monthlyRateCents,
      includedKmPerDay: rate.includedKmPerDay,
      extraKmPriceCents: rate.extraKmPriceCents,
      depositAmountCents: rate.depositAmountCents,
      minimumRentalDays: rate.minimumRentalDays ?? undefined,
    },
    mileagePackages: source.mileagePackages.map((p, i) => ({
      label: p.label,
      includedKm: p.includedKm,
      priceCents: p.priceCents,
      isActive: p.isActive,
      sortOrder: p.sortOrder ?? i,
    })),
    insuranceOptions: source.insuranceOptions.map((o, i) => ({
      label: o.label,
      description: o.description ?? undefined,
      priceCents: o.priceCents,
      pricingType: o.pricingType,
      deductibleCents: o.deductibleCents ?? undefined,
      isDefault: o.isDefault,
      isActive: o.isActive,
      sortOrder: o.sortOrder ?? i,
    })),
    extraOptions: source.extraOptions.map((o, i) => ({
      label: o.label,
      description: o.description ?? undefined,
      priceCents: o.priceCents,
      pricingType: o.pricingType,
      isActive: o.isActive,
      sortOrder: o.sortOrder ?? i,
    })),
  };
}
