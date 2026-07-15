import { Injectable } from '@nestjs/common';
import { BillingUsageCalculationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillableVehiclesService } from './billable-vehicles.service';
import { AppliedDiscountLine } from './domain/discount-calculator';
import { TierPricingLine } from './domain/tier-pricing-calculator';
import {
  DiscountResolverService,
  QuantityResolverService,
} from './resolvers';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';
import { UsageSnapshotService } from './usage-snapshot.service';

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
  discountCents: number;
  amountAfterDiscountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  currency: string | null;
  priceBookId: string | null;
  priceVersionId: string | null;
  priceTierId: string | null;
  pricingModel: string | null;
  tierBreakdown: TierPricingLine[];
  discounts: AppliedDiscountLine[];
  warnings: string[];
  legacyFallbacks: string[];
}

@Injectable()
export class BillingUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billableVehicles: BillableVehiclesService,
    private readonly quantityResolver: QuantityResolverService,
    private readonly discountResolver: DiscountResolverService,
    private readonly pricePreview: SubscriptionPricePreviewService,
    private readonly usageSnapshots: UsageSnapshotService,
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
    const [vehicleData, preview] = await Promise.all([
      this.resolveBillableVehicles(organizationId),
      this.pricePreview.preview(organizationId),
    ]);

    return {
      configured: preview.priceVersion.id != null,
      calculationStatus: preview.calculationStatus,
      connectedVehicleCount: vehicleData.connectedVehicleCount,
      billableVehicleCount: vehicleData.billableVehicleCount,
      billableVehicleIds: vehicleData.billableVehicleIds,
      excludedVehicleIds: vehicleData.excludedVehicleIds,
      unitPriceCents: preview.unitPriceCents,
      subtotalCents: preview.baseAmountCents,
      discountCents: preview.totalDiscountCents,
      amountAfterDiscountCents: preview.amountAfterDiscountCents,
      taxCents: preview.tax.taxCents,
      totalCents: preview.tax.grossCents,
      currency: preview.currency,
      priceBookId: preview.tariff.priceBookId,
      priceVersionId: preview.priceVersion.id,
      priceTierId: preview.tier?.id ?? null,
      pricingModel: preview.pricingModel,
      tierBreakdown: preview.tierBreakdown,
      discounts: preview.discounts,
      warnings: preview.warnings,
      legacyFallbacks: preview.legacyFallbacks,
    };
  }

  async createUsageSnapshot(
    organizationId: string,
    period: UsagePeriod,
    opts?: { idempotencyKey?: string; createdByUserId?: string | null; lock?: boolean },
  ) {
    const idempotencyKey =
      opts?.idempotencyKey ??
      `usage:${organizationId}:${period.periodStart.toISOString()}:${period.periodEnd.toISOString()}`;

    const result = await this.usageSnapshots.createSnapshot({
      organizationId,
      idempotencyKey,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      createdByUserId: opts?.createdByUserId,
      lock: opts?.lock,
    });

    return result.snapshot;
  }

  async listUsageSnapshots(organizationId: string, limit = 12) {
    return this.prisma.billingUsageSnapshot.findMany({
      where: { organizationId },
      orderBy: { periodStart: 'desc' },
      take: limit,
    });
  }
}
