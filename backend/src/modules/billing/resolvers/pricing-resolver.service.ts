import { Injectable } from '@nestjs/common';
import { ResolvedDiscount, ResolvedItemPricing } from '../domain/billing-resolver.types';
import { BillingPriceResolutionService } from '../billing-price-resolution.service';

export interface ResolveItemPricingInput {
  billableQuantity: number;
  asOf?: Date;
  priceBookId?: string | null;
  discounts?: ResolvedDiscount[];
}

@Injectable()
export class PricingResolverService {
  constructor(private readonly priceResolution: BillingPriceResolutionService) {}

  async resolveItemPricing(input: ResolveItemPricingInput): Promise<ResolvedItemPricing> {
    const asOf = input.asOf ?? new Date();
    const primaryDiscount = this.selectPrimaryDiscount(input.discounts ?? []);

    const priceResult = await this.priceResolution.calculateVolumePrice(input.billableQuantity, {
      priceBookId: input.priceBookId ?? undefined,
      asOf,
      customUnitPriceCents: primaryDiscount?.customUnitPriceCents ?? null,
      customMonthlyMinimumCents: primaryDiscount?.customMonthlyMinimumCents ?? null,
    });

    return {
      priceBookId: priceResult.priceBookId,
      priceVersionId: priceResult.priceVersionId,
      currency: priceResult.currency,
      tier: priceResult.tier,
      unitPriceCents: priceResult.unitPriceCents,
      subtotalCents: priceResult.subtotalCents,
      totalCents: priceResult.totalCents,
      calculationStatus: priceResult.calculationStatus,
      quantity: input.billableQuantity,
      resolvedAt: asOf,
    };
  }

  /**
   * Until a formal discount stack exists, the highest-priority org override wins.
   * Sort order: lowest `sortOrder` first; ties broken by latest `validFrom`.
   */
  private selectPrimaryDiscount(discounts: ResolvedDiscount[]): ResolvedDiscount | null {
    if (discounts.length === 0) return null;
    return [...discounts].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.validFrom.getTime() - a.validFrom.getTime();
    })[0];
  }
}
