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
  if (group.activeVersion != null) return group.activeVersion;
  return group.versions.find((v) => v.status === 'ACTIVE') ?? null;
}

export function getDraftVersion(group: PriceTariffGroup): PriceTariffVersion | null {
  if (group.draftVersion != null) return group.draftVersion;
  return group.versions.find((v) => v.status === 'DRAFT') ?? null;
}

export function getScheduledVersions(group: PriceTariffGroup): PriceTariffVersion[] {
  if (group.scheduledVersions?.length) return group.scheduledVersions;
  return group.versions.filter((v) => v.status === 'SCHEDULED');
}

/** Only DRAFT versions are directly editable — never ACTIVE or ARCHIVED. */
export function getEditableVersion(group: PriceTariffGroup): PriceTariffVersion | null {
  return getDraftVersion(group);
}

/**
 * Baseline for initializing a new draft UI (copy-on-write from live).
 * Does not imply the returned version is editable.
 */
export function getTariffFormBaseline(group: PriceTariffGroup): PriceTariffVersion | null {
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
  const structured = extractPricingApiError(err);
  if (structured) return structured.message;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(', ');
  }
  return 'Unbekannter Fehler';
}

const PRICING_ERROR_LABELS: Record<string, string> = {
  NO_ACTIVE_TARIFF: 'Kein aktiver Tarif für dieses Fahrzeug zugewiesen',
  ASSIGNMENT_CONFLICT: 'Mehrere konkurrierende Tarifzuweisungen',
  TARIFF_GROUP_INACTIVE: 'Tarifgruppe ist inaktiv',
  NO_TARIFF_VERSION_FOR_PICKUP: 'Keine gültige Tarifversion für den Abholzeitpunkt',
  TARIFF_RESOLUTION_AMBIGUOUS: 'Mehrdeutige Tarifauflösung',
  NO_TARIFF_RATE_FOR_PICKUP: 'Tarifversion ohne gültige Rate',
  PRICE_BOOK_INACTIVE: 'Preisbuch ist nicht aktiv',
  PRICE_BOOK_CURRENCY_MISSING: 'Währung im Preisbuch fehlt',
  CURRENCY_MISMATCH: 'Währung stimmt nicht mit dem Server überein',
  TARIFF_VERSION_INCOMPLETE: 'Tarifversion ist unvollständig',
};

export function extractPricingApiError(
  err: unknown,
): { code?: string; message: string } | null {
  const messageFromUnknown = (value: unknown): string | null => {
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value)) return value.map(String).join(', ');
    return null;
  };

  if (err instanceof Error) {
    const match = err.message.match(/^\[([A-Z_]+)\]\s*(.+)$/);
    if (match) {
      return { code: match[1], message: match[2] };
    }
  }

  if (typeof err === 'object' && err) {
    const body = err as Record<string, unknown>;
    const nested = body.response as Record<string, unknown> | undefined;
    const payload = (nested?.data ?? nested ?? body) as Record<string, unknown>;
    const code = typeof payload.code === 'string' ? payload.code : undefined;
    const rawMessage = messageFromUnknown(payload.message) ?? messageFromUnknown(err);
    if (code || rawMessage) {
      const message =
        (code && PRICING_ERROR_LABELS[code]) ||
        rawMessage ||
        'Preisauflösung fehlgeschlagen';
      return { code, message: code ? `[${code}] ${message}` : message };
    }
  }

  return null;
}

export function formatPricingContextLabel(ctx: {
  tariffGroupName: string;
  versionNumber: number;
  currency: string;
}): string {
  return `${ctx.tariffGroupName} · v${ctx.versionNumber} · ${ctx.currency}`;
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
