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
  PricingResolverService,
  QuantityResolverService,
  SubscriptionResolverService,
} from './resolvers';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';

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
    private readonly pricebook: PricebookService,
    private readonly stripePrepared: StripePreparedService,
    private readonly pricePreview: SubscriptionPricePreviewService,
  ) {}

  async getSummary(organizationId: string) {
    const [quantity, defaultPm, orgProducts, pricePreview] = await Promise.all([
      this.quantityResolver.resolveQuantity(organizationId),
      this.prisma.billingPaymentMethod.findFirst({
        where: { organizationId: organizationId, isDefault: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organizationProduct.findMany({
        where: { organizationId },
        include: { product: { select: { slug: true, name: true } } },
      }),
      this.pricePreview.preview(organizationId),
    ]);

    const contract = await this.subscriptionResolver.resolveContract(organizationId, {
      baseItemQuantity: quantity.billableVehicleCount,
    });

    const priceAssignment = await this.pricingResolver.resolvePriceAssignment(organizationId);

    const resolvedPriceBook = priceAssignment.priceBookId
      ? await this.pricebook.getPriceBook(priceAssignment.priceBookId).catch(() => null)
      : null;
    const resolvedPriceVersion = priceAssignment.priceVersionId
      ? await this.pricebook.getVersionWithTiers(priceAssignment.priceVersionId).catch(() => null)
      : null;

    const sub = contract.subscriptionId
      ? await this.prisma.billingSubscription.findUnique({
          where: { id: contract.subscriptionId },
        })
      : null;

    const period = contract.currentPeriod;
    const stripeStatus = this.stripePrepared.getPreparedStatus();
    const warnings = this.buildWarnings(
      sub,
      pricePreview.calculationStatus,
      defaultPm,
      pricePreview.pricingErrorCode,
      pricePreview.legacyFallbackUsed,
    );
    warnings.push(...pricePreview.warnings);

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
      currentTier: pricePreview.tier
        ? {
            id: pricePreview.tier.id,
            minVehicles: pricePreview.tier.minVehicles,
            maxVehicles: pricePreview.tier.maxVehicles,
            unitPriceCents: pricePreview.unitPriceCents,
            currency: pricePreview.currency,
            status: pricePreview.tier.status,
          }
        : null,
      priceBook: resolvedPriceBook
        ? {
            id: resolvedPriceBook.id,
            name: resolvedPriceBook.name,
            currency: resolvedPriceBook.currency,
            interval: resolvedPriceBook.interval,
            productKey: resolvedPriceBook.productKey,
          }
        : null,
      activePriceVersion: resolvedPriceVersion
        ? {
            id: resolvedPriceVersion.id,
            versionNumber: resolvedPriceVersion.versionNumber,
            versionLabel: resolvedPriceVersion.versionLabel,
            status: resolvedPriceVersion.status,
            effectiveFrom:
              resolvedPriceVersion.effectiveFrom?.toISOString() ?? null,
          }
        : null,
      priceTiers: (resolvedPriceVersion?.tiers ?? []).map((t) => ({
        id: t.id,
        minVehicles: t.minVehicles,
        maxVehicles: t.maxVehicles,
        unitPriceCents: t.unitPriceCents,
        sortOrder: t.sortOrder,
      })),
      stripePortalPrepared: stripeStatus.portalPrepared,
      stripeConfigured: stripeStatus.configured,
      calculationStatus: pricePreview.calculationStatus,
      priceResolutionSource: pricePreview.priceResolutionSource ?? null,
      pricingErrorCode: pricePreview.pricingErrorCode ?? null,
      legacyFallbackUsed: pricePreview.legacyFallbackUsed ?? false,
      nextInvoicePreview: {
        subtotalCents: pricePreview.baseAmountCents,
        discountCents: pricePreview.totalDiscountCents,
        amountAfterDiscountCents: pricePreview.amountAfterDiscountCents,
        taxCents: pricePreview.tax.taxCents,
        netCents: pricePreview.tax.netCents,
        grossCents: pricePreview.tax.grossCents,
        totalCents: pricePreview.tax.grossCents,
        currency: pricePreview.currency,
        pricingModel: pricePreview.pricingModel,
        tierBreakdown: pricePreview.tierBreakdown,
        discounts: pricePreview.discounts,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        explanation: this.buildPreviewExplanation(
          quantity.billableVehicleCount,
          pricePreview,
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
    const [quantity, contract, pricePreview] = await Promise.all([
      this.quantityResolver.resolveQuantity(organizationId),
      this.subscriptionResolver.resolveContract(organizationId),
      this.pricePreview.preview(organizationId),
    ]);

    const period = contract.currentPeriod;

    return {
      billableVehicleCount: quantity.billableVehicleCount,
      connectedVehicleCount: quantity.connectedVehicleCount,
      tier: pricePreview.tier,
      calculationStatus: pricePreview.calculationStatus,
      unitPriceCents: pricePreview.unitPriceCents,
      subtotalCents: pricePreview.baseAmountCents,
      discountCents: pricePreview.totalDiscountCents,
      amountAfterDiscountCents: pricePreview.amountAfterDiscountCents,
      taxCents: pricePreview.tax.taxCents,
      netCents: pricePreview.tax.netCents,
      grossCents: pricePreview.tax.grossCents,
      totalCents: pricePreview.tax.grossCents,
      currency: pricePreview.currency,
      pricingModel: pricePreview.pricingModel,
      tierBreakdown: pricePreview.tierBreakdown,
      discounts: pricePreview.discounts,
      warnings: pricePreview.warnings,
      legacyFallbacks: pricePreview.legacyFallbacks,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      priceNotConfigured:
        pricePreview.calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED ||
        pricePreview.calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
      explanation: this.buildPreviewExplanation(quantity.billableVehicleCount, pricePreview),
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
    pricingErrorCode?: string | null,
    legacyFallbackUsed?: boolean,
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
    if (pricingErrorCode === 'BILLING_PRICE_NOT_ASSIGNED') {
      warnings.push('BILLING_PRICE_NOT_ASSIGNED');
    }
    if (pricingErrorCode === 'BILLING_PRICE_VERSION_INVALID') {
      warnings.push('BILLING_PRICE_VERSION_INVALID');
    }
    if (pricingErrorCode === 'BILLING_SUBSCRIPTION_NOT_FOUND') {
      warnings.push('BILLING_SUBSCRIPTION_NOT_FOUND');
    }
    if (legacyFallbackUsed || pricingErrorCode === 'BILLING_LEGACY_FALLBACK_USED') {
      warnings.push('BILLING_LEGACY_FALLBACK_USED');
    }
    return warnings;
  }

  private buildPreviewExplanation(
    count: number,
    price: {
      calculationStatus: BillingUsageCalculationStatus;
      unitPriceCents: number | null;
      baseAmountCents?: number | null;
      subtotalCents?: number | null;
      amountAfterDiscountCents?: number | null;
      totalDiscountCents?: number;
      currency: string | null;
    },
  ): string {
    const subtotal = price.baseAmountCents ?? price.subtotalCents;
    if (price.calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION) {
      return 'No active price version configured.';
    }
    if (price.calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED) {
      return 'Price tier exists but unit price is not configured.';
    }
    if (price.calculationStatus === BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES) {
      return 'No billable connected vehicles for this organization.';
    }
    if (price.unitPriceCents != null && subtotal != null) {
      const discountNote =
        price.totalDiscountCents && price.totalDiscountCents > 0
          ? ` after ${(price.totalDiscountCents / 100).toFixed(2)} ${price.currency ?? 'EUR'} discount`
          : '';
      return `${count} billable connected vehicles × ${(price.unitPriceCents / 100).toFixed(2)} ${price.currency ?? 'EUR'} per vehicle${discountNote}`;
    }
    return 'Unable to calculate preview.';
  }
}
