import { Injectable } from '@nestjs/common';
import {
  BillingDiscountStatus,
  BillingDiscountType,
  BillingOrgPriceOverrideStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DiscountKind } from '../domain';
import {
  DiscountApplicationPhase,
  DiscountSource,
  ResolvedDiscount,
} from '../domain/billing-resolver.types';

export interface ResolveDiscountsOptions {
  asOf?: Date;
  priceBookId?: string | null;
  priceVersionId?: string | null;
  subscriptionItemId?: string | null;
}

const LEGACY_SORT_OFFSET = 0;
const FORMAL_SORT_OFFSET = 1_000;

@Injectable()
export class DiscountResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveDiscounts(
    organizationId: string,
    opts: ResolveDiscountsOptions = {},
  ): Promise<ResolvedDiscount[]> {
    const asOf = opts.asOf ?? new Date();

    const subscription = await this.prisma.billingSubscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const overrides = await this.prisma.billingOrganizationPriceOverride.findMany({
      where: {
        organizationId,
        status: BillingOrgPriceOverrideStatus.ACTIVE,
        validFrom: { lte: asOf },
        OR: [{ validTo: null }, { validTo: { gte: asOf } }],
      },
      orderBy: [{ validFrom: 'desc' }],
    });

    const formalDiscounts = subscription
      ? await this.prisma.billingDiscount.findMany({
          where: {
            subscriptionId: subscription.id,
            status: BillingDiscountStatus.ACTIVE,
            validFrom: { lte: asOf },
            OR: [{ validTo: null }, { validTo: { gte: asOf } }],
          },
          orderBy: [{ validFrom: 'asc' }, { createdAt: 'asc' }],
        })
      : [];

    const scopedOverrides = overrides.filter((row) => {
      if (opts.priceBookId && row.priceBookId && row.priceBookId !== opts.priceBookId) {
        return false;
      }
      if (opts.priceVersionId && row.priceVersionId && row.priceVersionId !== opts.priceVersionId) {
        return false;
      }
      return true;
    });

    const legacyDiscounts = scopedOverrides.map((row, index) =>
      this.mapLegacyOverride(row, LEGACY_SORT_OFFSET + index),
    );

    const scopedFormal = formalDiscounts.filter((row) => {
      if (!row.subscriptionItemId) return true;
      if (!opts.subscriptionItemId) return true;
      return row.subscriptionItemId === opts.subscriptionItemId;
    });

    const subscriptionDiscounts = scopedFormal.map((row, index) =>
      this.mapFormalDiscount(row, FORMAL_SORT_OFFSET + index),
    );

    return [...legacyDiscounts, ...subscriptionDiscounts].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.validFrom.getTime() - b.validFrom.getTime();
    });
  }

  async resolvePrimaryDiscount(
    organizationId: string,
    opts: ResolveDiscountsOptions = {},
  ): Promise<ResolvedDiscount | null> {
    const discounts = await this.resolveDiscounts(organizationId, opts);
    const baseAdjustments = discounts.filter(
      (discount) =>
        discount.applicationPhase === 'UNIT_PRICE' || discount.applicationPhase === 'MINIMUM',
    );
    if (baseAdjustments.length === 0) return null;
    return [...baseAdjustments].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  }

  private mapLegacyOverride(
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
    sortOrder: number,
  ): ResolvedDiscount {
    const applicationPhase: DiscountApplicationPhase = row.customMonthlyMinimumCents != null
      ? 'MINIMUM'
      : 'UNIT_PRICE';

    return {
      id: row.id,
      source: 'LEGACY_PRICE_OVERRIDE' satisfies DiscountSource,
      applicationPhase,
      kind: DiscountKind.FIXED_AMOUNT,
      percentBps: null,
      fixedAmountCents: null,
      currency: null,
      customUnitPriceCents: row.customUnitPriceCents,
      customMonthlyMinimumCents: row.customMonthlyMinimumCents,
      subscriptionItemId: null,
      priceBookId: row.priceBookId,
      priceVersionId: row.priceVersionId,
      reason: row.reason,
      validFrom: row.validFrom,
      validTo: row.validTo,
      sortOrder,
    };
  }

  private mapFormalDiscount(
    row: {
      id: string;
      discountType: BillingDiscountType;
      percentBps: number | null;
      fixedAmountCents: number | null;
      currency: string | null;
      subscriptionItemId: string | null;
      reason: string | null;
      validFrom: Date;
      validTo: Date | null;
    },
    sortOrder: number,
  ): ResolvedDiscount {
    const kind =
      row.discountType === BillingDiscountType.FIXED_AMOUNT
        ? DiscountKind.FIXED_AMOUNT
        : DiscountKind.PERCENTAGE;

    return {
      id: row.id,
      source: 'BILLING_DISCOUNT' satisfies DiscountSource,
      applicationPhase: 'SUBTOTAL',
      kind,
      percentBps: row.percentBps,
      fixedAmountCents: row.fixedAmountCents,
      currency: row.currency,
      customUnitPriceCents: null,
      customMonthlyMinimumCents: null,
      subscriptionItemId: row.subscriptionItemId,
      priceBookId: null,
      priceVersionId: null,
      reason: row.reason,
      validFrom: row.validFrom,
      validTo: row.validTo,
      sortOrder,
    };
  }
}
