import { BookingPriceLineItemType } from '@prisma/client';

/** Canonical source types for pricing line item provenance. */
export const PRICING_LINE_SOURCE_TYPES = {
  TARIFF_RATE: 'TARIFF_RATE',
  MILEAGE_PACKAGE: 'MILEAGE_PACKAGE',
  TARIFF_INSURANCE: 'TARIFF_INSURANCE',
  TARIFF_EXTRA: 'TARIFF_EXTRA',
  MANUAL: 'MANUAL',
  DEPOSIT_RESOLVER: 'DEPOSIT_RESOLVER',
} as const;

export type PricingLineSourceType =
  (typeof PRICING_LINE_SOURCE_TYPES)[keyof typeof PRICING_LINE_SOURCE_TYPES];

export interface PricingLineItemSourceMetadata {
  sourceType: PricingLineSourceType | string;
  sourceId: string | null;
  lineItemType: BookingPriceLineItemType | string;
  label: string;
  quantity: number;
  unitAmountCents: number;
  totalAmountCents: number;
  currency?: string;
  pricingType?: string;
  /** @deprecated Legacy — use sourceId */
  optionId?: string;
  /** @deprecated Legacy — use sourceId */
  packageId?: string;
  depositSource?: string;
  ruleRevisionId?: string | null;
  manualOverride?: boolean;
  depositReason?: string;
}

export function buildPricingLineMetadata(
  params: Omit<PricingLineItemSourceMetadata, 'quantity' | 'unitAmountCents' | 'totalAmountCents'> & {
    quantity?: number;
    unitAmountCents?: number;
    totalAmountCents?: number;
    pricingType?: string;
  },
): PricingLineItemSourceMetadata {
  const meta: PricingLineItemSourceMetadata = {
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    lineItemType: params.lineItemType,
    label: params.label,
    quantity: params.quantity ?? 1,
    unitAmountCents: params.unitAmountCents ?? 0,
    totalAmountCents: params.totalAmountCents ?? 0,
  };
  if (params.currency) meta.currency = params.currency;
  if (params.pricingType) meta.pricingType = params.pricingType;

  if (params.sourceId) {
    if (params.sourceType === PRICING_LINE_SOURCE_TYPES.MILEAGE_PACKAGE) {
      meta.packageId = params.sourceId;
    } else if (
      params.sourceType === PRICING_LINE_SOURCE_TYPES.TARIFF_INSURANCE ||
      params.sourceType === PRICING_LINE_SOURCE_TYPES.TARIFF_EXTRA
    ) {
      meta.optionId = params.sourceId;
    }
  }

  return meta;
}

export function resolveLineItemSourceId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.sourceId === 'string' && m.sourceId.trim()) return m.sourceId;
  if (typeof m.optionId === 'string' && m.optionId.trim()) return m.optionId;
  if (typeof m.packageId === 'string' && m.packageId.trim()) return m.packageId;
  return null;
}

export function lineItemMatchesSourceId(
  lineItem: { type?: string; metadataJson?: unknown },
  sourceId: string,
): boolean {
  return resolveLineItemSourceId(lineItem.metadataJson) === sourceId;
}
