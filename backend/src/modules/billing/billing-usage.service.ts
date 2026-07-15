import { Injectable } from '@nestjs/common';
import { BillingUsageCalculationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PricebookService } from './pricebook.service';
import { BillableVehiclesService } from './billable-vehicles.service';
import { BillingPriceResolutionService } from './billing-price-resolution.service';
import {
  DiscountResolverService,
  PricingResolverService,
  QuantityResolverService,
} from './resolvers';

export interface UsagePeriod {
  periodStart: Date;
  periodEnd: Date;
}

export interface UsageCalculationPreview {
  configured: boolean;
  calculationStatus: BillingUsageCalculationStatus;
  connectedVehicleCount: number;
  billableVehicleCount: number;
  billableVehicleIds: string[];
  excludedVehicleIds: string[];
  unitPriceCents: number | null;
  subtotalCents: number | null;
  totalCents: number | null;
  currency: string | null;
  priceBookId: string | null;
  priceVersionId: string | null;
  priceTierId: string | null;
}

@Injectable()
export class BillingUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricebook: PricebookService,
    private readonly billableVehicles: BillableVehiclesService,
    private readonly priceResolution: BillingPriceResolutionService,
    private readonly quantityResolver: QuantityResolverService,
    private readonly discountResolver: DiscountResolverService,
    private readonly pricingResolver: PricingResolverService,
  ) {}

  async resolveBillableVehicles(organizationId: string) {
    const result =
      await this.billableVehicles.getBillableConnectedVehiclesForOrganization(organizationId);
    return {
      connectedVehicleCount: result.connectedVehicleCount,
      billableVehicleCount: result.billableVehicleCount,
      billableVehicleIds: result.billableVehicles.map((v) => v.id),
      excludedVehicleIds: result.excludedVehicles.map((v) => v.id),
      excludedReasonSummary:
        result.excludedVehicles.length > 0
          ? {
              byReason: result.excludedVehicles.reduce(
                (acc, v) => {
                  acc[v.reason] = (acc[v.reason] ?? 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              ),
            }
          : null,
      billableVehicles: result.billableVehicles,
      excludedVehicles: result.excludedVehicles,
    };
  }

  async resolveOrgPriceOverride(organizationId: string, asOf: Date = new Date()) {
    const discount = await this.discountResolver.resolvePrimaryDiscount(organizationId, { asOf });
    if (!discount) return null;
    return {
      id: discount.id,
      customUnitPriceCents: discount.customUnitPriceCents,
      customMonthlyMinimumCents: discount.customMonthlyMinimumCents,
      priceBookId: discount.priceBookId,
      priceVersionId: discount.priceVersionId,
      reason: discount.reason,
      validFrom: discount.validFrom,
      validTo: discount.validTo,
    };
  }

  async previewUsage(organizationId: string): Promise<UsageCalculationPreview> {
    const [vehicleData, discounts] = await Promise.all([
      this.resolveBillableVehicles(organizationId),
      this.discountResolver.resolveDiscounts(organizationId),
    ]);

    const priceResult = await this.pricingResolver.resolveItemPricingForOrganization({
      organizationId,
      billableQuantity: vehicleData.billableVehicleCount,
      discounts,
    });

    return {
      configured: priceResult.priceVersionId != null,
      calculationStatus: priceResult.calculationStatus as BillingUsageCalculationStatus,
      connectedVehicleCount: vehicleData.connectedVehicleCount,
      billableVehicleCount: vehicleData.billableVehicleCount,
      billableVehicleIds: vehicleData.billableVehicleIds,
      excludedVehicleIds: vehicleData.excludedVehicleIds,
      unitPriceCents: priceResult.unitPriceCents,
      subtotalCents: priceResult.subtotalCents,
      totalCents: priceResult.totalCents,
      currency: priceResult.currency,
      priceBookId: priceResult.priceBookId,
      priceVersionId: priceResult.priceVersionId,
      priceTierId: priceResult.tier?.id ?? null,
    };
  }

  async createUsageSnapshot(organizationId: string, period: UsagePeriod) {
    const preview = await this.previewUsage(organizationId);

    return this.prisma.billingUsageSnapshot.create({
      data: {
        organizationId,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        connectedVehicleCount: preview.connectedVehicleCount,
        billableVehicleCount: preview.billableVehicleCount,
        billableVehicleIds: preview.billableVehicleIds,
        excludedVehicleIds: preview.excludedVehicleIds,
        excludedReasonSummary:
          preview.excludedVehicleIds.length > 0
            ? { reason: 'EXCLUDED_VEHICLES', count: preview.excludedVehicleIds.length }
            : undefined,
        priceBookId: preview.priceBookId,
        priceVersionId: preview.priceVersionId,
        priceTierId: preview.priceTierId,
        unitPriceCents: preview.unitPriceCents,
        subtotalCents: preview.subtotalCents,
        taxCents: null,
        totalCents: preview.totalCents,
        currency: preview.currency ?? 'EUR',
        calculationStatus: preview.calculationStatus,
      },
    });
  }

  async listUsageSnapshots(organizationId: string, limit = 12) {
    return this.prisma.billingUsageSnapshot.findMany({
      where: { organizationId },
      orderBy: { periodStart: 'desc' },
      take: limit,
    });
  }
}
