import type {
  ExtraOptionRow,
  InsuranceOptionRow,
  MileagePackageOption,
  TariffRate,
} from './pricingTypes';

export interface TariffEditorFormSnapshot {
  name: string;
  description: string;
  isActive: boolean;
  rate: TariffRate;
  packages: MileagePackageOption[];
  insurances: InsuranceOptionRow[];
  extras: ExtraOptionRow[];
  publishEffectiveFrom: string;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function createEditorSnapshot(input: {
  name: string;
  description: string;
  isActive: boolean;
  rate: TariffRate;
  packages: MileagePackageOption[];
  insurances: InsuranceOptionRow[];
  extras: ExtraOptionRow[];
  publishEffectiveFrom?: string;
}): TariffEditorFormSnapshot {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    isActive: input.isActive,
    rate: { ...input.rate },
    packages: input.packages.map((p) => ({ ...p })),
    insurances: input.insurances.map((o) => ({ ...o })),
    extras: input.extras.map((o) => ({ ...o })),
    publishEffectiveFrom: input.publishEffectiveFrom ?? '',
  };
}

export function isEditorDirty(
  current: TariffEditorFormSnapshot,
  baseline: TariffEditorFormSnapshot,
): boolean {
  return stableJson(current) !== stableJson(baseline);
}

export function buildVersionPayloadFromSnapshot(snapshot: TariffEditorFormSnapshot) {
  return {
    rate: {
      dailyRateCents: snapshot.rate.dailyRateCents,
      weeklyRateCents: snapshot.rate.weeklyRateCents,
      monthlyRateCents: snapshot.rate.monthlyRateCents,
      includedKmPerDay: snapshot.rate.includedKmPerDay,
      extraKmPriceCents: snapshot.rate.extraKmPriceCents,
      depositAmountCents: snapshot.rate.depositAmountCents,
      minimumRentalDays: snapshot.rate.minimumRentalDays ?? undefined,
    },
    mileagePackages: snapshot.packages.map((p) => ({
      id: p.id,
      label: p.label,
      includedKm: p.includedKm,
      priceCents: p.priceCents,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    })),
    insuranceOptions: snapshot.insurances.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description ?? undefined,
      priceCents: o.priceCents,
      pricingType: o.pricingType,
      deductibleCents: o.deductibleCents ?? undefined,
      isDefault: o.isDefault,
      isActive: o.isActive,
      sortOrder: o.sortOrder,
    })),
    extraOptions: snapshot.extras.map((o) => ({
      id: o.id,
      label: o.label,
      description: o.description ?? undefined,
      priceCents: o.priceCents,
      pricingType: o.pricingType,
      isActive: o.isActive,
      sortOrder: o.sortOrder,
    })),
  };
}
