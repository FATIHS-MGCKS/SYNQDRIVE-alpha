import { BillingStripeMode, BillingStatus, BusinessType, ProductSlug } from '@prisma/client';
import { BillingLegacyBackfillConflictCode } from './billing-legacy-backfill.types';

export const BASE_BILLING_PRODUCT_KEYS = ['RENTAL', 'FLEET'] as const;
export type BaseBillingProductKey = (typeof BASE_BILLING_PRODUCT_KEYS)[number];

export const BILLING_CATALOG_BASE_PRODUCT_SEEDS: Array<{
  id: string;
  key: BaseBillingProductKey;
  name: string;
  description: string;
  sortOrder: number;
}> = [
  {
    id: 'bprod-rental-0001-4000-8000-000000000001',
    key: 'RENTAL',
    name: 'SynqDrive Rental',
    description: 'Rental platform base plan',
    sortOrder: 10,
  },
  {
    id: 'bprod-fleet-0001-4000-8000-000000000002',
    key: 'FLEET',
    name: 'SynqDrive Fleet',
    description: 'Fleet platform base plan',
    sortOrder: 20,
  },
];

export interface BaseProductInferenceInput {
  orgProductSlugs: string[];
  subscriptionPriceBookProductKey: string | null;
  businessType: BusinessType | null;
}

export interface BaseProductInferenceResult {
  productKey: BaseBillingProductKey | null;
  source: 'ORG_PRODUCT' | 'PRICE_BOOK' | 'BUSINESS_TYPE' | null;
  conflicts: BillingLegacyBackfillConflictCode[];
  warnings: string[];
}

function normalizeSlug(slug: string): string {
  return slug.trim().toUpperCase();
}

function slugToBaseProductKey(slug: string): BaseBillingProductKey | null {
  const key = normalizeSlug(slug);
  if (key === ProductSlug.RENTAL || key === 'RENTAL') return 'RENTAL';
  if (key === ProductSlug.FLEET || key === 'FLEET') return 'FLEET';
  if (key === ProductSlug.TAXI || key === 'TAXI') return 'RENTAL';
  return null;
}

export function inferBaseBillingProductKey(
  input: BaseProductInferenceInput,
): BaseProductInferenceResult {
  const conflicts: BillingLegacyBackfillConflictCode[] = [];
  const warnings: string[] = [];

  const baseFromOrg = new Set<BaseBillingProductKey>();
  for (const slug of input.orgProductSlugs) {
    const mapped = slugToBaseProductKey(slug);
    if (mapped) baseFromOrg.add(mapped);
  }

  if (baseFromOrg.has('RENTAL') && baseFromOrg.has('FLEET')) {
    return {
      productKey: null,
      source: null,
      conflicts: ['RENTAL_AND_FLEET_ACTIVE'],
      warnings,
    };
  }

  if (baseFromOrg.size === 1) {
    return {
      productKey: [...baseFromOrg][0],
      source: 'ORG_PRODUCT',
      conflicts,
      warnings,
    };
  }

  const priceBookKey = input.subscriptionPriceBookProductKey
    ? slugToBaseProductKey(input.subscriptionPriceBookProductKey)
    : null;
  if (priceBookKey) {
    return {
      productKey: priceBookKey,
      source: 'PRICE_BOOK',
      conflicts,
      warnings,
    };
  }

  if (input.businessType) {
    if (input.businessType === BusinessType.FLEET) {
      return {
        productKey: 'FLEET',
        source: 'BUSINESS_TYPE',
        conflicts,
        warnings: ['Inferred base product from organization.businessType'],
      };
    }
    if (
      input.businessType === BusinessType.RENTAL ||
      input.businessType === BusinessType.TAXI
    ) {
      return {
        productKey: 'RENTAL',
        source: 'BUSINESS_TYPE',
        conflicts,
        warnings: ['Inferred base product from organization.businessType'],
      };
    }
    conflicts.push('AMBIGUOUS_BASE_PRODUCT');
    warnings.push(
      `businessType ${input.businessType} does not map to Rental/Fleet without subscription or org product`,
    );
    return { productKey: null, source: null, conflicts, warnings };
  }

  conflicts.push('AMBIGUOUS_BASE_PRODUCT');
  return { productKey: null, source: null, conflicts, warnings };
}

export function resolveStripeModeFromSecretKey(
  secretKey: string | undefined | null,
): BillingStripeMode | null {
  const key = secretKey?.trim() ?? '';
  if (key.startsWith('sk_test_')) return BillingStripeMode.TEST;
  if (key.startsWith('sk_live_')) return BillingStripeMode.LIVE;
  return null;
}

export function classifyStripePriceIdMode(
  stripePriceId: string | undefined | null,
  secretKey: string | undefined | null,
): BillingStripeMode | null {
  if (!stripePriceId?.trim()) return null;
  return resolveStripeModeFromSecretKey(secretKey);
}

export function mapSubscriptionStatusToItemStatus(
  status: BillingStatus,
): 'ACTIVE' | 'TRIALING' | 'CANCELLED' | 'PAUSED' | 'DRAFT' | 'ENDED' {
  switch (status) {
    case BillingStatus.TRIALING:
      return 'TRIALING';
    case BillingStatus.CANCELLED:
      return 'CANCELLED';
    case BillingStatus.PAST_DUE:
      return 'ACTIVE';
    case BillingStatus.ACTIVE:
    default:
      return 'ACTIVE';
  }
}

export function buildQuantityBackfillIdempotencyKey(
  organizationId: string,
  subscriptionItemId: string,
): string {
  return `legacy-backfill:quantity:v1:${organizationId}:${subscriptionItemId}`;
}

export function hasLegacyBackfillMarker(value: string | null | undefined): boolean {
  return (value ?? '').includes('[legacy-backfill:documented]');
}

export function appendLegacyBackfillMarker(reason: string | null | undefined): string {
  const base = reason?.trim() ?? '';
  const marker = '[legacy-backfill:documented]';
  if (base.includes(marker)) return base;
  return base ? `${base} ${marker}` : marker;
}

export function sourcesConflict(
  orgProductKey: BaseBillingProductKey | null,
  priceBookKey: BaseBillingProductKey | null,
): boolean {
  return Boolean(orgProductKey && priceBookKey && orgProductKey !== priceBookKey);
}
