import { Injectable } from '@nestjs/common';
import { BillingUsageCalculationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingPriceResolutionService } from './billing-price-resolution.service';
import { PricebookService } from './pricebook.service';
import { PricingModel } from './domain/billing-domain.types';
import { applyDiscounts } from './domain/discount-calculator';
import { SubscriptionPricePreview } from './domain/subscription-price-preview.types';
import {
  DiscountResolverService,
  PricingResolverService,
  QuantityResolverService,
  SubscriptionResolverService,
} from './resolvers';

export interface PreviewSubscriptionPriceOptions {
  asOf?: Date;
}

@Injectable()
export class SubscriptionPricePreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quantityResolver: QuantityResolverService,
    private readonly subscriptionResolver: SubscriptionResolverService,
    private readonly pricingResolver: PricingResolverService,
    private readonly discountResolver: DiscountResolverService,
    private readonly pricebook: PricebookService,
    private readonly priceResolution: BillingPriceResolutionService,
  ) {}

  async preview(
    organizationId: string,
    opts: PreviewSubscriptionPriceOptions = {},
  ): Promise<SubscriptionPricePreview> {
    const asOf = opts.asOf ?? new Date();
    const warnings: string[] = [];
    const legacyFallbacks: string[] = [];

    const [quantity, discounts, assignment, contract, orgProducts, org] = await Promise.all([
      this.quantityResolver.resolveQuantity(organizationId),
      this.discountResolver.resolveDiscounts(organizationId, { asOf }),
      this.pricingResolver.resolvePriceAssignment(organizationId, { asOf }),
      this.subscriptionResolver.resolveContract(organizationId, {
        baseItemQuantity: undefined,
      }),
      this.prisma.organizationProduct.findMany({
        where: { organizationId, status: { in: ['ACTIVE', 'TRIAL'] } },
        include: { product: { select: { slug: true, name: true } } },
        take: 1,
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultVatRate: true },
      }),
    ]);

    const activeProduct = orgProducts[0] ?? null;
    const priceBook = assignment.priceBookId
      ? await this.pricebook.getPriceBook(assignment.priceBookId).catch(() => null)
      : null;
    const priceVersion = assignment.priceVersionId
      ? await this.pricebook.getVersionWithTiers(assignment.priceVersionId).catch(() => null)
      : null;

    if (assignment.legacyFallbackUsed) {
      legacyFallbacks.push('BILLING_LEGACY_FALLBACK_USED');
      warnings.push('BILLING_LEGACY_FALLBACK_USED');
    }
    if (assignment.pricingErrorCode) {
      warnings.push(assignment.pricingErrorCode);
    }

    const baseAdjustments = discounts.filter(
      (discount) =>
        discount.applicationPhase === 'UNIT_PRICE' || discount.applicationPhase === 'MINIMUM',
    );
    const unitPriceOverride =
      baseAdjustments.find((discount) => discount.customUnitPriceCents != null)
        ?.customUnitPriceCents ?? null;
    const minimumOverride =
      baseAdjustments.find((discount) => discount.customMonthlyMinimumCents != null)
        ?.customMonthlyMinimumCents ?? null;

    let priceResult: Awaited<ReturnType<BillingPriceResolutionService['calculateVolumePriceForVersion']>> = {
      calculationStatus: BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
      priceBookId: assignment.priceBookId,
      priceVersionId: assignment.priceVersionId,
      currency: priceBook?.currency ?? null,
      pricingModel: PricingModel.VOLUME,
      tier: null,
      tierLines: [],
      unitPriceCents: null,
      subtotalCents: null,
      totalCents: null,
    };

    if (assignment.priceVersionId) {
      priceResult = await this.priceResolution.calculateVolumePriceForVersion(
        assignment.priceVersionId,
        quantity.billableVehicleCount,
        {
          asOf,
          priceBookId: assignment.priceBookId,
          customUnitPriceCents: unitPriceOverride,
          customMonthlyMinimumCents: minimumOverride,
        },
      );
    }

    const currency = priceResult.currency ?? priceBook?.currency ?? 'EUR';
    const baseAmountCents =
      priceResult.subtotalCents != null ? priceResult.subtotalCents : priceResult.totalCents;

    let amountAfterDiscountCents = baseAmountCents;
    let appliedDiscounts: SubscriptionPricePreview['discounts'] = [];
    let skippedDiscounts: SubscriptionPricePreview['skippedDiscounts'] = [];
    let totalDiscountCents = 0;

    if (baseAmountCents != null && baseAmountCents > 0) {
      const discountResult = applyDiscounts({
        baseAmountCents,
        currency,
        discounts,
        asOf,
        subscriptionItemId: assignment.subscriptionItemId,
      });
      amountAfterDiscountCents = discountResult.amountAfterDiscountCents;
      appliedDiscounts = discountResult.appliedDiscounts;
      skippedDiscounts = discountResult.skippedDiscounts;
      totalDiscountCents = discountResult.totalDiscountCents;
      warnings.push(...discountResult.warnings);
      for (const skipped of discountResult.skippedDiscounts) {
        warnings.push(skipped.code);
      }
    }

    const tax = this.resolveTax(amountAfterDiscountCents, org?.defaultVatRate ?? null);
    if (!tax.configured) {
      warnings.push('TAX_NOT_CONFIGURED');
    }

    return {
      organizationId,
      subscriptionId: contract.subscriptionId,
      subscriptionItemId: assignment.subscriptionItemId,
      calculationStatus: priceResult.calculationStatus,
      tariff: {
        priceBookId: priceBook?.id ?? assignment.priceBookId,
        name: priceBook?.name ?? null,
        productKey: priceBook?.productKey ?? null,
        interval: priceBook?.interval ?? null,
      },
      product: {
        slug: activeProduct?.product.slug ?? priceBook?.productKey ?? null,
        name: activeProduct?.product.name ?? priceBook?.name ?? null,
        plan: activeProduct?.plan ?? null,
      },
      priceVersion: {
        id: priceVersion?.id ?? assignment.priceVersionId,
        versionNumber: priceVersion?.versionNumber ?? null,
        versionLabel: priceVersion?.versionLabel ?? null,
        status: priceVersion?.status ?? null,
      },
      pricingModel: priceResult.pricingModel,
      vehicleCount: quantity.billableVehicleCount,
      connectedVehicleCount: quantity.connectedVehicleCount,
      tierBreakdown: priceResult.tierLines,
      tier: priceResult.tier,
      unitPriceCents: priceResult.unitPriceCents,
      baseAmountCents,
      discounts: appliedDiscounts,
      skippedDiscounts,
      amountAfterDiscountCents,
      totalDiscountCents,
      tax,
      currency,
      warnings,
      legacyFallbacks,
      priceResolutionSource: assignment.source,
      pricingErrorCode: assignment.pricingErrorCode,
      legacyFallbackUsed: assignment.legacyFallbackUsed,
      resolvedAt: asOf,
    };
  }

  private resolveTax(
    amountAfterDiscountCents: number | null,
    defaultVatRate: number | null | undefined,
  ): SubscriptionPricePreview['tax'] {
    if (amountAfterDiscountCents == null) {
      return {
        configured: false,
        taxRateBps: null,
        taxBasisCents: null,
        taxCents: null,
        netCents: null,
        grossCents: null,
      };
    }

    if (defaultVatRate == null) {
      return {
        configured: false,
        taxRateBps: null,
        taxBasisCents: amountAfterDiscountCents,
        taxCents: null,
        netCents: amountAfterDiscountCents,
        grossCents: amountAfterDiscountCents,
      };
    }

    const taxRateBps = Math.round(defaultVatRate * 100);
    const taxCents = Math.round((amountAfterDiscountCents * taxRateBps) / 10_000);
    const netCents = amountAfterDiscountCents;
    const grossCents = netCents + taxCents;

    return {
      configured: true,
      taxRateBps,
      taxBasisCents: amountAfterDiscountCents,
      taxCents,
      netCents,
      grossCents,
    };
  }
}
