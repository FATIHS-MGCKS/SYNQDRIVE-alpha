import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  VoiceControlPlaneProvider,
  VoiceConversationDirection,
  VoiceUsageEventType,
} from '@prisma/client';
import {
  VoiceBillingPeriodRepository,
  VoiceUsageEventRepository,
} from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceSubscriptionService } from './voice-subscription.service';
import { billableMinutesFromSeconds, normalizeBillableSeconds } from './voice-billing-minute.util';
import { computeVoiceUsageCosts, mergeProviderCostUpdate } from './voice-billing-cost.util';
import { computeCustomerPriceForUsage } from './voice-billing-pricing.util';
import { currentBillingPeriodBounds } from './voice-billing-period.util';
import { marginCents, sumCents } from './voice-billing-rounding.util';
import { VOICE_BILLING_CURRENCY } from './voice-plan-catalog';

export type RecordConversationUsageInput = {
  organizationId: string;
  voiceConversationId: string;
  direction: VoiceConversationDirection;
  durationSeconds: number;
  provider?: VoiceControlPlaneProvider;
  externalUsageRef?: string | null;
  providerCosts?: {
    twilioCostCents?: number | null;
    elevenLabsCostCents?: number | null;
    llmCostCents?: number | null;
  };
  occurredAt?: Date;
};

@Injectable()
export class VoiceUsageLedgerService {
  private readonly logger = new Logger(VoiceUsageLedgerService.name);

  constructor(
    private readonly usageEvents: VoiceUsageEventRepository,
    private readonly billingPeriods: VoiceBillingPeriodRepository,
    private readonly subscriptions: VoiceSubscriptionService,
  ) {}

  private eventTypeForDirection(direction: VoiceConversationDirection): VoiceUsageEventType {
    return direction === 'OUTBOUND' ? 'OUTBOUND_CALL' : 'INBOUND_CALL';
  }

  async recordConversationUsage(input: RecordConversationUsageInput) {
    const subscription = await this.subscriptions.getActiveSubscription(input.organizationId);
    if (!subscription) {
      this.logger.warn(
        `Skipping usage for org ${input.organizationId}: no active voice subscription`,
      );
      return null;
    }

    const plan = this.subscriptions.resolvePlanForSubscription(subscription);
    const billableSeconds = normalizeBillableSeconds(input.durationSeconds);
    const billableMinutes = billableMinutesFromSeconds(billableSeconds);
    const { periodStart, periodEnd } = currentBillingPeriodBounds(input.occurredAt ?? new Date());

    const priorAggregate = await this.usageEvents.sumBillableMinutesInPeriod(
      input.organizationId,
      periodStart,
      periodEnd,
    );
    const priorConsumedMinutes = priorAggregate._sum.billableMinutes ?? 0;

    const customerPrice = computeCustomerPriceForUsage({
      plan,
      consumedMinutesInPeriod: priorConsumedMinutes,
      additionalBillableMinutes: billableMinutes,
    });

    const costs = computeVoiceUsageCosts({
      billableMinutes,
      providerCosts: input.providerCosts,
    });

    const idempotencyKey = `conversation:${input.voiceConversationId}:usage`;
    const externalUsageRef = input.externalUsageRef ?? input.voiceConversationId;

    const { event, created } = await this.usageEvents.persistOrGet({
      organizationId: input.organizationId,
      voiceConversationId: input.voiceConversationId,
      provider: input.provider ?? VoiceControlPlaneProvider.INTERNAL,
      eventType: this.eventTypeForDirection(input.direction),
      billableSeconds,
      billableMinutes,
      providerCostCents: costs.providerCostCents,
      internalCostCents: costs.internalCostCents,
      twilioCostCents: costs.twilioCostCents,
      elevenLabsCostCents: costs.elevenLabsCostCents,
      llmCostCents: costs.llmCostCents,
      customerPriceCents: customerPrice.customerPriceCents,
      currency: VOICE_BILLING_CURRENCY,
      externalUsageRef,
      idempotencyKey,
      costStatus: costs.costStatus,
    });

    if (!created) {
      return { event, created: false, deduplicated: true };
    }

    await this.refreshOpenBillingPeriod(input.organizationId, periodStart, periodEnd);
    return { event, created: true, deduplicated: false, customerPrice };
  }

  async finalizeUsageCosts(params: {
    organizationId: string;
    usageEventId: string;
    providerCosts: {
      twilioCostCents?: number | null;
      elevenLabsCostCents?: number | null;
      llmCostCents?: number | null;
    };
  }) {
    const row = await this.usageEvents.findById(params.organizationId, params.usageEventId);
    if (!row) {
      throw new NotFoundException('Voice usage event not found for organization');
    }

    const merged = mergeProviderCostUpdate({
      existingCostStatus: row.costStatus,
      existingCosts: {
        twilioCostCents: row.twilioCostCents,
        elevenLabsCostCents: row.elevenLabsCostCents,
        llmCostCents: row.llmCostCents,
      },
      incomingCosts: params.providerCosts,
      billableMinutes: row.billableMinutes ?? 0,
    });

    if (!merged) {
      return { event: row, updated: false, reason: 'FINAL_COSTS_LOCKED' as const };
    }

    const updated = await this.usageEvents.updateCostsIfNotFinal(
      params.organizationId,
      params.usageEventId,
      {
        providerCostCents: merged.providerCostCents,
        internalCostCents: merged.internalCostCents,
        twilioCostCents: merged.twilioCostCents,
        elevenLabsCostCents: merged.elevenLabsCostCents,
        llmCostCents: merged.llmCostCents,
        costStatus: merged.costStatus,
      },
    );

    if (updated) {
      const { periodStart, periodEnd } = currentBillingPeriodBounds(row.occurredAt);
      await this.refreshOpenBillingPeriod(params.organizationId, periodStart, periodEnd);
    }

    return { event: updated ?? row, updated: Boolean(updated) };
  }

  async refreshOpenBillingPeriod(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const subscription = await this.subscriptions.getActiveSubscription(organizationId);
    if (!subscription) {
      return null;
    }

    const plan = this.subscriptions.resolvePlanForSubscription(subscription);
    const setupOutstanding = subscription.setupFeePaidAt ? 0 : subscription.setupFeeCents;

    await this.billingPeriods.upsertOpenPeriod({
      organizationId,
      periodStart,
      periodEnd,
      planCode: plan.code,
      planCatalogVersion: plan.catalogVersion,
      monthlyBaseFeeCents: plan.monthlyFeeCents,
      setupFeeCents: setupOutstanding,
      includedMinutes: plan.entitlements.includedMinutesPerMonth,
    });

    const period = await this.billingPeriods.findOpenForOrganization(
      organizationId,
      periodStart,
      periodEnd,
    );
    if (!period) {
      return null;
    }

    const minuteSums = await this.usageEvents.sumBillableMinutesInPeriod(
      organizationId,
      periodStart,
      periodEnd,
    );
    const consumedMinutes = minuteSums._sum.billableMinutes ?? 0;
    const overageMinutes = Math.max(0, consumedMinutes - plan.entitlements.includedMinutesPerMonth);

    const directional = await this.usageEvents.sumDirectionalMinutesInPeriod(
      organizationId,
      periodStart,
      periodEnd,
    );
    let inboundMinutes = 0;
    let outboundMinutes = 0;
    for (const row of directional) {
      if (row.eventType === 'INBOUND_CALL') {
        inboundMinutes = row._sum.billableMinutes ?? 0;
      } else if (row.eventType === 'OUTBOUND_CALL') {
        outboundMinutes = row._sum.billableMinutes ?? 0;
      }
    }

    const monetary = await this.usageEvents.sumCustomerPriceInPeriod(
      organizationId,
      periodStart,
      periodEnd,
    );
    const usageRevenueCents = monetary._sum.customerPriceCents ?? 0;
    const providerCostCents = monetary._sum.internalCostCents ?? 0;
    const revenueCents = sumCents(plan.monthlyFeeCents, usageRevenueCents, setupOutstanding);

    return this.billingPeriods.refreshAggregates(organizationId, period.id, {
      consumedMinutes,
      inboundMinutes,
      outboundMinutes,
      overageMinutes,
      providerCostCents,
      revenueCents,
      marginCents: marginCents(revenueCents, providerCostCents),
    });
  }
}
