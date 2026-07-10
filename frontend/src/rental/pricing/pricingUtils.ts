import type {
  PriceOptionPricingType,
  PriceTariffCatalog,
  PriceTariffGroup,
  PriceTariffVersion,
  PricingSimulationResult,
  TariffGroupRowStatus,
  VehicleTariffAssignment,
} from './pricingTypes';
import {
  formatMoneyCents,
  majorUnitsFromCents,
  normalizeCurrencyCode,
  resolvePricingCurrency,
} from '../../lib/money';

export { formatMoneyCents, majorUnitsFromCents, normalizeCurrencyCode, resolvePricingCurrency };

/** @deprecated Use formatMoneyCents(cents, currency) — kept as alias for pricing modules. */
export const formatPriceCents = formatMoneyCents;

/** Refundable deposit — integer cents, no VAT markup. */
export function formatDepositCents(
  cents: number | null | undefined,
  currency: string,
): string {
  return formatMoneyCents(cents, currency);
}

/** Display gross from net tariff rate (rates stored net in DB). */
export function grossFromNetCents(netCents: number, taxRatePercent: number): number {
  return Math.round(netCents * (1 + taxRatePercent / 100));
}

export function formatNetAsGross(
  netCents: number,
  taxRatePercent: number,
  currency: string,
): string {
  return formatMoneyCents(grossFromNetCents(netCents, taxRatePercent), currency);
}

export function getActiveVersion(group: PriceTariffGroup): PriceTariffVersion | null {
  return group.versions.find((v) => v.status === 'ACTIVE') ?? null;
}

export function getDraftVersion(group: PriceTariffGroup): PriceTariffVersion | null {
  return group.versions.find((v) => v.status === 'DRAFT') ?? null;
}

export function getEditableVersion(group: PriceTariffGroup): PriceTariffVersion | null {
  return getDraftVersion(group) ?? getActiveVersion(group);
}

export function countVehiclesInGroup(
  catalog: PriceTariffCatalog | null,
  groupId: string,
): number {
  return catalog?.assignments.filter((a) => a.isActive && a.tariffGroupId === groupId).length ?? 0;
}

export function catalogCurrency(catalog: PriceTariffCatalog | null): string | null {
  return resolvePricingCurrency(null, catalog?.priceBook ?? null);
}

export function resolveGroupStatus(
  group: PriceTariffGroup,
  catalog: PriceTariffCatalog | null,
): TariffGroupRowStatus {
  const active = getActiveVersion(group);
  const vehicleCount = countVehiclesInGroup(catalog, group.id);
  if (!active?.rate || active.rate.dailyRateCents <= 0) return 'incomplete';
  if (!active) return 'draft';
  if (vehicleCount === 0) return 'unassigned';
  if (active.status === 'DRAFT') return 'draft';
  return 'active';
}

export const STATUS_BADGE: Record<
  TariffGroupRowStatus,
  { label: string; className: string }
> = {
  active: { label: 'Active', className: 'sq-tone-success' },
  draft: { label: 'Draft', className: 'sq-tone-neutral' },
  incomplete: { label: 'Incomplete', className: 'sq-tone-warning' },
  unassigned: { label: 'No vehicles', className: 'sq-tone-warning' },
};

export function getVehicleTariffFromCatalog(
  catalog: PriceTariffCatalog | null,
  vehicleId: string,
): {
  group: PriceTariffGroup;
  version: PriceTariffVersion;
  assignment: VehicleTariffAssignment;
} | null {
  if (!catalog) return null;
  const assignment = catalog.assignments.find(
    (a) => a.isActive && a.vehicleId === vehicleId,
  );
  if (!assignment) return null;
  const group = catalog.groups.find((g) => g.id === assignment.tariffGroupId);
  if (!group) return null;
  const version = getActiveVersion(group);
  if (!version?.rate) return null;
  return { group, version, assignment };
}

export function formatOptionGrossLabel(
  priceCents: number,
  pricingType: PriceOptionPricingType,
  taxRatePercent: number,
  currency: string,
  rentalDays = 1,
): string {
  const grossCents = grossFromNetCents(priceCents, taxRatePercent);
  if (pricingType === 'PER_DAY') {
    return `${formatMoneyCents(grossCents, currency)}/Tag`;
  }
  if (pricingType === 'PER_BOOKING' && rentalDays > 1) {
    return formatMoneyCents(grossCents, currency);
  }
  return formatMoneyCents(grossCents, currency);
}

export function discountableNetCents(result: PricingSimulationResult | null): number {
  if (!result) return 0;
  const discountLine = result.lineItems.find(
    (li) => li.type === 'DISCOUNT' || li.type === 'MANUAL_DISCOUNT',
  );
  if (discountLine) return result.subtotalNetCents - discountLine.totalNetCents;
  return result.subtotalNetCents;
}

/** @deprecated Use majorUnitsFromCents — name implied EUR only. */
export const eurosFromCents = majorUnitsFromCents;

export function parseApiError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(', ');
  }
  return 'Unbekannter Fehler';
}

export function validateRateFields(rate: {
  dailyRateCents: number;
  weeklyRateCents: number;
  monthlyRateCents: number;
  includedKmPerDay: number;
  extraKmPriceCents: number;
  depositAmountCents: number;
}): string[] {
  const errors: string[] = [];
  if (rate.dailyRateCents <= 0) errors.push('Tagespreis muss größer als 0 sein');
  if (rate.weeklyRateCents < 0) errors.push('Wochenpreis ungültig');
  if (rate.monthlyRateCents < 0) errors.push('Monatspreis ungültig');
  if (rate.includedKmPerDay < 0) errors.push('Inklusive km/Tag ungültig');
  if (rate.extraKmPriceCents < 0) errors.push('Extra-km Preis ungültig');
  if (rate.depositAmountCents < 0) errors.push('Kaution ungültig');
  return errors;
}

export function rateWarnings(
  rate: {
    dailyRateCents: number;
    weeklyRateCents: number;
    monthlyRateCents: number;
    includedKmPerDay: number;
    extraKmPriceCents: number;
  },
  taxRatePercent: number,
): string[] {
  const w: string[] = [];
  const dailyGross = grossFromNetCents(rate.dailyRateCents, taxRatePercent);
  if (rate.weeklyRateCents > 0 && rate.weeklyRateCents > rate.dailyRateCents * 7) {
    w.push('Wochenpreis höher als 7× Tagespreis');
  }
  if (rate.monthlyRateCents > 0 && rate.monthlyRateCents > rate.dailyRateCents * 30) {
    w.push('Monatspreis höher als 30× Tagespreis');
  }
  if (rate.includedKmPerDay > 0 && rate.extraKmPriceCents === 0) {
    w.push('Extra-km Preis ist 0 trotz km-Limit');
  }
  void dailyGross;
  return w;
}
