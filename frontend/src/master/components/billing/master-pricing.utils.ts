import type {
  AdminBillingCatalogProductDto,
  AdminBillingPriceTierDto,
  AdminBillingPriceVersionDto,
} from '../../types/admin-billing.types';

export type MasterPricingSubTab =
  | 'products'
  | 'versions'
  | 'tiers'
  | 'simulation'
  | 'stripe';

export const MASTER_PRICING_SUB_TABS: Array<{ id: MasterPricingSubTab; label: string }> = [
  { id: 'products', label: 'Produkte' },
  { id: 'versions', label: 'Versionen' },
  { id: 'tiers', label: 'Staffeln' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'stripe', label: 'Stripe' },
];

export type PriceVersionDisplayStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED';

export function eurosToCents(value: string | number): number | null {
  if (value === '' || value == null) return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function centsToEuroInput(value: number | null | undefined): string {
  if (value == null) return '';
  return (value / 100).toFixed(2).replace('.', ',');
}

export function parseEuroInput(value: string): number | null {
  return eurosToCents(value);
}

export function resolvePriceVersionDisplayStatus(
  version: Pick<AdminBillingPriceVersionDto, 'status' | 'effectiveFrom'>,
  now = Date.now(),
): PriceVersionDisplayStatus {
  if (version.status === 'DRAFT') return 'DRAFT';
  if (version.status === 'ARCHIVED') return 'ARCHIVED';
  if (version.status === 'ACTIVE') {
    const effectiveFrom = version.effectiveFrom ? Date.parse(version.effectiveFrom) : null;
    if (effectiveFrom != null && effectiveFrom > now) return 'SCHEDULED';
    return 'PUBLISHED';
  }
  return 'DRAFT';
}

export function priceVersionDisplayStatusLabel(status: PriceVersionDisplayStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'Entwurf';
    case 'PUBLISHED':
      return 'Veröffentlicht';
    case 'SCHEDULED':
      return 'Geplant';
    case 'ARCHIVED':
      return 'Archiviert';
    default:
      return status;
  }
}

export function priceVersionDisplayStatusTone(status: PriceVersionDisplayStatus): string {
  switch (status) {
    case 'PUBLISHED':
      return 'sq-tone-success';
    case 'SCHEDULED':
      return 'sq-tone-info';
    case 'ARCHIVED':
      return 'sq-tone-neutral';
    default:
      return 'sq-tone-warning';
  }
}

export function pricingModelLabel(model: string): string {
  if (model === 'GRADUATED') return 'Gestaffelt (Graduated)';
  if (model === 'VOLUME') return 'Volumen (Volume)';
  return model;
}

export function tierModeLabel(mode: string): string {
  return pricingModelLabel(mode);
}

export function catalogProductRoleLabel(role: string): string {
  if (role === 'BASE_PLAN') return 'Grundtarif';
  if (role === 'ADDON') return 'Add-on';
  return role;
}

export function catalogProductStatusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Aktiv';
  if (status === 'INACTIVE') return 'Inaktiv';
  return status;
}

export function isPublishedVersionEditable(
  version: Pick<AdminBillingPriceVersionDto, 'status'>,
): boolean {
  return version.status === 'DRAFT';
}

export function baseCatalogProducts(products: AdminBillingCatalogProductDto[]) {
  return products.filter((product) => product.productRole === 'BASE_PLAN');
}

export function addonCatalogProducts(products: AdminBillingCatalogProductDto[]) {
  return products.filter((product) => product.productRole === 'ADDON');
}

export interface TierValidationIssue {
  tierIndex: number;
  message: string;
  kind: 'overlap' | 'gap' | 'missing_price' | 'invalid_range' | 'first_tier' | 'unlimited';
}

const TIER_ERROR_MESSAGES: Record<string, string> = {
  TIER_GAP: 'Lücke zur vorherigen Staffel',
  TIERS_OVERLAP: 'Überschneidung mit vorheriger Staffel',
  FIRST_TIER_NOT_ONE: 'Erste Staffel muss bei 1 beginnen',
  UNLIMITED_NOT_LAST: 'Unbegrenzte Staffel nur als letzte Zeile',
  MULTIPLE_UNLIMITED_TIERS: 'Nur eine unbegrenzte Staffel erlaubt',
};

export function validateTierRows(tiers: AdminBillingPriceTierDto[]): TierValidationIssue[] {
  const issues: TierValidationIssue[] = [];
  const sorted = [...tiers].sort((a, b) => a.minVehicles - b.minVehicles);

  if (sorted.length > 0 && sorted[0].minVehicles !== 1) {
    issues.push({
      tierIndex: tiers.indexOf(sorted[0]),
      message: TIER_ERROR_MESSAGES.FIRST_TIER_NOT_ONE,
      kind: 'first_tier',
    });
  }

  sorted.forEach((tier) => {
    const tierIndex = tiers.indexOf(tier);
    if (tier.maxVehicles != null && tier.maxVehicles < tier.minVehicles) {
      issues.push({
        tierIndex,
        message: 'Max muss ≥ Min sein',
        kind: 'invalid_range',
      });
    }
    if (tier.unitPriceCents == null) {
      issues.push({
        tierIndex,
        message: 'Preis noch nicht konfiguriert',
        kind: 'missing_price',
      });
    }
    if (tier.maxVehicles == null && tier !== sorted[sorted.length - 1]) {
      issues.push({
        tierIndex,
        message: TIER_ERROR_MESSAGES.UNLIMITED_NOT_LAST,
        kind: 'unlimited',
      });
    }
  });

  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const previousIndex = tiers.indexOf(previous);
    const currentIndex = tiers.indexOf(current);

    if (previous.maxVehicles == null) {
      issues.push({
        tierIndex: currentIndex,
        message: TIER_ERROR_MESSAGES.MULTIPLE_UNLIMITED_TIERS,
        kind: 'unlimited',
      });
      continue;
    }

    if (current.minVehicles <= previous.maxVehicles) {
      issues.push({
        tierIndex: currentIndex,
        message: TIER_ERROR_MESSAGES.TIERS_OVERLAP,
        kind: 'overlap',
      });
    } else if (current.minVehicles !== previous.maxVehicles + 1) {
      issues.push({
        tierIndex: currentIndex,
        message: TIER_ERROR_MESSAGES.TIER_GAP,
        kind: 'gap',
      });
    }
  }

  return issues;
}

export function mapStripeCatalogError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('STRIPE_CATALOG_VERSION_NOT_PUBLISHED')) {
    return 'Nur veröffentlichte Versionen können gemappt werden.';
  }
  if (message.includes('STRIPE_CATALOG_MODE_MISMATCH')) {
    return 'Stripe-Modus passt nicht zur aktuellen API-Konfiguration.';
  }
  if (message.includes('STRIPE_CATALOG_DUPLICATE_PRICE_ID')) {
    return 'Diese Stripe-Preis-ID ist bereits vergeben.';
  }
  if (message.includes('STRIPE_CATALOG_CURRENCY_MISMATCH')) {
    return 'Währung stimmt nicht mit dem Pricebook überein.';
  }
  if (message.includes('STRIPE_CATALOG_INTERVAL_MISMATCH')) {
    return 'Abrechnungsintervall stimmt nicht überein.';
  }
  return message;
}
