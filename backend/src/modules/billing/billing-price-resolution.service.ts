import { Injectable } from '@nestjs/common';
import { BillingUsageCalculationStatus } from '@prisma/client';
import { PricebookService } from './pricebook.service';
import {
  calculateVolumePricing,
  PriceTierInput,
  resolveTierForVehicleCount,
} from './billing-calculation.util';

export interface ResolvedTier {
  id: string | null;
  minVehicles: number;
  maxVehicles: number | null;
  unitPriceCents: number | null;
  sortOrder: number;
  status: 'CONFIGURED' | 'UNPRICED';
}

export interface PriceResolutionResult {
  calculationStatus: BillingUsageCalculationStatus;
  priceBookId: string | null;
  priceVersionId: string | null;
  currency: string | null;
  tier: ResolvedTier | null;
  unitPriceCents: number | null;
  subtotalCents: number | null;
  totalCents: number | null;
}

@Injectable()
export class BillingPriceResolutionService {
  constructor(private readonly pricebook: PricebookService) {}

  getActivePriceVersion(priceBookId: string, date: Date = new Date()) {
    return this.pricebook.findActiveVersion(priceBookId, date);
  }

  async resolveTierForVehicleCountFromVersion(
    priceVersionId: string,
    billableVehicleCount: number,
  ): Promise<ResolvedTier | null> {
    const version = await this.pricebook.getVersionWithTiers(priceVersionId);
    if (!version) return null;

    const tiers: PriceTierInput[] = version.tiers.map((t) => ({
      id: t.id,
      minVehicles: t.minVehicles,
      maxVehicles: t.maxVehicles,
      unitPriceCents: t.unitPriceCents,
      sortOrder: t.sortOrder,
    }));

    const tier = resolveTierForVehicleCount(billableVehicleCount, tiers);
    if (!tier) return null;

    return {
      id: tier.id ?? null,
      minVehicles: tier.minVehicles,
      maxVehicles: tier.maxVehicles,
      unitPriceCents: tier.unitPriceCents,
      sortOrder: tier.sortOrder ?? 0,
      status: tier.unitPriceCents != null ? 'CONFIGURED' : 'UNPRICED',
    };
  }

  async calculateVolumePrice(
    billableVehicleCount: number,
    opts?: {
      priceBookId?: string;
      priceVersionId?: string;
      asOf?: Date;
      customUnitPriceCents?: number | null;
      customMonthlyMinimumCents?: number | null;
    },
  ): Promise<PriceResolutionResult> {
    const asOf = opts?.asOf ?? new Date();

    if (opts?.priceVersionId) {
      return this.calculateVolumePriceForVersion(
        opts.priceVersionId,
        billableVehicleCount,
        {
          asOf,
          customUnitPriceCents: opts.customUnitPriceCents,
          customMonthlyMinimumCents: opts.customMonthlyMinimumCents,
          priceBookId: opts.priceBookId,
        },
      );
    }

    if (!opts?.priceBookId) {
      return {
        calculationStatus: BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
        priceBookId: null,
        priceVersionId: null,
        currency: null,
        tier: null,
        unitPriceCents: null,
        subtotalCents: null,
        totalCents: null,
      };
    }

    const config = await this.resolvePriceBookConfig(opts.priceBookId, asOf);
    return this.calculateFromBookAndVersion(
      billableVehicleCount,
      config.priceBook,
      config.activeVersion,
      asOf,
      opts,
    );
  }

  async calculateVolumePriceForVersion(
    priceVersionId: string,
    billableVehicleCount: number,
    opts?: {
      asOf?: Date;
      priceBookId?: string | null;
      customUnitPriceCents?: number | null;
      customMonthlyMinimumCents?: number | null;
    },
  ): Promise<PriceResolutionResult> {
    const asOf = opts?.asOf ?? new Date();
    const version = await this.pricebook.getVersionWithTiers(priceVersionId);
    if (!version) {
      return {
        calculationStatus: BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
        priceBookId: opts?.priceBookId ?? null,
        priceVersionId: null,
        currency: null,
        tier: null,
        unitPriceCents: null,
        subtotalCents: null,
        totalCents: null,
      };
    }

    const priceBook =
      opts?.priceBookId != null
        ? await this.pricebook.getPriceBook(opts.priceBookId)
        : await this.pricebook.getPriceBook(version.priceBookId);

    return this.calculateFromBookAndVersion(
      billableVehicleCount,
      priceBook,
      version,
      asOf,
      opts,
    );
  }

  private async calculateFromBookAndVersion(
    billableVehicleCount: number,
    priceBook: { id: string; currency: string } | null,
    activeVersion: {
      id: string;
      tiers: Array<{
        id: string;
        minVehicles: number;
        maxVehicles: number | null;
        unitPriceCents: number | null;
        sortOrder: number;
      }>;
    } | null,
    asOf: Date,
    opts?: {
      customUnitPriceCents?: number | null;
      customMonthlyMinimumCents?: number | null;
    },
  ): Promise<PriceResolutionResult> {
    const empty: PriceResolutionResult = {
      calculationStatus: BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
      priceBookId: priceBook?.id ?? null,
      priceVersionId: null,
      currency: priceBook?.currency ?? null,
      tier: null,
      unitPriceCents: null,
      subtotalCents: null,
      totalCents: null,
    };

    if (!priceBook || !activeVersion) {
      return empty;
    }

    if (billableVehicleCount <= 0) {
      return {
        ...empty,
        priceVersionId: activeVersion.id,
        calculationStatus: BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES,
      };
    }

    const tiers: PriceTierInput[] = activeVersion.tiers.map((t) => ({
      id: t.id,
      minVehicles: t.minVehicles,
      maxVehicles: t.maxVehicles,
      unitPriceCents: t.unitPriceCents,
      sortOrder: t.sortOrder,
    }));

    const result = calculateVolumePricing({
      vehicleCount: billableVehicleCount,
      tiers,
      customUnitPriceCents: opts?.customUnitPriceCents ?? null,
      customMonthlyMinimumCents: opts?.customMonthlyMinimumCents ?? null,
      currency: priceBook.currency,
    });

    const resolvedTier = result.tier
      ? {
          id: result.tier.id ?? null,
          minVehicles: result.tier.minVehicles,
          maxVehicles: result.tier.maxVehicles,
          unitPriceCents: result.tier.unitPriceCents,
          sortOrder: result.tier.sortOrder ?? 0,
          status: (result.tier.unitPriceCents != null ? 'CONFIGURED' : 'UNPRICED') as
            | 'CONFIGURED'
            | 'UNPRICED',
        }
      : null;

    return {
      calculationStatus: result.calculationStatus,
      priceBookId: priceBook.id,
      priceVersionId: activeVersion.id,
      currency: priceBook.currency,
      tier: resolvedTier,
      unitPriceCents: result.unitPriceCents,
      subtotalCents: result.subtotalCents,
      totalCents: result.totalCents,
    };
  }

  private async resolvePriceBookConfig(priceBookId: string, asOf: Date) {
    const priceBook = await this.pricebook.getPriceBook(priceBookId);
    const activeVersion = await this.pricebook.findActiveVersion(priceBookId, asOf);
    return {
      configured: !!activeVersion,
      priceBook,
      activeVersion,
    };
  }
}
