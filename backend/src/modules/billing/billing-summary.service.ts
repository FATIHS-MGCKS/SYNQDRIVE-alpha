import { Injectable } from '@nestjs/common';
import {
  BillingPaymentMethodStatus,
  BillingStatus,
  BillingUsageCalculationStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PricebookService } from './pricebook.service';
import { StripePreparedService } from './stripe-prepared.service';
import {
  DiscountResolverService,
  PricingResolverService,
  QuantityResolverService,
  SubscriptionResolverService,
} from './resolvers';

const PLAN_DISPLAY: Record<string, string> = {
  STARTER: 'Starter',
  BUSINESS: 'Business',
  PROFESSIONAL: 'Business',
  ENTERPRISE: 'Enterprise',
  CUSTOM: 'Custom',
};

@Injectable()
export class BillingSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionResolver: SubscriptionResolverService,
    private readonly quantityResolver: QuantityResolverService,
    private readonly pricingResolver: PricingResolverService,
    private readonly discountResolver: DiscountResolverService,
    private readonly pricebook: PricebookService,
    private readonly stripePrepared: StripePreparedService,
  ) {}

  async getSummary(organizationId: string) {
    const [quantity, discounts, pricingConfig, defaultPm, orgProducts] = await Promise.all([
      this.quantityResolver.resolveQuantity(organizationId),
      this.discountResolver.resolveDiscounts(organizationId),
      this.pricebook.getPricingConfiguration(),
      this.prisma.billingPaymentMethod.findFirst({
        where: { organizationId: organizationId, isDefault: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organizationProduct.findMany({
        where: { organizationId },
        include: { product: { select: { slug: true, name: true } } },
      }),
    ]);

    const contract = await this.subscriptionResolver.resolveContract(organizationId, {
      baseItemQuantity: quantity.billableVehicleCount,
    });

    const priceResult = await this.pricingResolver.resolveItemPricing({
      billableQuantity: quantity.billableVehicleCount,
      priceBookId: contract.priceBookId,
      discounts,
    });

    const sub = contract.subscriptionId
      ? await this.prisma.billingSubscription.findUnique({
          where: { id: contract.subscriptionId },
        })
      : null;

    const period = contract.currentPeriod;
    const stripeStatus = this.stripePrepared.getPreparedStatus();
    const warnings = this.buildWarnings(sub, priceResult.calculationStatus, defaultPm);

    const activeProducts = orgProducts.filter(
      (p) => p.status === 'ACTIVE' || p.status === 'TRIAL',
    );

    return {
      organizationId,
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          }
        : null,
      subscriptionStatus: sub?.status ?? null,
      currentPeriodStart: period.start.toISOString(),
      currentPeriodEnd: period.end.toISOString(),
      cancelAtPeriodEnd: contract.cancelAtPeriodEnd,
      products: activeProducts.map((p) => ({
        slug: p.product.slug,
        name: p.product.name,
        plan: p.plan,
        planDisplay: PLAN_DISPLAY[p.plan] ?? p.plan,
        status: p.status,
      })),
      billingModel: 'PER_CONNECTED_VEHICLE' as const,
      connectedVehicleCount: quantity.connectedVehicleCount,
      billableVehicleCount: quantity.billableVehicleCount,
      currentTier: priceResult.tier
        ? {
            id: priceResult.tier.id,
            minVehicles: priceResult.tier.minVehicles,
            maxVehicles: priceResult.tier.maxVehicles,
            unitPriceCents: priceResult.unitPriceCents,
            currency: priceResult.currency,
            status: priceResult.tier.status,
          }
        : null,
      priceBook: pricingConfig.priceBook
        ? {
            id: pricingConfig.priceBook.id,
            name: pricingConfig.priceBook.name,
            currency: pricingConfig.priceBook.currency,
            interval: pricingConfig.priceBook.interval,
          }
        : null,
      activePriceVersion: pricingConfig.activeVersion
        ? {
            id: pricingConfig.activeVersion.id,
            versionNumber: pricingConfig.activeVersion.versionNumber,
            versionLabel: pricingConfig.activeVersion.versionLabel,
            status: pricingConfig.activeVersion.status,
            effectiveFrom:
              pricingConfig.activeVersion.effectiveFrom?.toISOString() ?? null,
          }
        : null,
      priceTiers: (pricingConfig.activeVersion?.tiers ?? []).map((t) => ({
        id: t.id,
        minVehicles: t.minVehicles,
        maxVehicles: t.maxVehicles,
        unitPriceCents: t.unitPriceCents,
        sortOrder: t.sortOrder,
      })),
      stripePortalPrepared: stripeStatus.portalPrepared,
      stripeConfigured: stripeStatus.configured,
      calculationStatus: priceResult.calculationStatus,
      nextInvoicePreview: {
        subtotalCents: priceResult.subtotalCents,
        taxCents: null as number | null,
        totalCents: priceResult.totalCents,
        currency: priceResult.currency,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        explanation: this.buildPreviewExplanation(
          quantity.billableVehicleCount,
          priceResult,
        ),
      },
      paymentMethod: defaultPm
        ? {
            exists: true,
            type: defaultPm.type,
            brand: defaultPm.brand,
            last4: defaultPm.last4,
            expMonth: defaultPm.expMonth,
            expYear: defaultPm.expYear,
            status: defaultPm.status,
          }
        : { exists: false },
      warnings,
    };
  }

  async getNextInvoicePreview(organizationId: string) {
    const [quantity, discounts, contract] = await Promise.all([
      this.quantityResolver.resolveQuantity(organizationId),
      this.discountResolver.resolveDiscounts(organizationId),
      this.subscriptionResolver.resolveContract(organizationId),
    ]);

    const priceResult = await this.pricingResolver.resolveItemPricing({
      billableQuantity: quantity.billableVehicleCount,
      priceBookId: contract.priceBookId,
      discounts,
    });

    const period = contract.currentPeriod;

    return {
      billableVehicleCount: quantity.billableVehicleCount,
      connectedVehicleCount: quantity.connectedVehicleCount,
      tier: priceResult.tier,
      calculationStatus: priceResult.calculationStatus,
      unitPriceCents: priceResult.unitPriceCents,
      subtotalCents: priceResult.subtotalCents,
      taxCents: null,
      totalCents: priceResult.totalCents,
      currency: priceResult.currency,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      priceNotConfigured:
        priceResult.calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED ||
        priceResult.calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
      explanation: this.buildPreviewExplanation(quantity.billableVehicleCount, priceResult),
    };
  }

  private buildWarnings(
    sub: {
      status: BillingStatus;
      currentPeriodEnd?: Date | null;
      cancelAtPeriodEnd?: boolean;
    } | null,
    calculationStatus: BillingUsageCalculationStatus,
    paymentMethod: { status: BillingPaymentMethodStatus } | null,
  ): string[] {
    const warnings: string[] = [];
    if (!sub) {
      warnings.push('SUBSCRIPTION_MISSING');
    }
    if (!paymentMethod || paymentMethod.status !== BillingPaymentMethodStatus.ACTIVE) {
      warnings.push('PAYMENT_METHOD_MISSING');
    }
    if (calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED) {
      warnings.push('PRICE_NOT_CONFIGURED');
    }
    if (calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION) {
      warnings.push('NO_ACTIVE_PRICE_VERSION');
    }
    if (sub?.status === BillingStatus.PAST_DUE) warnings.push('PAST_DUE');
    if (sub?.cancelAtPeriodEnd) warnings.push('CANCEL_AT_PERIOD_END');
    if (
      sub?.currentPeriodEnd &&
      sub.currentPeriodEnd.getTime() < Date.now()
    ) {
      warnings.push('PERIOD_ENDED');
    }
    if (calculationStatus === BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES) {
      warnings.push('NO_BILLABLE_VEHICLES');
    }
    return warnings;
  }

  private buildPreviewExplanation(
    count: number,
    price: {
      calculationStatus: BillingUsageCalculationStatus;
      unitPriceCents: number | null;
      subtotalCents: number | null;
      currency: string | null;
    },
  ): string {
    if (price.calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION) {
      return 'No active price version configured.';
    }
    if (price.calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED) {
      return 'Price tier exists but unit price is not configured.';
    }
    if (price.calculationStatus === BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES) {
      return 'No billable connected vehicles for this organization.';
    }
    if (price.unitPriceCents != null && price.subtotalCents != null) {
      return `${count} billable connected vehicles × ${(price.unitPriceCents / 100).toFixed(2)} ${price.currency ?? 'EUR'} per vehicle`;
    }
    return 'Unable to calculate preview.';
  }
}
