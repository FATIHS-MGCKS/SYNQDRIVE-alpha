import type { RestEpisodeBandCounts } from './lv-estimated-battery-health-v1.decision-policy';
import { acceptableRestEpisodeFraction } from './lv-estimated-battery-health-v1.decision-policy';
import type {
  LvEstimatedHealthReasonCodeV1,
  LvEstimatedHealthStatusV1,
} from './lv-estimated-battery-health-v1.types';
import type { P11QualifiedEpisodeV1 } from './lv-estimated-battery-health-p11-episode.policy';
import type { P11LongitudinalTrendV1 } from './lv-estimated-battery-health-p11-trend.policy';
import {
  P11_RECENCY_FALLBACK_EPISODE_COUNT,
  P11_RECENCY_WINDOW_DAYS,
} from './lv-estimated-battery-health-p11.constants';
import { observationProviderEventTimeMs } from '../lv-operational-condition/lv-operational-condition-observation.policy';

export type P11HealthDecisionRuleIdV1 =
  | 'P11_RULE_CHEMISTRY_UNKNOWN'
  | 'P11_RULE_INSUFFICIENT_EPISODES'
  | 'P11_RULE_LOAD_CRITICAL_DETERIORATION'
  | 'P11_RULE_LOAD_WEAK_WITH_CRITICAL_REST'
  | 'P11_RULE_LOAD_WEAK_OR_CRITICAL'
  | 'P11_RULE_GREEN_STABLE_MEDIAN_AND_RECENCY'
  | 'P11_RULE_YELLOW_RECURRENT_UNEXPLAINED_CRITICAL'
  | 'P11_RULE_YELLOW_ANCHOR_NOT_GOOD'
  | 'P11_RULE_YELLOW_RECENCY_CRITICAL'
  | 'P11_RULE_YELLOW_DECLINE'
  | 'P11_RULE_TEMPORARILY_DISCHARGED'
  | 'P11_RULE_YELLOW_MIXED_WATCH'
  | 'P11_RULE_CONFLICTING_SIGNALS';

export type P11EpisodeWithBand = {
  episode: P11QualifiedEpisodeV1;
  band: 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNSUPPORTED';
};

export type ClassifyP11HealthInput = {
  episodesWithBands: P11EpisodeWithBand[];
  bandCounts: RestEpisodeBandCounts;
  anchorMedianBand: 'GOOD' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNSUPPORTED';
  recencyBandCounts: RestEpisodeBandCounts;
  recencyEpisodeCount: number;
  trend: P11LongitudinalTrendV1;
  loadSignal: LvEstimatedHealthStatusV1;
  chemistryKnown: boolean;
  evaluatedAtIso: string;
};

export type ClassifyP11HealthResult = {
  status: LvEstimatedHealthStatusV1;
  ruleId: P11HealthDecisionRuleIdV1 | null;
  extraReasonCodes: LvEstimatedHealthReasonCodeV1[];
};

function isRecoveredCriticalEpisode(
  episodesWithBands: P11EpisodeWithBand[],
  criticalIndex: number,
): boolean {
  const after = episodesWithBands.slice(criticalIndex + 1);
  if (after.length < 2) return false;
  const nextTwo = after.slice(0, 2);
  return nextTwo.every((e) => e.band === 'GOOD' || e.band === 'WATCH');
}

export function buildP11RecencyEpisodeSet<T extends { episode: P11QualifiedEpisodeV1 }>(
  episodesWithBands: T[],
  evaluatedAtIso: string,
): T[] {
  const evalMs = Date.parse(evaluatedAtIso);
  const windowMs = P11_RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const inWindow = episodesWithBands.filter((row) => {
    const t = observationProviderEventTimeMs(row.episode);
    return Number.isFinite(evalMs) && evalMs - t <= windowMs;
  });
  if (inWindow.length >= 2) {
    return inWindow;
  }
  return episodesWithBands.slice(-P11_RECENCY_FALLBACK_EPISODE_COUNT);
}

export function classifyEstimatedHealthStatusP11(
  input: ClassifyP11HealthInput,
): ClassifyP11HealthResult {
  const extra: LvEstimatedHealthReasonCodeV1[] = [];
  const { bandCounts, recencyBandCounts, recencyEpisodeCount, trend, loadSignal, chemistryKnown } =
    input;

  if (!chemistryKnown) {
    return { status: 'UNKNOWN', ruleId: 'P11_RULE_CHEMISTRY_UNKNOWN', extraReasonCodes: extra };
  }
  if (input.episodesWithBands.length < 2) {
    extra.push('HEALTH_INSUFFICIENT_INDEPENDENT_EPISODES');
    return { status: 'UNKNOWN', ruleId: 'P11_RULE_INSUFFICIENT_EPISODES', extraReasonCodes: extra };
  }

  if (loadSignal === 'RED') {
    return {
      status: 'RED',
      ruleId: 'P11_RULE_LOAD_CRITICAL_DETERIORATION',
      extraReasonCodes: extra,
    };
  }

  const loadWeakWithCriticalRest =
    loadSignal === 'YELLOW' && recencyBandCounts.CRITICAL >= 2 && recencyBandCounts.WARNING >= 1;
  if (loadWeakWithCriticalRest) {
    extra.push('HEALTH_LOAD_AND_REST_DETERIORATION_CORROBORATED');
    return {
      status: 'RED',
      ruleId: 'P11_RULE_LOAD_WEAK_WITH_CRITICAL_REST',
      extraReasonCodes: extra,
    };
  }

  const recencySet = buildP11RecencyEpisodeSet(
    input.episodesWithBands,
    input.evaluatedAtIso,
  );
  const recencyIds = new Set(recencySet.map((r) => r.episode.observationId));

  const unrecoveredCriticalInRecency = (() => {
    let count = 0;
    for (let i = 0; i < input.episodesWithBands.length; i += 1) {
      const row = input.episodesWithBands[i];
      if (row.episode.stabilityClass === 'PRE_START_WAKE_SUSPECT') continue;
      if (row.band !== 'CRITICAL') continue;
      if (!recencyIds.has(row.episode.observationId)) continue;
      if (!isRecoveredCriticalEpisode(input.episodesWithBands, i)) count += 1;
    }
    return count;
  })();

  const temporarilyDischarged =
    unrecoveredCriticalInRecency > 0 &&
    recencyBandCounts.CRITICAL >= 1 &&
    recencyBandCounts.CRITICAL <= 2 &&
    recencyBandCounts.WARNING <= 2 &&
    recencyBandCounts.GOOD + recencyBandCounts.WATCH >= 1 &&
    trend !== 'DECLINE';
  if (temporarilyDischarged) {
    extra.push('HEALTH_TEMPORARILY_DISCHARGED_NOT_AGING');
    return { status: 'YELLOW', ruleId: 'P11_RULE_TEMPORARILY_DISCHARGED', extraReasonCodes: extra };
  }

  if (loadSignal === 'YELLOW') {
    return { status: 'YELLOW', ruleId: 'P11_RULE_LOAD_WEAK_OR_CRITICAL', extraReasonCodes: extra };
  }

  const recurrentUnexplainedCritical =
    recencyBandCounts.CRITICAL >= 2 || unrecoveredCriticalInRecency >= 1;

  const anchorGood = input.anchorMedianBand === 'GOOD';
  const recencyAcceptable =
    acceptableRestEpisodeFraction(recencyBandCounts, recencyEpisodeCount) >= 0.6 &&
    !recurrentUnexplainedCritical &&
    recencyBandCounts.WARNING <= 1;

  const greenCandidate =
    anchorGood &&
    recencyAcceptable &&
    (loadSignal === 'GREEN' || loadSignal === 'UNKNOWN') &&
    (trend === 'STABLE' || trend === 'IMPROVING' || trend === 'NOT_EVALUABLE');

  if (greenCandidate) {
    return {
      status: 'GREEN',
      ruleId: 'P11_RULE_GREEN_STABLE_MEDIAN_AND_RECENCY',
      extraReasonCodes: extra,
    };
  }

  if (recurrentUnexplainedCritical) {
    extra.push('HEALTH_REST_LOW_VOLTAGE_NOT_PROVEN_AGING');
    extra.push('HEALTH_P11_RECURRENT_CRITICAL_REST');
    return {
      status: 'YELLOW',
      ruleId: 'P11_RULE_YELLOW_RECURRENT_UNEXPLAINED_CRITICAL',
      extraReasonCodes: extra,
    };
  }

  if (input.anchorMedianBand === 'WATCH' || input.anchorMedianBand === 'WARNING') {
    return {
      status: 'YELLOW',
      ruleId: 'P11_RULE_YELLOW_ANCHOR_NOT_GOOD',
      extraReasonCodes: extra,
    };
  }

  if (recencyBandCounts.CRITICAL > 0 || recencyBandCounts.WARNING >= 2) {
    if (recencyBandCounts.CRITICAL > 0 && loadSignal === 'UNKNOWN') {
      extra.push('HEALTH_REST_LOW_VOLTAGE_NOT_PROVEN_AGING');
    }
    return {
      status: 'YELLOW',
      ruleId: 'P11_RULE_YELLOW_RECENCY_CRITICAL',
      extraReasonCodes: extra,
    };
  }

  if (trend === 'DECLINE') {
    extra.push('HEALTH_LONGITUDINAL_DECLINE_SUSPECTED');
    return { status: 'YELLOW', ruleId: 'P11_RULE_YELLOW_DECLINE', extraReasonCodes: extra };
  }

  const mixedWatch =
    recencyBandCounts.CRITICAL === 0 &&
    recencyBandCounts.WARNING <= 1 &&
    recencyBandCounts.WATCH + recencyBandCounts.WARNING > 0 &&
    acceptableRestEpisodeFraction(recencyBandCounts, recencyEpisodeCount) >= 0.4;

  if (mixedWatch) {
    return { status: 'YELLOW', ruleId: 'P11_RULE_YELLOW_MIXED_WATCH', extraReasonCodes: extra };
  }

  extra.push('HEALTH_CONFLICTING_SIGNALS');
  return { status: 'UNKNOWN', ruleId: 'P11_RULE_CONFLICTING_SIGNALS', extraReasonCodes: extra };
}
