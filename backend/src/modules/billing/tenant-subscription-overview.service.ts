import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingEntitlementResolver } from './billing-entitlement-resolver.service';
import { StripePreparedService } from './stripe-prepared.service';
import { StripePaymentMethodService } from './stripe-payment-method.service';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';
import {
  QuantityResolverService,
  SubscriptionResolverService,
} from './resolvers';
import { ResolvedOrganizationContract } from './domain/billing-resolver.types';
import { SubscriptionPricePreview } from './domain/subscription-price-preview.types';
import { BillingEntitlementSnapshot } from './domain/billing-entitlements';
import { ResolvedQuantity } from './domain/billing-resolver.types';
import { SubscriptionStatus } from './domain/billing-domain.types';
import { TenantSubscriptionOverviewDto } from './dto/tenant-subscription-overview.dto';
import {
  buildAvailableActions,
  buildOverviewWarnings,
  mapPaymentMethodStatus,
  paymentStatusLabel,
  resolveAddOnDtos,
  resolveContractDto,
  resolveDefaultPaymentMethodDto,
  resolveDiscountDtos,
  resolvePlanDto,
  resolveTierDto,
  toTenantMoney,
} from './tenant-subscription-overview.mapper';

export interface TenantSubscriptionOverviewOptions {
  asOf?: Date;
}

interface SubscriptionDates {
  trialEndsAt: Date | null;
  startedAt: Date | null;
  cancellationScheduledAt: Date | null;
  currentPeriodEnd: Date | null;
}

@Injectable()
export class TenantSubscriptionOverviewService {
  private readonly logger = new Logger(TenantSubscriptionOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionResolver: SubscriptionResolverService,
    private readonly quantityResolver: QuantityResolverService,
    private readonly pricePreview: SubscriptionPricePreviewService,
    private readonly entitlementResolver: BillingEntitlementResolver,
    private readonly paymentMethods: StripePaymentMethodService,
    private readonly stripePrepared: StripePreparedService,
  ) {}

  async getOverview(
    organizationId: string,
    opts: TenantSubscriptionOverviewOptions = {},
  ): Promise<TenantSubscriptionOverviewDto> {
    const asOf = opts.asOf ?? new Date();

    const [
      quantityResult,
      subscriptionDatesResult,
      paymentResult,
      previewResult,
      entitlementsResult,
    ] = await Promise.allSettled([
      this.quantityResolver.resolveQuantity(organizationId),
      this.loadSubscriptionDates(organizationId),
      this.paymentMethods.getDefaultPaymentMethodView(organizationId),
      this.pricePreview.preview(organizationId, { asOf }),
      this.entitlementResolver.resolve(organizationId, { asOf }),
    ]);

    const sectionErrors: TenantSubscriptionOverviewDto['sectionErrors'] = [];
    const quantity = this.unwrapSection(
      quantityResult,
      'pricing',
      'Fahrzeugmenge konnte nicht geladen werden.',
      sectionErrors,
      null,
    );
    const subscriptionDates = this.unwrapSection(
      subscriptionDatesResult,
      'contract',
      'Vertragsdaten konnten nicht geladen werden.',
      sectionErrors,
      {
        trialEndsAt: null,
        startedAt: null,
        cancellationScheduledAt: null,
        currentPeriodEnd: null,
      },
    );
    const paymentView = this.unwrapSection(
      paymentResult,
      'paymentMethod',
      'Zahlungsmethode konnte nicht geladen werden.',
      sectionErrors,
      { exists: false, billingState: 'MISSING' as const, paymentMethod: null },
    );
    const preview = this.unwrapSection(
      previewResult,
      'pricing',
      'Kostenübersicht konnte nicht berechnet werden.',
      sectionErrors,
      null,
    );
    const entitlements = this.unwrapSection(
      entitlementsResult,
      'addOns',
      'Zusatzmodule konnten nicht geladen werden.',
      sectionErrors,
      null,
    );

    let contract: ResolvedOrganizationContract | null = null;
    try {
      contract = await this.subscriptionResolver.resolveContract(organizationId, {
        asOf,
        baseItemQuantity: quantity?.billableVehicleCount ?? 0,
      });
    } catch (error) {
      this.logger.warn(
        `Contract resolution failed for organization ${organizationId}: ${String(error)}`,
      );
      sectionErrors.push({
        section: 'contract',
        message: 'Vertragsstatus konnte nicht geladen werden.',
      });
    }

    const paymentStatus = mapPaymentMethodStatus(paymentView.billingState);
    const portalAvailable = this.stripePrepared.isStripeConfigured();
    const plan = this.resolvePlan(contract, preview, entitlements);
    const contractDto =
      contract != null
        ? resolveContractDto({
            contract,
            trialEndsAt: subscriptionDates.trialEndsAt,
            startedAt: subscriptionDates.startedAt,
            cancellationScheduledAt: subscriptionDates.cancellationScheduledAt,
            billingInterval: preview?.tariff.interval ?? 'MONTH',
          })
        : null;

    const pricingDto =
      preview != null
        ? {
            asOf: preview.resolvedAt.toISOString(),
            billableVehicleCount: quantity?.billableVehicleCount ?? preview.vehicleCount,
            connectedVehicleCount:
              quantity?.connectedVehicleCount ?? preview.connectedVehicleCount,
            appliedTier: resolveTierDto(preview),
            baseAmount: toTenantMoney(preview.baseAmountCents, preview.currency),
            discounts: resolveDiscountDtos(preview.discounts, preview.currency),
            netAmount: toTenantMoney(preview.tax.netCents, preview.currency),
            taxAmount: toTenantMoney(preview.tax.taxCents, preview.currency),
            grossAmount: toTenantMoney(preview.tax.grossCents, preview.currency),
            taxConfigured: preview.tax.configured,
            pricingModel:
              preview.pricingModel === 'GRADUATED'
                ? ('GRADUATED' as const)
                : preview.pricingModel === 'VOLUME'
                  ? ('VOLUME' as const)
                  : null,
          }
        : null;

    const billingDto = this.buildBillingDto(contract, preview, subscriptionDates);
    const paymentMethodDto = {
      status: paymentStatus,
      statusLabel: paymentStatusLabel(paymentStatus),
      defaultMethod: resolveDefaultPaymentMethodDto(paymentView.paymentMethod),
      asOf: asOf.toISOString(),
    };
    const addOns = entitlements ? resolveAddOnDtos(entitlements) : [];

    const warnings = buildOverviewWarnings({
      contract,
      preview,
      paymentStatus,
      trialEndsAt: subscriptionDates.trialEndsAt,
      cancellationScheduledAt: subscriptionDates.cancellationScheduledAt,
    });

    const availableActions = buildAvailableActions({
      contract,
      paymentStatus,
      portalAvailable,
    });

    return {
      asOf: asOf.toISOString(),
      plan,
      contract: contractDto,
      pricing: pricingDto,
      billing: billingDto,
      paymentMethod: paymentMethodDto,
      addOns,
      warnings,
      availableActions,
      sectionErrors,
    };
  }

  private resolvePlan(
    contract: ResolvedOrganizationContract | null,
    preview: SubscriptionPricePreview | null,
    entitlements: BillingEntitlementSnapshot | null,
  ) {
    const productKey =
      preview?.tariff.productKey ??
      (entitlements?.baseProduct ? entitlements.baseProduct : null);
    const productName =
      preview?.product.name ??
      preview?.tariff.name ??
      (productKey ? null : null);

    if (productKey) {
      return resolvePlanDto({
        productKey,
        productName: productName ?? null,
      });
    }

    const baseItem = contract?.items.find((item) => item.addonKey == null);
    if (baseItem?.productKind) {
      return resolvePlanDto({
        productKey: baseItem.productKind,
        productName: productName,
      });
    }

    return null;
  }

  private buildBillingDto(
    contract: ResolvedOrganizationContract | null,
    preview: SubscriptionPricePreview | null,
    subscriptionDates: SubscriptionDates,
  ): TenantSubscriptionOverviewDto['billing'] {
    if (!contract) return null;

    const periodStart = contract.currentPeriod.start;
    const periodEnd = contract.currentPeriod.end;
    const grossAmount = preview
      ? toTenantMoney(preview.tax.grossCents, preview.currency)
      : null;

    const nextExpectedInvoice =
      contract.subscriptionId != null
        ? {
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            grossAmount,
            dueAt: periodEnd.toISOString(),
          }
        : null;

    const nextChargeAt = this.resolveNextChargeAt(contract, subscriptionDates);

    return {
      nextExpectedInvoice,
      nextChargeAt: nextChargeAt?.toISOString() ?? null,
    };
  }

  private resolveNextChargeAt(
    contract: ResolvedOrganizationContract,
    subscriptionDates: SubscriptionDates,
  ): Date | null {
    if (contract.status === SubscriptionStatus.TRIALING && subscriptionDates.trialEndsAt) {
      return subscriptionDates.trialEndsAt;
    }
    if (contract.status === SubscriptionStatus.CANCELLED) {
      return null;
    }
    return subscriptionDates.currentPeriodEnd ?? contract.currentPeriod.end;
  }

  private async loadSubscriptionDates(organizationId: string): Promise<SubscriptionDates> {
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        trialEndAt: true,
        startedAt: true,
        cancelAt: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
      },
    });

    if (!subscription) {
      return {
        trialEndsAt: null,
        startedAt: null,
        cancellationScheduledAt: null,
        currentPeriodEnd: null,
      };
    }

    const cancellationScheduledAt =
      subscription.cancelAtPeriodEnd
        ? subscription.cancelAt ?? subscription.currentPeriodEnd
        : subscription.cancelAt;

    return {
      trialEndsAt: subscription.trialEndAt,
      startedAt: subscription.startedAt,
      cancellationScheduledAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  }

  private unwrapSection<T>(
    result: PromiseSettledResult<T>,
    section: TenantSubscriptionOverviewDto['sectionErrors'][number]['section'],
    message: string,
    sectionErrors: TenantSubscriptionOverviewDto['sectionErrors'],
    fallback: T,
  ): T {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    this.logger.warn(`Overview section ${section} failed: ${String(result.reason)}`);
    if (!sectionErrors.some((entry) => entry.section === section)) {
      sectionErrors.push({ section, message });
    }
    return fallback;
  }
}
