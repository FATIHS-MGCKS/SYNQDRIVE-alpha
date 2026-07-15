import { Injectable } from '@nestjs/common';
import {
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
  ProductSlug,
} from '@prisma/client';
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

    const priceBookId = sub?.priceBookId ?? null;
    const priceVersionId = sub?.priceVersionId ?? null;

    const status = sub
      ? mapPrismaBillingStatusToDomain(sub.status, {
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        })
      : SubscriptionStatus.DRAFT;

    const currentPeriod = this.resolveBillingPeriod(sub);
    const items = await this.buildContractItems(
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

  private async buildContractItems(
    organizationId: string,
    subscriptionId: string | null,
    priceBookId: string | null,
    priceVersionId: string | null,
    quantity: number,
  ): Promise<ResolvedSubscriptionItem[]> {
    if (subscriptionId) {
      const persisted = await this.prisma.billingSubscriptionItem.findMany({
        where: {
          organizationId,
          subscriptionId,
          status: {
            in: [BillingSubscriptionItemStatus.ACTIVE, BillingSubscriptionItemStatus.TRIALING],
          },
        },
        include: {
          billingProduct: { select: { key: true } },
        },
        orderBy: { validFrom: 'desc' },
      });

      if (persisted.length > 0) {
        return persisted.map((item) => ({
          id: item.id,
          productKind: mapProductSlugToBillingProductKind(item.billingProduct.key),
          addonKey: item.itemRole === BillingSubscriptionItemRole.ADDON
            ? (item.billingProduct.key as ResolvedSubscriptionItem['addonKey'])
            : null,
          priceBookId: item.priceBookId ?? priceBookId,
          priceVersionId: item.priceVersionId ?? priceVersionId,
          quantity: item.quantity,
        }));
      }
    }

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
    return [
      {
        id: `${subKey}:base`,
        productKind,
        addonKey: null,
        priceBookId,
        priceVersionId,
        quantity,
      },
    ];
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
