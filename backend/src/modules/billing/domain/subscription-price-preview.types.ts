import { BillingUsageCalculationStatus } from '@prisma/client';
import { PricingModel } from './billing-domain.types';
import { BillingPriceResolutionSource, BillingPricingErrorCode } from './billing-pricing.errors';
import { AppliedDiscountLine, SkippedDiscountLine } from './discount-calculator';
import { TierPricingLine } from './tier-pricing-calculator';
import { ResolvedPriceTier } from './billing-resolver.types';

export interface SubscriptionPricePreviewTariff {
  priceBookId: string | null;
  name: string | null;
  productKey: string | null;
  interval: string | null;
}

export interface SubscriptionPricePreviewProduct {
  slug: string | null;
  name: string | null;
  plan: string | null;
}

export interface SubscriptionPricePreviewVersion {
  id: string | null;
  versionNumber: number | null;
  versionLabel: string | null;
  status: string | null;
}

export interface SubscriptionPricePreviewTax {
  configured: boolean;
  taxRateBps: number | null;
  taxBasisCents: number | null;
  taxCents: number | null;
  netCents: number | null;
  grossCents: number | null;
}

export interface SubscriptionPricePreview {
  organizationId: string;
  subscriptionId: string | null;
  subscriptionItemId: string | null;
  calculationStatus: BillingUsageCalculationStatus;
  tariff: SubscriptionPricePreviewTariff;
  product: SubscriptionPricePreviewProduct;
  priceVersion: SubscriptionPricePreviewVersion;
  pricingModel: typeof PricingModel.VOLUME | typeof PricingModel.GRADUATED;
  vehicleCount: number;
  connectedVehicleCount: number;
  tierBreakdown: TierPricingLine[];
  tier: ResolvedPriceTier | null;
  unitPriceCents: number | null;
  baseAmountCents: number | null;
  discounts: AppliedDiscountLine[];
  skippedDiscounts: SkippedDiscountLine[];
  amountAfterDiscountCents: number | null;
  totalDiscountCents: number;
  tax: SubscriptionPricePreviewTax;
  currency: string | null;
  warnings: string[];
  legacyFallbacks: string[];
  priceResolutionSource: BillingPriceResolutionSource | null;
  pricingErrorCode: BillingPricingErrorCode | null;
  legacyFallbackUsed: boolean;
  resolvedAt: Date;
}
