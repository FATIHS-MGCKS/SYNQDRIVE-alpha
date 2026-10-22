import type {
  LvEstimatedHealthReasonCodeV1,
  LvEstimatedHealthSignalFamilyV1,
  LvEstimatedHealthStatusV1,
} from './lv-estimated-battery-health-v1.types';

export const LV_ESTIMATED_BATTERY_HEALTH_DECISION_POLICY_ID =
  'LV_ESTIMATED_BATTERY_HEALTH_V1_DECISION_POLICY_P1_2026-10-19';

export type RestEpisodeBandCounts = {
  GOOD: number;
  WATCH: number;
  WARNING: number;
  CRITICAL: number;
  UNSUPPORTED: number;
};

export type LongitudinalTrendV1 = 'DECLINE' | 'STABLE' | 'NOT_EVALUABLE';

export type HealthDecisionRuleIdV1 =
  | 'RULE_CHEMISTRY_UNKNOWN'
  | 'RULE_INSUFFICIENT_EPISODES'
  | 'RULE_LOAD_CRITICAL_DETERIORATION'
  | 'RULE_LOAD_WEAK_WITH_CRITICAL_REST'
  | 'RULE_LONGITUDINAL_DECLINE_WITH_WEAK_REST'
  | 'RULE_SUSTAINED_CRITICAL_WARNING_MIX'
  | 'RULE_TEMPORARILY_DISCHARGED'
  | 'RULE_LOAD_WEAK_OR_CRITICAL'
  | 'RULE_REST_WARNING_OR_DECLINE'
  | 'RULE_REST_HEALTHY_MAJORITY'
  | 'RULE_REST_MIXED_WATCH'
  | 'RULE_CONFLICTING_SIGNALS'
  | 'RULE_N14_RED_DAMP_GREEN';

export type LvEstimatedHealthDecisionTraceEpisodeV1 = {
  restSessionId: string | null;
  sourceMeasurementId: string;
  observationId: string;
  voltageV: number;
  voltageObservedAt: string;
  band: 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNSUPPORTED';
};

export type LvEstimatedHealthDecisionTraceV1 = {
  policyId: string;
  observationTimeRange: { earliestIso: string | null; latestIso: string | null };
  qualifiedEpisodeCount: number;
  episodes: LvEstimatedHealthDecisionTraceEpisodeV1[];
  bandCounts: RestEpisodeBandCounts;
  chemistry: string;
  specProvidedForRestThresholds: boolean;
  longitudinalTrend: LongitudinalTrendV1;
  loadSignal: LvEstimatedHealthStatusV1;
  crankStale: boolean;
  independentFamilies: LvEstimatedHealthSignalFamilyV1[];
  correlatedFamiliesExcluded: LvEstimatedHealthSignalFamilyV1[];
  finalRuleId: HealthDecisionRuleIdV1 | null;
  /** Present only for offline research policy runs (P2/P3). */
  researchRuleId?: string | null;
  researchPolicyVariant?: 'P1_BASELINE' | 'P2_LOAD_REQUIRED_GREEN' | 'P3_CONSERVATIVE_GREEN' | 'P11_CONDITION_POLICY_V2';
  /** P11 shadow policy only. */
  p11LongitudinalTrend?: 'DECLINE' | 'STABLE' | 'IMPROVING' | 'NOT_EVALUABLE';
  p11EpisodeSelectionTrace?: {
    sessionsConsidered: number;
    sessionsWithStableCandidate: number;
    sessionsPreStartSuspectOnly: number;
    lowVoltageEventCount: number;
    selectionPolicy: string;
  };
  p11ShadowRuleId?: string | null;
};

export type ClassifyEstimatedHealthInput = {
  bandCounts: RestEpisodeBandCounts;
  episodeCount: number;
  trend: LongitudinalTrendV1;
  loadSignal: LvEstimatedHealthStatusV1;
  chemistryKnown: boolean;
};

export type ClassifyEstimatedHealthResult = {
  status: LvEstimatedHealthStatusV1;
  ruleId: HealthDecisionRuleIdV1 | null;
  extraReasonCodes: LvEstimatedHealthReasonCodeV1[];
};

/** Fraction of qualified episodes at GOOD resting band. */
export function goodEpisodeFraction(bandCounts: RestEpisodeBandCounts, episodeCount: number): number {
  if (episodeCount <= 0) return 0;
  return bandCounts.GOOD / episodeCount;
}

/** Fraction at GOOD or WATCH (acceptable resting, not warning/critical). */
export function acceptableRestEpisodeFraction(
  bandCounts: RestEpisodeBandCounts,
  episodeCount: number,
): number {
  if (episodeCount <= 0) return 0;
  return (bandCounts.GOOD + bandCounts.WATCH) / episodeCount;
}

/**
 * Health deterioration (RED) requires independent corroboration beyond repeated low REST alone.
 */
export function classifyEstimatedHealthStatusP1(
  input: ClassifyEstimatedHealthInput,
): ClassifyEstimatedHealthResult {
  const { bandCounts, episodeCount, trend, loadSignal, chemistryKnown } = input;
  const extra: LvEstimatedHealthReasonCodeV1[] = [];

  if (!chemistryKnown) {
    return { status: 'UNKNOWN', ruleId: 'RULE_CHEMISTRY_UNKNOWN', extraReasonCodes: extra };
  }
  if (episodeCount < 2) {
    extra.push('HEALTH_INSUFFICIENT_INDEPENDENT_EPISODES');
    return { status: 'UNKNOWN', ruleId: 'RULE_INSUFFICIENT_EPISODES', extraReasonCodes: extra };
  }

  const temporarilyDischarged =
    bandCounts.CRITICAL >= 1 &&
    bandCounts.CRITICAL <= 2 &&
    bandCounts.WARNING === 0 &&
    bandCounts.GOOD + bandCounts.WATCH >= 1 &&
    loadSignal !== 'RED' &&
    trend !== 'DECLINE';

  if (loadSignal === 'RED') {
    return {
      status: 'RED',
      ruleId: 'RULE_LOAD_CRITICAL_DETERIORATION',
      extraReasonCodes: extra,
    };
  }

  const loadWeakWithCriticalRest =
    loadSignal === 'YELLOW' && bandCounts.CRITICAL >= 2 && bandCounts.WARNING >= 1;

  if (loadWeakWithCriticalRest) {
    extra.push('HEALTH_LOAD_AND_REST_DETERIORATION_CORROBORATED');
    return {
      status: 'RED',
      ruleId: 'RULE_LOAD_WEAK_WITH_CRITICAL_REST',
      extraReasonCodes: extra,
    };
  }

  if (temporarilyDischarged) {
    extra.push('HEALTH_TEMPORARILY_DISCHARGED_NOT_AGING');
    return { status: 'YELLOW', ruleId: 'RULE_TEMPORARILY_DISCHARGED', extraReasonCodes: extra };
  }

  if (loadSignal === 'YELLOW') {
    return { status: 'YELLOW', ruleId: 'RULE_LOAD_WEAK_OR_CRITICAL', extraReasonCodes: extra };
  }

  const healthyMajority =
    acceptableRestEpisodeFraction(bandCounts, episodeCount) >= 0.6 &&
    bandCounts.CRITICAL === 0 &&
    bandCounts.WARNING <= 2 &&
    (loadSignal === 'GREEN' || loadSignal === 'UNKNOWN') &&
    (trend === 'STABLE' || trend === 'NOT_EVALUABLE');

  if (healthyMajority) {
    return { status: 'GREEN', ruleId: 'RULE_REST_HEALTHY_MAJORITY', extraReasonCodes: extra };
  }

  if (
    bandCounts.CRITICAL > 0 ||
    (bandCounts.WARNING >= 2 && acceptableRestEpisodeFraction(bandCounts, episodeCount) < 0.6) ||
    (trend === 'DECLINE' && bandCounts.WARNING + bandCounts.CRITICAL >= 1) ||
    (bandCounts.WARNING === 1 && acceptableRestEpisodeFraction(bandCounts, episodeCount) < 0.6)
  ) {
    if (bandCounts.CRITICAL > 0 && loadSignal === 'UNKNOWN') {
      extra.push('HEALTH_REST_LOW_VOLTAGE_NOT_PROVEN_AGING');
    }
    return { status: 'YELLOW', ruleId: 'RULE_REST_WARNING_OR_DECLINE', extraReasonCodes: extra };
  }

  const mixedWatch =
    bandCounts.CRITICAL === 0 &&
    bandCounts.WARNING <= 1 &&
    bandCounts.WATCH + bandCounts.WARNING > 0 &&
    acceptableRestEpisodeFraction(bandCounts, episodeCount) >= 0.4;

  if (mixedWatch) {
    return { status: 'YELLOW', ruleId: 'RULE_REST_MIXED_WATCH', extraReasonCodes: extra };
  }

  extra.push('HEALTH_CONFLICTING_SIGNALS');
  return { status: 'UNKNOWN', ruleId: 'RULE_CONFLICTING_SIGNALS', extraReasonCodes: extra };
}

export function independentSupportingFamiliesP1(args: {
  hasRestEpisodes: boolean;
  trend: LongitudinalTrendV1;
  loadAuthorized: boolean;
  hasChargingRecoveryEvidence: boolean;
}): {
  independent: LvEstimatedHealthSignalFamilyV1[];
  correlatedExcluded: LvEstimatedHealthSignalFamilyV1[];
} {
  const independent: LvEstimatedHealthSignalFamilyV1[] = [];
  const correlatedExcluded: LvEstimatedHealthSignalFamilyV1[] = [];

  if (args.hasRestEpisodes) {
    independent.push('RESTING_CONDITION');
  }
  if (args.trend === 'DECLINE' || args.trend === 'STABLE') {
    correlatedExcluded.push('LONGITUDINAL_STABILITY');
  }
  if (args.loadAuthorized) {
    independent.push('LOAD_START_PERFORMANCE');
  }
  if (args.hasChargingRecoveryEvidence) {
    independent.push('CHARGING_RECOVERY_CONTEXT');
  } else if (args.hasRestEpisodes) {
    correlatedExcluded.push('CHARGING_RECOVERY_CONTEXT');
  }

  return { independent, correlatedExcluded };
}
