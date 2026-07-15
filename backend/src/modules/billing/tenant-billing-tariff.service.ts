import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionStatus } from './domain/billing-domain.types';
import { SubscriptionPricePreview } from './domain/subscription-price-preview.types';
import { TierPricingLine } from './domain/tier-pricing-calculator';
import {
  TenantPriceTierScheduleDto,
  TenantSubscriptionTariffDetailsDto,
  TenantSubscriptionTariffDto,
  TenantSubscriptionTariffPricingDto,
  TenantTierBreakdownLineDto,
} from './dto/tenant-billing-tariff.dto';
import { PricebookService } from './pricebook.service';
import { PricingResolverService } from './resolvers';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';
import { TenantSubscriptionOverviewService } from './tenant-subscription-overview.service';
import {
  toTenantMoney,
} from './tenant-subscription-overview.mapper';

@Injectable()
export class TenantBillingTariffService {
  private readonly logger = new Logger(TenantBillingTariffService.name);

  constructor(
    private readonly overviewService: TenantSubscriptionOverviewService,
    private readonly pricePreview: SubscriptionPricePreviewService,
    private readonly pricingResolver: PricingResolverService,
    private readonly pricebook: PricebookService,
  ) {}

  async getTariff(
    organizationId: string,
    opts: { asOf?: Date } = {},
  ): Promise<TenantSubscriptionTariffDto> {
    const asOf = opts.asOf ?? new Date();
    const sectionErrors: TenantSubscriptionTariffDto['sectionErrors'] = [];

    const [overviewResult, previewResult, priceAssignmentResult] = await Promise.allSettled([
      this.overviewService.getOverview(organizationId, { asOf }),
      this.pricePreview.preview(organizationId, { asOf }),
      this.pricingResolver.resolvePriceAssignment(organizationId),
    ]);

    const overview =
      overviewResult.status === 'fulfilled'
        ? overviewResult.value
        : (() => {
            sectionErrors.push({
              section: 'tariff',
              message: 'Tarifdaten konnten nicht geladen werden.',
            });
            return null;
          })();

    const preview =
      previewResult.status === 'fulfilled'
        ? previewResult.value
        : (() => {
            sectionErrors.push({
              section: 'pricing',
              message: 'Preisberechnung konnte nicht geladen werden.',
            });
            return null;
          })();

    if (overviewResult.status === 'rejected') {
      this.logger.warn(
        `Tariff overview failed for ${organizationId}: ${String(overviewResult.reason)}`,
      );
    }
    if (previewResult.status === 'rejected') {
      this.logger.warn(
        `Tariff preview failed for ${organizationId}: ${String(previewResult.reason)}`,
      );
    }

    let priceTiers: TenantPriceTierScheduleDto[] = [];
    if (priceAssignmentResult.status === 'fulfilled' && priceAssignmentResult.value.priceVersionId) {
      try {
        const version = await this.pricebook.getVersionWithTiers(
          priceAssignmentResult.value.priceVersionId,
        );
        if (version) {
          const currentTierId = preview?.tier?.id ?? null;
          const currency = preview?.currency ?? 'EUR';
          priceTiers = (version.tiers ?? []).map((tier) => ({
            label: formatTierLabel(tier.minVehicles, tier.maxVehicles),
            minVehicles: tier.minVehicles,
            maxVehicles: tier.maxVehicles,
            unitPrice: toTenantMoney(tier.unitPriceCents, currency),
            isCurrent: tier.id === currentTierId,
          }));
        }
      } catch (error) {
        this.logger.warn(`Price tiers failed for ${organizationId}: ${String(error)}`);
      }
    }

    const tariff = overview ? this.buildTariffDetails(overview, preview) : null;
    const pricing =
      preview && overview?.pricing
        ? this.buildPricingDetails(preview, overview.pricing, priceTiers)
        : null;

    if (overview?.sectionErrors?.length) {
      for (const error of overview.sectionErrors) {
        if (!sectionErrors.some((entry) => entry.section === error.section)) {
          sectionErrors.push(error);
        }
      }
    }

    return {
      asOf: asOf.toISOString(),
      tariff,
      pricing,
      sectionErrors,
    };
  }

  private buildTariffDetails(
    overview: Awaited<ReturnType<TenantSubscriptionOverviewService['getOverview']>>,
    preview: SubscriptionPricePreview | null,
  ): TenantSubscriptionTariffDetailsDto | null {
    if (!overview.contract) return null;

    const planKind =
      overview.plan?.kind === 'RENTAL' || overview.plan?.kind === 'FLEET'
        ? overview.plan.kind
        : null;

    const cancellationStatusLabel = resolveCancellationStatusLabel(
      overview.contract.status,
      overview.contract.cancellationScheduledAt,
    );

    const priceVersionLabel = buildPriceVersionLabel(preview);

    return {
      planKind,
      planName: overview.plan?.name ?? null,
      billingIntervalLabel: overview.contract.billingIntervalLabel,
      priceVersionLabel,
      contractStartedAt: overview.contract.startedAt,
      nextPeriodStart: overview.contract.nextPeriodStart,
      nextPeriodEnd: overview.contract.nextPeriodEnd,
      cancellationStatusLabel,
      appliedTierLabel: overview.pricing?.appliedTier?.label ?? null,
    };
  }

  private buildPricingDetails(
    preview: SubscriptionPricePreview,
    pricing: NonNullable<
      Awaited<ReturnType<TenantSubscriptionOverviewService['getOverview']>>['pricing']
    >,
    priceTiers: TenantPriceTierScheduleDto[],
  ): TenantSubscriptionTariffPricingDto {
    return {
      calculatedAt: preview.resolvedAt.toISOString(),
      billableVehicleCount: pricing.billableVehicleCount,
      connectedVehicleCount: pricing.connectedVehicleCount,
      pricingModel: pricing.pricingModel,
      appliedTier: pricing.appliedTier,
      priceTiers,
      tierBreakdown: mapTierBreakdown(preview.tierBreakdown, preview.currency),
      baseAmount: pricing.baseAmount,
      discounts: pricing.discounts,
      netAmount: pricing.netAmount,
      taxAmount: pricing.taxAmount,
      grossAmount: pricing.grossAmount,
      currency: preview.currency,
      taxConfigured: pricing.taxConfigured,
    };
  }
}

function buildPriceVersionLabel(preview: SubscriptionPricePreview | null): string | null {
  if (!preview?.priceVersion.versionNumber) return null;
  const label = preview.priceVersion.versionLabel?.trim();
  if (label) return label;
  return `Version ${preview.priceVersion.versionNumber}`;
}

function resolveCancellationStatusLabel(
  status: string,
  cancellationScheduledAt: string | null,
): string | null {
  if (status === SubscriptionStatus.CANCELLED) {
    return 'Gekündigt';
  }
  if (status === SubscriptionStatus.CANCEL_SCHEDULED || cancellationScheduledAt) {
    return 'Kündigung geplant';
  }
  return 'Aktiv';
}

function formatTierLabel(minVehicles: number, maxVehicles: number | null): string {
  if (maxVehicles == null) return `${minVehicles}+ Fahrzeuge`;
  if (minVehicles === maxVehicles) {
    return `${minVehicles} Fahrzeug${minVehicles === 1 ? '' : 'e'}`;
  }
  return `${minVehicles}–${maxVehicles} Fahrzeuge`;
}

function mapTierBreakdown(
  lines: TierPricingLine[],
  currency: string | null,
): TenantTierBreakdownLineDto[] {
  if (!currency) return [];
  return lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      tierLabel: formatTierLabel(line.minVehicles, line.maxVehicles),
      quantity: line.quantity,
      unitPrice: toTenantMoney(line.unitPriceCents, currency)!,
      subtotal: toTenantMoney(line.subtotalCents, currency)!,
    }));
}

export const tenantBillingTariffInternals = {
  formatTierLabel,
  mapTierBreakdown,
  buildPriceVersionLabel,
};
