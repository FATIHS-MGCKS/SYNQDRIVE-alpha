import {
  VOICE_COST_FALLBACK_CENTS_PER_MINUTE,
  VOICE_COST_FALLBACK_NUMBER_RENTAL_CENTS,
} from './voice-plan-catalog';
import { multiplyCents, sumCents } from './voice-billing-rounding.util';

export type VoiceProviderCostBreakdown = {
  twilioCostCents: number | null;
  elevenLabsCostCents: number | null;
  llmCostCents: number | null;
};

export type VoiceCostComputationInput = {
  billableMinutes: number;
  providerCosts?: Partial<VoiceProviderCostBreakdown>;
  numberRental?: boolean;
};

export type VoiceCostComputationResult = {
  twilioCostCents: number;
  elevenLabsCostCents: number;
  llmCostCents: number;
  internalCostCents: number;
  providerCostCents: number;
  costStatus: 'ESTIMATED' | 'FINAL';
  usedFallback: boolean;
};

function hasAnyRealProviderCost(costs?: Partial<VoiceProviderCostBreakdown>): boolean {
  if (!costs) {
    return false;
  }
  return [costs.twilioCostCents, costs.elevenLabsCostCents, costs.llmCostCents].some(
    (value) => typeof value === 'number' && Number.isFinite(value),
  );
}

/**
 * Computes internal/provider cost for a usage row.
 * Uses real provider splits when supplied; otherwise applies conservative per-minute fallback.
 */
export function computeVoiceUsageCosts(
  input: VoiceCostComputationInput,
): VoiceCostComputationResult {
  const minutes = Math.max(0, input.billableMinutes);
  const realCosts = hasAnyRealProviderCost(input.providerCosts);

  if (realCosts) {
    const twilioCostCents = Math.round(input.providerCosts?.twilioCostCents ?? 0);
    const elevenLabsCostCents = Math.round(input.providerCosts?.elevenLabsCostCents ?? 0);
    const llmCostCents = Math.round(input.providerCosts?.llmCostCents ?? 0);
    const internalCostCents = sumCents(twilioCostCents, elevenLabsCostCents, llmCostCents);
    return {
      twilioCostCents,
      elevenLabsCostCents,
      llmCostCents,
      internalCostCents,
      providerCostCents: internalCostCents,
      costStatus: 'FINAL',
      usedFallback: false,
    };
  }

  let internalCostCents = multiplyCents(VOICE_COST_FALLBACK_CENTS_PER_MINUTE, minutes);
  if (input.numberRental) {
    internalCostCents += VOICE_COST_FALLBACK_NUMBER_RENTAL_CENTS;
  }

  return {
    twilioCostCents: internalCostCents,
    elevenLabsCostCents: 0,
    llmCostCents: 0,
    internalCostCents,
    providerCostCents: internalCostCents,
    costStatus: 'ESTIMATED',
    usedFallback: true,
  };
}

/**
 * Merges provider cost updates without overwriting FINAL rows with estimates.
 */
export function mergeProviderCostUpdate(params: {
  existingCostStatus: 'ESTIMATED' | 'FINAL';
  existingCosts: VoiceProviderCostBreakdown;
  incomingCosts: Partial<VoiceProviderCostBreakdown>;
  billableMinutes: number;
  numberRental?: boolean;
}): VoiceCostComputationResult | null {
  if (params.existingCostStatus === 'FINAL') {
    return null;
  }

  const merged: VoiceProviderCostBreakdown = {
    twilioCostCents:
      params.incomingCosts.twilioCostCents ?? params.existingCosts.twilioCostCents,
    elevenLabsCostCents:
      params.incomingCosts.elevenLabsCostCents ?? params.existingCosts.elevenLabsCostCents,
    llmCostCents: params.incomingCosts.llmCostCents ?? params.existingCosts.llmCostCents,
  };

  return computeVoiceUsageCosts({
    billableMinutes: params.billableMinutes,
    providerCosts: merged,
    numberRental: params.numberRental,
  });
}
