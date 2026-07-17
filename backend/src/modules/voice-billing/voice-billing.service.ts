import { Injectable, NotFoundException } from '@nestjs/common';
import {
  VoiceBillingPeriodRepository,
  VoiceUsageEventRepository,
} from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceSubscriptionService } from './voice-subscription.service';
import { VoiceUsageLedgerService } from './voice-usage-ledger.service';
import { currentBillingPeriodBounds } from './voice-billing-period.util';
import {
  computePeriodRevenueForecast,
  type VoicePeriodRevenueForecast,
} from './voice-billing-pricing.util';
import { centsToEuros, marginPercent } from './voice-billing-rounding.util';
import { listVoicePlans } from './voice-plan-catalog';

export type OrgVoiceUsageSummary = {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  planCode: string | null;
  planCatalogVersion: string | null;
  includedMinutes: number;
  consumedMinutes: number;
  inboundMinutes: number;
  outboundMinutes: number;
  remainingIncludedMinutes: number;
  overageMinutes: number;
  currency: string;
  estimatedUsageRevenueCents: number;
  monthlyBaseFeeCents: number;
};

export type OrgVoiceForecast = VoicePeriodRevenueForecast & {
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
};

export type MasterAdminVoiceOrgBilling = OrgVoiceUsageSummary & {
  providerCostCents: number;
  revenueCents: number;
  marginCents: number;
  marginPercent: number | null;
  setupFeeOutstandingCents: number;
  estimatedCostCents: number;
  finalCostCents: number;
};

@Injectable()
export class VoiceBillingService {
  constructor(
    private readonly subscriptions: VoiceSubscriptionService,
    private readonly usageEvents: VoiceUsageEventRepository,
    private readonly billingPeriods: VoiceBillingPeriodRepository,
    private readonly ledger: VoiceUsageLedgerService,
  ) {}

  listPlans() {
    return listVoicePlans().map((plan) => ({
      code: plan.code,
      catalogVersion: plan.catalogVersion,
      currency: plan.currency,
      monthlyFeeCents: plan.monthlyFeeCents,
      monthlyFeeEuros: centsToEuros(plan.monthlyFeeCents),
      setupFeeCents: plan.setupFeeCents,
      setupFeeEuros: centsToEuros(plan.setupFeeCents),
      entitlements: plan.entitlements,
    }));
  }

  async getOrganizationUsage(organizationId: string): Promise<OrgVoiceUsageSummary> {
    await this.subscriptions.applyPendingPlanChanges(organizationId);
    const subscription = await this.subscriptions.getActiveSubscription(organizationId);
    const { periodStart, periodEnd } = currentBillingPeriodBounds();

    if (subscription) {
      await this.ledger.refreshOpenBillingPeriod(organizationId, periodStart, periodEnd);
    }

    const period = subscription
      ? await this.billingPeriods.findOpenForOrganization(organizationId, periodStart, periodEnd)
      : null;

    const plan = subscription
      ? this.subscriptions.resolvePlanForSubscription(subscription)
      : null;

    const consumedMinutes = period?.consumedMinutes ?? 0;
    const includedMinutes = plan?.entitlements.includedMinutesPerMonth ?? 0;

    return {
      organizationId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      planCode: subscription?.planCode ?? null,
      planCatalogVersion: subscription?.planCatalogVersion ?? null,
      includedMinutes,
      consumedMinutes,
      inboundMinutes: period?.inboundMinutes ?? 0,
      outboundMinutes: period?.outboundMinutes ?? 0,
      remainingIncludedMinutes: Math.max(0, includedMinutes - consumedMinutes),
      overageMinutes: period?.overageMinutes ?? Math.max(0, consumedMinutes - includedMinutes),
      currency: plan?.currency ?? 'EUR',
      estimatedUsageRevenueCents: period?.revenueCents
        ? period.revenueCents - (plan?.monthlyFeeCents ?? 0) - (period.setupFeeCents ?? 0)
        : 0,
      monthlyBaseFeeCents: plan?.monthlyFeeCents ?? 0,
    };
  }

  async getRemainingMinutes(organizationId: string) {
    const usage = await this.getOrganizationUsage(organizationId);
    return {
      organizationId,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
      includedMinutes: usage.includedMinutes,
      consumedMinutes: usage.consumedMinutes,
      remainingIncludedMinutes: usage.remainingIncludedMinutes,
      overageMinutes: usage.overageMinutes,
    };
  }

  async getForecast(organizationId: string): Promise<OrgVoiceForecast> {
    const subscription = await this.subscriptions.getActiveSubscription(organizationId);
    if (!subscription) {
      throw new NotFoundException('No active voice subscription for organization');
    }

    const plan = this.subscriptions.resolvePlanForSubscription(subscription);
    const { periodStart, periodEnd } = currentBillingPeriodBounds();
    await this.ledger.refreshOpenBillingPeriod(organizationId, periodStart, periodEnd);
    const period = await this.billingPeriods.findOpenForOrganization(
      organizationId,
      periodStart,
      periodEnd,
    );

    const setupOutstanding = subscription.setupFeePaidAt ? 0 : subscription.setupFeeCents;
    const forecast = computePeriodRevenueForecast({
      plan,
      consumedMinutes: period?.consumedMinutes ?? 0,
      setupFeeOutstandingCents: setupOutstanding,
    });

    return {
      organizationId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      currency: plan.currency,
      ...forecast,
    };
  }

  async getMasterAdminOrgBilling(organizationId: string): Promise<MasterAdminVoiceOrgBilling> {
    const usage = await this.getOrganizationUsage(organizationId);
    const subscription = await this.subscriptions.getActiveSubscription(organizationId);
    const { periodStart, periodEnd } = currentBillingPeriodBounds();
    const period = await this.billingPeriods.findOpenForOrganization(
      organizationId,
      periodStart,
      periodEnd,
    );

    const costAggregate = await this.usageEvents.sumCustomerPriceInPeriod(
      organizationId,
      periodStart,
      periodEnd,
    );

    const setupOutstanding = subscription?.setupFeePaidAt ? 0 : subscription?.setupFeeCents ?? 0;
    const providerCostCents = period?.providerCostCents ?? costAggregate._sum.internalCostCents ?? 0;
    const revenueCents =
      period?.revenueCents ??
      usage.monthlyBaseFeeCents + usage.estimatedUsageRevenueCents + setupOutstanding;
    const marginCentsValue = period?.marginCents ?? revenueCents - providerCostCents;

    return {
      ...usage,
      providerCostCents,
      revenueCents,
      marginCents: marginCentsValue,
      marginPercent: marginPercent(revenueCents, providerCostCents),
      setupFeeOutstandingCents: setupOutstanding,
      estimatedCostCents: providerCostCents,
      finalCostCents: providerCostCents,
    };
  }
}
