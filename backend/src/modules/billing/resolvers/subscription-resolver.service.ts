import { Injectable } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BillingProductKind,
  SubscriptionStatus,
  mapPrismaBillingStatusToDomain,
  mapProductSlugToBillingProductKind,
} from '../domain';
import {
  ResolvedBillingPeriod,
  ResolvedOrganizationContract,
  ResolvedSubscriptionItem,
} from '../domain/billing-resolver.types';
import { PricebookService } from '../pricebook.service';

export interface ResolveContractOptions {
  asOf?: Date;
  /** Billable quantity for synthetic base item — supplied by caller to avoid resolver cycles. */
  baseItemQuantity?: number;
}

@Injectable()
export class SubscriptionResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricebook: PricebookService,
  ) {}

  async resolveContract(
    organizationId: string,
    opts: ResolveContractOptions = {},
  ): Promise<ResolvedOrganizationContract> {
    const asOf = opts.asOf ?? new Date();
    const sub = await this.prisma.billingSubscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    const pricingConfig = await this.pricebook.getPricingConfiguration();
    const fallbackPriceBookId = pricingConfig.priceBook?.id ?? null;
    const fallbackPriceVersionId = pricingConfig.activeVersion?.id ?? null;

    const priceBookId = sub?.priceBookId ?? fallbackPriceBookId;
    const priceVersionId = sub?.priceVersionId ?? fallbackPriceVersionId;

    const status = sub
      ? mapPrismaBillingStatusToDomain(sub.status, {
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        })
      : SubscriptionStatus.DRAFT;

    const currentPeriod = this.resolveBillingPeriod(sub);
    const items = await this.buildSyntheticItems(
      organizationId,
      sub?.id ?? null,
      priceBookId,
      priceVersionId,
      opts.baseItemQuantity ?? 0,
    );

    return {
      organizationId,
      subscriptionId: sub?.id ?? null,
      status,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      currentPeriod,
      priceBookId,
      priceVersionId,
      stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
      items,
      resolvedAt: asOf,
    };
  }

  private resolveBillingPeriod(
    sub: {
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
    } | null,
  ): ResolvedBillingPeriod {
    if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
      return {
        start: sub.currentPeriodStart,
        end: sub.currentPeriodEnd,
        source: 'SUBSCRIPTION',
      };
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, source: 'CALENDAR_FALLBACK' };
  }

  private async buildSyntheticItems(
    organizationId: string,
    subscriptionId: string | null,
    priceBookId: string | null,
    priceVersionId: string | null,
    quantity: number,
  ): Promise<ResolvedSubscriptionItem[]> {
    const orgProducts = await this.prisma.organizationProduct.findMany({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      include: { product: { select: { slug: true } } },
    });

    const baseSlugs = orgProducts
      .map((p) => p.product.slug)
      .filter((slug) => slug === ProductSlug.RENTAL || slug === ProductSlug.FLEET);

    const productKind =
      baseSlugs.length > 0
        ? mapProductSlugToBillingProductKind(baseSlugs[0])
        : await this.inferProductKindFromPriceBook(priceBookId);

    const subKey = subscriptionId ?? 'none';
    const items: ResolvedSubscriptionItem[] = [
      {
        id: `${subKey}:base`,
        productKind,
        addonKey: null,
        priceBookId,
        priceVersionId,
        quantity,
      },
    ];

    return items;
  }

  private async inferProductKindFromPriceBook(
    priceBookId: string | null,
  ): Promise<BillingProductKind> {
    if (!priceBookId) {
      return BillingProductKind.FLEET;
    }
    try {
      const book = await this.pricebook.getPriceBook(priceBookId);
      return mapProductSlugToBillingProductKind(book.productKey);
    } catch {
      return BillingProductKind.FLEET;
    }
  }
}
