import { Injectable, Logger } from '@nestjs/common';
import {
  BillingOrgPriceOverrideStatus,
  BillingPriceVersionStatus,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingPriceResolutionService } from '../billing-price-resolution.service';
import {
  BillingPriceResolutionSource,
  BillingPricingErrorCode,
} from '../domain/billing-pricing.errors';
import {
  ResolvedDiscount,
  ResolvedItemPricing,
  ResolvedPriceAssignment,
} from '../domain/billing-resolver.types';
import { PricebookService } from '../pricebook.service';

export interface ResolvePriceAssignmentOptions {
  asOf?: Date;
  /** When true, archived versions may be read for historical display only. */
  allowArchivedVersion?: boolean;
}

export interface ResolveItemPricingInput {
  organizationId: string;
  billableQuantity: number;
  asOf?: Date;
  allowArchivedVersion?: boolean;
  discounts?: ResolvedDiscount[];
}

/** @deprecated Prefer resolveItemPricingForOrganization — explicit org-scoped resolution. */
export interface ResolveItemPricingLegacyInput {
  billableQuantity: number;
  asOf?: Date;
  priceBookId?: string | null;
  priceVersionId?: string | null;
  discounts?: ResolvedDiscount[];
}

@Injectable()
export class PricingResolverService {
  private readonly logger = new Logger(PricingResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricebook: PricebookService,
    private readonly priceResolution: BillingPriceResolutionService,
  ) {}

  async resolvePriceAssignment(
    organizationId: string,
    opts: ResolvePriceAssignmentOptions = {},
  ): Promise<ResolvedPriceAssignment> {
    const asOf = opts.asOf ?? new Date();
    const allowArchived = opts.allowArchivedVersion ?? false;

    const subscription = await this.prisma.billingSubscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        organizationId: true,
        priceBookId: true,
        priceVersionId: true,
      },
    });

    if (!subscription) {
      return this.unresolvedAssignment(organizationId, asOf, {
        pricingErrorCode: BillingPricingErrorCode.BILLING_SUBSCRIPTION_NOT_FOUND,
        source: 'UNRESOLVED',
      });
    }

    if (subscription.organizationId !== organizationId) {
      return this.unresolvedAssignment(organizationId, asOf, {
        pricingErrorCode: BillingPricingErrorCode.BILLING_PRICE_NOT_ASSIGNED,
        source: 'UNRESOLVED',
      });
    }

    const baseItem = await this.prisma.billingSubscriptionItem.findFirst({
      where: {
        organizationId,
        subscriptionId: subscription.id,
        itemRole: BillingSubscriptionItemRole.BASE_PLAN,
        status: {
          in: [BillingSubscriptionItemStatus.ACTIVE, BillingSubscriptionItemStatus.TRIALING],
        },
      },
      orderBy: { validFrom: 'desc' },
      select: {
        id: true,
        priceBookId: true,
        priceVersionId: true,
      },
    });

    if (baseItem?.priceVersionId) {
      const versionOk = await this.validateVersionForSelection(
        baseItem.priceVersionId,
        asOf,
        allowArchived,
      );
      if (versionOk.valid) {
        return {
          organizationId,
          subscriptionId: subscription.id,
          subscriptionItemId: baseItem.id,
          priceBookId: versionOk.priceBookId ?? baseItem.priceBookId,
          priceVersionId: baseItem.priceVersionId,
          source: 'SUBSCRIPTION_ITEM_VERSION',
          legacyFallbackUsed: false,
          pricingErrorCode: null,
          resolvedAt: asOf,
        };
      }
      return this.unresolvedAssignment(organizationId, asOf, {
        subscriptionId: subscription.id,
        subscriptionItemId: baseItem.id,
        pricingErrorCode: BillingPricingErrorCode.BILLING_PRICE_VERSION_INVALID,
        source: 'SUBSCRIPTION_ITEM_VERSION',
      });
    }

    if (baseItem?.priceBookId) {
      const activeVersion = await this.pricebook.findActiveVersion(baseItem.priceBookId, asOf);
      if (activeVersion) {
        return {
          organizationId,
          subscriptionId: subscription.id,
          subscriptionItemId: baseItem.id,
          priceBookId: baseItem.priceBookId,
          priceVersionId: activeVersion.id,
          source: 'SUBSCRIPTION_ITEM_PRICE_BOOK',
          legacyFallbackUsed: false,
          pricingErrorCode: null,
          resolvedAt: asOf,
        };
      }
      return this.unresolvedAssignment(organizationId, asOf, {
        subscriptionId: subscription.id,
        subscriptionItemId: baseItem.id,
        priceBookId: baseItem.priceBookId,
        pricingErrorCode: BillingPricingErrorCode.BILLING_PRICE_VERSION_INVALID,
        source: 'SUBSCRIPTION_ITEM_PRICE_BOOK',
      });
    }

    if (subscription.priceVersionId) {
      const versionOk = await this.validateVersionForSelection(
        subscription.priceVersionId,
        asOf,
        allowArchived,
      );
      if (versionOk.valid) {
        return {
          organizationId,
          subscriptionId: subscription.id,
          subscriptionItemId: null,
          priceBookId: versionOk.priceBookId ?? subscription.priceBookId,
          priceVersionId: subscription.priceVersionId,
          source: 'LEGACY_SUBSCRIPTION_CONTRACT',
          legacyFallbackUsed: false,
          pricingErrorCode: null,
          resolvedAt: asOf,
        };
      }
      return this.unresolvedAssignment(organizationId, asOf, {
        subscriptionId: subscription.id,
        priceBookId: subscription.priceBookId,
        pricingErrorCode: BillingPricingErrorCode.BILLING_PRICE_VERSION_INVALID,
        source: 'LEGACY_SUBSCRIPTION_CONTRACT',
      });
    }

    if (subscription.priceBookId) {
      const activeVersion = await this.pricebook.findActiveVersion(
        subscription.priceBookId,
        asOf,
      );
      if (activeVersion) {
        return {
          organizationId,
          subscriptionId: subscription.id,
          subscriptionItemId: null,
          priceBookId: subscription.priceBookId,
          priceVersionId: activeVersion.id,
          source: 'LEGACY_SUBSCRIPTION_CONTRACT',
          legacyFallbackUsed: false,
          pricingErrorCode: null,
          resolvedAt: asOf,
        };
      }
      return this.unresolvedAssignment(organizationId, asOf, {
        subscriptionId: subscription.id,
        priceBookId: subscription.priceBookId,
        pricingErrorCode: BillingPricingErrorCode.BILLING_PRICE_VERSION_INVALID,
        source: 'LEGACY_SUBSCRIPTION_CONTRACT',
      });
    }

    if (await this.hasLegacyMarkedData(organizationId)) {
      const config = await this.pricebook.getPricingConfiguration();
      if (config.configured && config.priceBook && config.activeVersion) {
        this.logger.warn({
          msg: 'billing.pricing.legacy_fallback_used',
          organizationId,
          priceBookId: config.priceBook.id,
          priceVersionId: config.activeVersion.id,
        });
        return {
          organizationId,
          subscriptionId: subscription.id,
          subscriptionItemId: baseItem?.id ?? null,
          priceBookId: config.priceBook.id,
          priceVersionId: config.activeVersion.id,
          source: 'LEGACY_MARKED_FALLBACK_DEFAULT',
          legacyFallbackUsed: true,
          pricingErrorCode: BillingPricingErrorCode.BILLING_LEGACY_FALLBACK_USED,
          resolvedAt: asOf,
        };
      }
    }

    return this.unresolvedAssignment(organizationId, asOf, {
      subscriptionId: subscription.id,
      subscriptionItemId: baseItem?.id ?? null,
      pricingErrorCode: BillingPricingErrorCode.BILLING_PRICE_NOT_ASSIGNED,
      source: 'UNRESOLVED',
    });
  }

  async resolveItemPricingForOrganization(
    input: ResolveItemPricingInput,
  ): Promise<ResolvedItemPricing> {
    const asOf = input.asOf ?? new Date();
    const assignment = await this.resolvePriceAssignment(input.organizationId, {
      asOf,
      allowArchivedVersion: input.allowArchivedVersion,
    });

    if (!assignment.priceVersionId) {
      return this.emptyPricing(input.billableQuantity, asOf, assignment);
    }

    const primaryDiscount = this.selectPrimaryDiscount(input.discounts ?? []);
    const priceResult = await this.priceResolution.calculateVolumePriceForVersion(
      assignment.priceVersionId,
      input.billableQuantity,
      {
        asOf,
        priceBookId: assignment.priceBookId,
        customUnitPriceCents: primaryDiscount?.customUnitPriceCents ?? null,
        customMonthlyMinimumCents: primaryDiscount?.customMonthlyMinimumCents ?? null,
      },
    );

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
      priceResolutionSource: assignment.source,
      pricingErrorCode: assignment.pricingErrorCode,
      legacyFallbackUsed: assignment.legacyFallbackUsed,
    };
  }

  /**
   * Direct pricing when caller already resolved assignment (admin tools, tests).
   */
  async resolveItemPricing(input: ResolveItemPricingLegacyInput): Promise<ResolvedItemPricing> {
    const asOf = input.asOf ?? new Date();
    const primaryDiscount = this.selectPrimaryDiscount(input.discounts ?? []);

    const priceResult = await this.priceResolution.calculateVolumePrice(input.billableQuantity, {
      priceBookId: input.priceBookId ?? undefined,
      priceVersionId: input.priceVersionId ?? undefined,
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
      priceResolutionSource: input.priceVersionId
        ? 'SUBSCRIPTION_ITEM_VERSION'
        : input.priceBookId
          ? 'SUBSCRIPTION_ITEM_PRICE_BOOK'
          : null,
      pricingErrorCode: null,
      legacyFallbackUsed: false,
    };
  }

  private async validateVersionForSelection(
    priceVersionId: string,
    asOf: Date,
    allowArchived: boolean,
  ): Promise<{ valid: boolean; priceBookId: string | null }> {
    const version = await this.prisma.billingPriceVersion.findUnique({
      where: { id: priceVersionId },
      select: {
        id: true,
        priceBookId: true,
        status: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });
    if (!version) {
      return { valid: false, priceBookId: null };
    }

    if (version.status === BillingPriceVersionStatus.ARCHIVED) {
      return { valid: allowArchived, priceBookId: version.priceBookId };
    }

    if (version.status !== BillingPriceVersionStatus.ACTIVE) {
      return { valid: false, priceBookId: version.priceBookId };
    }

    if (version.effectiveFrom && version.effectiveFrom > asOf) {
      return { valid: false, priceBookId: version.priceBookId };
    }
    if (version.effectiveTo && version.effectiveTo < asOf) {
      return { valid: false, priceBookId: version.priceBookId };
    }

    return { valid: true, priceBookId: version.priceBookId };
  }

  private async hasLegacyMarkedData(organizationId: string): Promise<boolean> {
    const [markedOverride, legacyQuantityEvent] = await Promise.all([
      this.prisma.billingOrganizationPriceOverride.findFirst({
        where: {
          organizationId,
          status: BillingOrgPriceOverrideStatus.ACTIVE,
          reason: { contains: '[legacy-backfill:documented]' },
        },
        select: { id: true },
      }),
      this.prisma.billingQuantityEvent.findFirst({
        where: {
          organizationId,
          idempotencyKey: { startsWith: 'legacy-backfill:quantity:v1:' },
        },
        select: { id: true },
      }),
    ]);

    return Boolean(markedOverride || legacyQuantityEvent);
  }

  private unresolvedAssignment(
    organizationId: string,
    asOf: Date,
    partial: {
      subscriptionId?: string | null;
      subscriptionItemId?: string | null;
      priceBookId?: string | null;
      pricingErrorCode: BillingPricingErrorCode;
      source: BillingPriceResolutionSource;
    },
  ): ResolvedPriceAssignment {
    return {
      organizationId,
      subscriptionId: partial.subscriptionId ?? null,
      subscriptionItemId: partial.subscriptionItemId ?? null,
      priceBookId: partial.priceBookId ?? null,
      priceVersionId: null,
      source: partial.source,
      legacyFallbackUsed: false,
      pricingErrorCode: partial.pricingErrorCode,
      resolvedAt: asOf,
    };
  }

  private emptyPricing(
    quantity: number,
    asOf: Date,
    assignment: ResolvedPriceAssignment,
  ): ResolvedItemPricing {
    return {
      priceBookId: assignment.priceBookId,
      priceVersionId: null,
      currency: null,
      tier: null,
      unitPriceCents: null,
      subtotalCents: null,
      totalCents: null,
      calculationStatus: 'NO_ACTIVE_PRICE_VERSION' as ResolvedItemPricing['calculationStatus'],
      quantity,
      resolvedAt: asOf,
      priceResolutionSource: assignment.source,
      pricingErrorCode: assignment.pricingErrorCode,
      legacyFallbackUsed: assignment.legacyFallbackUsed,
    };
  }

  private selectPrimaryDiscount(discounts: ResolvedDiscount[]): ResolvedDiscount | null {
    if (discounts.length === 0) return null;
    return [...discounts].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.validFrom.getTime() - a.validFrom.getTime();
    })[0];
  }
}
