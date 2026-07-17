import type { VoicePlanDefinition } from './voice-plan-catalog';
import { multiplyCents, sumCents } from './voice-billing-rounding.util';

export type VoiceCustomerPriceInput = {
  plan: VoicePlanDefinition;
  consumedMinutesInPeriod: number;
  additionalBillableMinutes: number;
};

export type VoiceCustomerPriceBreakdown = {
  includedMinutes: number;
  consumedMinutesAfterEvent: number;
  billableMinutesThisEvent: number;
  includedAppliedMinutes: number;
  overageMinutes: number;
  overageCents: number;
  customerPriceCents: number;
};

/**
 * Allocates billable minutes against included pool, then applies overage rate.
 */
export function computeCustomerPriceForUsage(
  input: VoiceCustomerPriceInput,
): VoiceCustomerPriceBreakdown {
  const includedMinutes = input.plan.entitlements.includedMinutesPerMonth;
  const priorConsumed = Math.max(0, input.consumedMinutesInPeriod);
  const eventMinutes = Math.max(0, input.additionalBillableMinutes);

  const remainingIncluded = Math.max(0, includedMinutes - priorConsumed);
  const includedAppliedMinutes = Math.min(remainingIncluded, eventMinutes);
  const overageMinutes = eventMinutes - includedAppliedMinutes;
  const overageCents = multiplyCents(
    input.plan.entitlements.overageCentsPerMinute,
    overageMinutes,
  );

  return {
    includedMinutes,
    consumedMinutesAfterEvent: priorConsumed + eventMinutes,
    billableMinutesThisEvent: eventMinutes,
    includedAppliedMinutes,
    overageMinutes,
    overageCents,
    customerPriceCents: overageCents,
  };
}

export type VoicePeriodRevenueForecast = {
  monthlyBaseFeeCents: number;
  setupFeeCents: number;
  setupFeeOutstandingCents: number;
  consumedMinutes: number;
  includedMinutes: number;
  remainingIncludedMinutes: number;
  overageMinutes: number;
  overageRevenueCents: number;
  usageRevenueCents: number;
  projectedRevenueCents: number;
};

export function computePeriodRevenueForecast(params: {
  plan: VoicePlanDefinition;
  consumedMinutes: number;
  setupFeeOutstandingCents: number;
}): VoicePeriodRevenueForecast {
  const includedMinutes = params.plan.entitlements.includedMinutesPerMonth;
  const consumedMinutes = Math.max(0, params.consumedMinutes);
  const overageMinutes = Math.max(0, consumedMinutes - includedMinutes);
  const overageRevenueCents = multiplyCents(
    params.plan.entitlements.overageCentsPerMinute,
    overageMinutes,
  );

  const monthlyBaseFeeCents = params.plan.monthlyFeeCents;
  const usageRevenueCents = overageRevenueCents;
  const projectedRevenueCents = sumCents(
    monthlyBaseFeeCents,
    usageRevenueCents,
    params.setupFeeOutstandingCents,
  );

  return {
    monthlyBaseFeeCents,
    setupFeeCents: params.plan.setupFeeCents,
    setupFeeOutstandingCents: params.setupFeeOutstandingCents,
    consumedMinutes,
    includedMinutes,
    remainingIncludedMinutes: Math.max(0, includedMinutes - consumedMinutes),
    overageMinutes,
    overageRevenueCents,
    usageRevenueCents,
    projectedRevenueCents,
  };
}
