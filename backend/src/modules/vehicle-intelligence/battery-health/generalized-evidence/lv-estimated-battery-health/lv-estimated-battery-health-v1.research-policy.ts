import {
  LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_EPISODES,
  LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_OBSERVATION_SPAN_DAYS,
} from './lv-estimated-battery-health-v1.constants';
import type {
  ClassifyEstimatedHealthInput,
  ClassifyEstimatedHealthResult,
  LongitudinalTrendV1,
  RestEpisodeBandCounts,
} from './lv-estimated-battery-health-v1.decision-policy';
import { classifyEstimatedHealthStatusP1 } from './lv-estimated-battery-health-v1.decision-policy';
import type {
  LvEstimatedHealthReasonCodeV1,
  LvEstimatedHealthStatusV1,
} from './lv-estimated-battery-health-v1.types';

export type LvEstimatedBatteryHealthResearchPolicyVariant =
  | 'P1_BASELINE'
  | 'P2_LOAD_REQUIRED_GREEN'
  | 'P3_CONSERVATIVE_GREEN';

export type ResearchHealthDecisionRuleIdV1 =
  | 'RESEARCH_P2_GREEN_REQUIRES_VALIDATED_LOAD'
  | 'RESEARCH_P3_GREEN_REQUIRES_VALIDATED_LOAD'
  | 'RESEARCH_P3_GREEN_REQUIRES_TEMPERATURE'
  | 'RESEARCH_P3_GREEN_REQUIRES_EPISODE_HISTORY'
  | 'RESEARCH_P3_GREEN_REQUIRES_TIME_SPAN'
  | 'RESEARCH_P3_GREEN_REQUIRES_STABLE_TREND'
  | 'RESEARCH_P3_GREEN_BLOCKED_DATA_GAP'
  | 'RESEARCH_P3_GREEN_BLOCKED_CRITICAL_REST';

export type ResearchPolicyEvaluationContext = {
  bandCounts: RestEpisodeBandCounts;
  episodeCount: number;
  trend: LongitudinalTrendV1;
  loadSignal: LvEstimatedHealthStatusV1;
  crankStale: boolean;
  loadAuthorizedForHealth: boolean;
  loadProvenanceValidated: boolean;
  observationSpanDays: number;
  openProviderGaps: number;
  inputCoverageIncomplete: boolean;
  historicalObservationsTruncated: boolean;
  temperatureObservationCount: number;
  temperatureProvenanceValid: boolean;
};

export type ResearchEvidenceCompletenessV1 = {
  score: number;
  maxScore: number;
  label: 'LOW' | 'MEDIUM' | 'HIGH';
  missingLoadEvidence: boolean;
  missingTemperatureEvidence: boolean;
  greenBlockers: ResearchHealthDecisionRuleIdV1[];
};

export function observationSpanDaysFromIsoRange(
  earliestIso: string | null,
  latestIso: string | null,
): number {
  if (!earliestIso || !latestIso) return 0;
  const start = Date.parse(earliestIso);
  const end = Date.parse(latestIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return (end - start) / (24 * 60 * 60 * 1000);
}

function passesP2LoadGate(ctx: ResearchPolicyEvaluationContext): boolean {
  return (
    ctx.loadSignal === 'GREEN' &&
    !ctx.crankStale &&
    ctx.loadAuthorizedForHealth &&
    ctx.loadProvenanceValidated
  );
}

function listP3GreenBlockers(ctx: ResearchPolicyEvaluationContext): ResearchHealthDecisionRuleIdV1[] {
  const blockers: ResearchHealthDecisionRuleIdV1[] = [];
  if (!passesP2LoadGate(ctx)) {
    blockers.push('RESEARCH_P3_GREEN_REQUIRES_VALIDATED_LOAD');
  }
  if (ctx.episodeCount < LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_EPISODES) {
    blockers.push('RESEARCH_P3_GREEN_REQUIRES_EPISODE_HISTORY');
  }
  if (ctx.observationSpanDays < LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_OBSERVATION_SPAN_DAYS) {
    blockers.push('RESEARCH_P3_GREEN_REQUIRES_TIME_SPAN');
  }
  if (ctx.trend !== 'STABLE') {
    blockers.push('RESEARCH_P3_GREEN_REQUIRES_STABLE_TREND');
  }
  if (
    ctx.openProviderGaps > 0 ||
    ctx.inputCoverageIncomplete ||
    ctx.historicalObservationsTruncated
  ) {
    blockers.push('RESEARCH_P3_GREEN_BLOCKED_DATA_GAP');
  }
  if (ctx.temperatureObservationCount === 0) {
    blockers.push('RESEARCH_P3_GREEN_REQUIRES_TEMPERATURE');
  } else if (!ctx.temperatureProvenanceValid) {
    blockers.push('RESEARCH_P3_GREEN_REQUIRES_TEMPERATURE');
  }
  if (ctx.bandCounts.CRITICAL > 0) {
    blockers.push('RESEARCH_P3_GREEN_BLOCKED_CRITICAL_REST');
  }
  return blockers;
}

function reasonCodesForGreenBlock(
  variant: LvEstimatedBatteryHealthResearchPolicyVariant,
  ctx: ResearchPolicyEvaluationContext,
  blockers: ResearchHealthDecisionRuleIdV1[],
): LvEstimatedHealthReasonCodeV1[] {
  const codes: LvEstimatedHealthReasonCodeV1[] = [];
  if (variant === 'P2_LOAD_REQUIRED_GREEN' || variant === 'P3_CONSERVATIVE_GREEN') {
    if (ctx.loadSignal !== 'GREEN') {
      codes.push('RESEARCH_GREEN_BLOCKED_NO_LOAD');
    }
    if (ctx.crankStale) {
      codes.push('RESEARCH_GREEN_BLOCKED_STALE_CRANK');
    }
    if (ctx.loadSignal === 'GREEN' && !ctx.loadProvenanceValidated) {
      codes.push('RESEARCH_GREEN_BLOCKED_LOAD_PROVENANCE_INVALID');
    }
  }
  if (variant === 'P3_CONSERVATIVE_GREEN') {
    if (ctx.temperatureObservationCount === 0) {
      codes.push('RESEARCH_GREEN_BLOCKED_NO_TEMPERATURE');
    } else if (!ctx.temperatureProvenanceValid) {
      codes.push('RESEARCH_GREEN_BLOCKED_TEMPERATURE_PROVENANCE_INVALID');
    }
    if (ctx.episodeCount < LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_EPISODES) {
      codes.push('RESEARCH_GREEN_BLOCKED_INSUFFICIENT_EPISODE_HISTORY');
    }
    if (ctx.observationSpanDays < LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_OBSERVATION_SPAN_DAYS) {
      codes.push('RESEARCH_GREEN_BLOCKED_INSUFFICIENT_TIME_SPAN');
    }
    if (ctx.trend !== 'STABLE') {
      codes.push('RESEARCH_GREEN_BLOCKED_TREND_NOT_STABLE');
    }
    if (ctx.openProviderGaps > 0) {
      codes.push('RESEARCH_GREEN_BLOCKED_PROVIDER_GAP');
    }
    if (ctx.inputCoverageIncomplete || ctx.historicalObservationsTruncated) {
      codes.push('RESEARCH_GREEN_BLOCKED_INPUT_TRUNCATED');
    }
    if (ctx.bandCounts.CRITICAL > 0) {
      codes.push('RESEARCH_GREEN_BLOCKED_CRITICAL_REST');
    }
  }
  return [...new Set(codes)];
}

function primaryResearchRuleId(
  blockers: ResearchHealthDecisionRuleIdV1[],
): ResearchHealthDecisionRuleIdV1 {
  return blockers[0] ?? 'RESEARCH_P2_GREEN_REQUIRES_VALIDATED_LOAD';
}

/**
 * Applies offline research policy overlays on top of unchanged P1 classification.
 * RED paths from P1 are never weakened. Missing positive evidence cannot yield GREEN.
 */
export function applyResearchPolicyAfterP1(
  variant: LvEstimatedBatteryHealthResearchPolicyVariant,
  p1: ClassifyEstimatedHealthResult,
  ctx: ResearchPolicyEvaluationContext,
): ClassifyEstimatedHealthResult & { researchRuleId?: ResearchHealthDecisionRuleIdV1 | null } {
  if (variant === 'P1_BASELINE') {
    return { ...p1, researchRuleId: null };
  }

  if (p1.status === 'RED') {
    return { ...p1, researchRuleId: null };
  }

  if (p1.status !== 'GREEN') {
    return { ...p1, researchRuleId: null };
  }

  if (variant === 'P2_LOAD_REQUIRED_GREEN') {
    if (passesP2LoadGate(ctx)) {
      return { ...p1, researchRuleId: null };
    }
    const blockers: ResearchHealthDecisionRuleIdV1[] = ['RESEARCH_P2_GREEN_REQUIRES_VALIDATED_LOAD'];
    const extra = reasonCodesForGreenBlock(variant, ctx, blockers);
    return {
      status: 'UNKNOWN',
      ruleId: p1.ruleId,
      extraReasonCodes: [...p1.extraReasonCodes, ...extra],
      researchRuleId: primaryResearchRuleId(blockers),
    };
  }

  const blockers = listP3GreenBlockers(ctx);
  if (blockers.length === 0) {
    return { ...p1, researchRuleId: null };
  }
  const extra = reasonCodesForGreenBlock(variant, ctx, blockers);
  return {
    status: 'UNKNOWN',
    ruleId: p1.ruleId,
    extraReasonCodes: [...p1.extraReasonCodes, ...extra],
    researchRuleId: primaryResearchRuleId(blockers),
  };
}

export function classifyEstimatedHealthWithResearchPolicy(
  variant: LvEstimatedBatteryHealthResearchPolicyVariant,
  input: ClassifyEstimatedHealthInput,
  ctx: ResearchPolicyEvaluationContext,
): ClassifyEstimatedHealthResult & { researchRuleId?: ResearchHealthDecisionRuleIdV1 | null } {
  const p1 = classifyEstimatedHealthStatusP1(input);
  return applyResearchPolicyAfterP1(variant, p1, ctx);
}

export function computeResearchEvidenceCompleteness(
  ctx: ResearchPolicyEvaluationContext,
  variant: LvEstimatedBatteryHealthResearchPolicyVariant = 'P3_CONSERVATIVE_GREEN',
): ResearchEvidenceCompletenessV1 {
  const blockers =
    variant === 'P3_CONSERVATIVE_GREEN' ? listP3GreenBlockers(ctx) : [];
  const missingLoad = !passesP2LoadGate(ctx);
  const missingTemperature =
    ctx.temperatureObservationCount === 0 || !ctx.temperatureProvenanceValid;

  let score = 0;
  const maxScore = 6;
  if (ctx.episodeCount >= LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_EPISODES) score += 1;
  if (!missingLoad) score += 1;
  if (!missingTemperature) score += 1;
  if (ctx.observationSpanDays >= LV_ESTIMATED_HEALTH_RESEARCH_P3_MIN_OBSERVATION_SPAN_DAYS) {
    score += 1;
  }
  if (ctx.openProviderGaps === 0 && !ctx.inputCoverageIncomplete) score += 1;
  if (ctx.trend === 'STABLE') score += 1;

  const label: ResearchEvidenceCompletenessV1['label'] =
    score <= 2 ? 'LOW' : score <= 4 ? 'MEDIUM' : 'HIGH';

  return {
    score,
    maxScore,
    label,
    missingLoadEvidence: missingLoad,
    missingTemperatureEvidence: missingTemperature,
    greenBlockers: blockers,
  };
}
