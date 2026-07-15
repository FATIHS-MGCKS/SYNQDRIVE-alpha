import { Injectable } from '@nestjs/common';
import { BillingOrgPriceOverrideStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DiscountKind } from '../domain';
import { ResolvedDiscount } from '../domain/billing-resolver.types';

export interface ResolveDiscountsOptions {
  asOf?: Date;
  priceBookId?: string | null;
  priceVersionId?: string | null;
}

@Injectable()
export class DiscountResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveDiscounts(
    organizationId: string,
    opts: ResolveDiscountsOptions = {},
  ): Promise<ResolvedDiscount[]> {
    const asOf = opts.asOf ?? new Date();

    const overrides = await this.prisma.billingOrganizationPriceOverride.findMany({
      where: {
        organizationId,
        status: BillingOrgPriceOverrideStatus.ACTIVE,
        validFrom: { lte: asOf },
        OR: [{ validTo: null }, { validTo: { gte: asOf } }],
      },
      orderBy: [{ validFrom: 'desc' }],
    });

    const scoped = overrides.filter((row) => {
      if (opts.priceBookId && row.priceBookId && row.priceBookId !== opts.priceBookId) {
        return false;
      }
      if (opts.priceVersionId && row.priceVersionId && row.priceVersionId !== opts.priceVersionId) {
        return false;
      }
      return true;
    });

    return scoped.map((row, index) => this.mapOverride(row, index));
  }

  async resolvePrimaryDiscount(
    organizationId: string,
    opts: ResolveDiscountsOptions = {},
  ): Promise<ResolvedDiscount | null> {
    const discounts = await this.resolveDiscounts(organizationId, opts);
    if (discounts.length === 0) return null;
    return [...discounts].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  }

  private mapOverride(
    row: {
      id: string;
      customUnitPriceCents: number | null;
      customMonthlyMinimumCents: number | null;
      priceBookId: string | null;
      priceVersionId: string | null;
      reason: string | null;
      validFrom: Date;
      validTo: Date | null;
    },
    index: number,
  ): ResolvedDiscount {
    const kind =
      row.customUnitPriceCents != null || row.customMonthlyMinimumCents != null
        ? DiscountKind.FIXED_AMOUNT
        : DiscountKind.PERCENTAGE;

    return {
      id: row.id,
      kind,
      customUnitPriceCents: row.customUnitPriceCents,
      customMonthlyMinimumCents: row.customMonthlyMinimumCents,
      priceBookId: row.priceBookId,
      priceVersionId: row.priceVersionId,
      reason: row.reason,
      validFrom: row.validFrom,
      validTo: row.validTo,
      sortOrder: index,
    };
  }
}
