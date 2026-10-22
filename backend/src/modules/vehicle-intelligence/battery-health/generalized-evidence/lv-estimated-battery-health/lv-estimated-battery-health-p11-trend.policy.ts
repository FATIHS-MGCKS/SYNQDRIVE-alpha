import { medianRestVoltageMv } from '../lv-operational-condition/lv-operational-condition-observation.policy';
import type { P11QualifiedEpisodeV1 } from './lv-estimated-battery-health-p11-episode.policy';
import {
  P11_TREND_DECLINE_DELTA_MV,
  P11_TREND_IMPROVING_DELTA_MV,
  P11_TREND_MIN_EPISODES_PER_HALF,
  P11_TREND_STABLE_ABS_DELTA_MV,
} from './lv-estimated-battery-health-p11.constants';

export type P11LongitudinalTrendV1 = 'DECLINE' | 'STABLE' | 'IMPROVING' | 'NOT_EVALUABLE';

export type P11TrendEvaluationV1 = {
  trend: P11LongitudinalTrendV1;
  deltaMv: number | null;
  firstHalfCount: number;
  secondHalfCount: number;
};

/**
 * P11 trend uses stable episodes only (excludes PRE_START_WAKE_SUSPECT) and requires
 * ≥3 episodes per chronological half before comparing medians.
 */
export function evaluateP11LongitudinalTrend(
  episodes: P11QualifiedEpisodeV1[],
): P11TrendEvaluationV1 {
  const stable = episodes.filter((e) => e.stabilityClass !== 'PRE_START_WAKE_SUSPECT');
  const minTotal = P11_TREND_MIN_EPISODES_PER_HALF * 2;
  if (stable.length < minTotal) {
    return {
      trend: 'NOT_EVALUABLE',
      deltaMv: null,
      firstHalfCount: 0,
      secondHalfCount: 0,
    };
  }

  const half = Math.floor(stable.length / 2);
  const firstSlice = stable.slice(0, half);
  const secondSlice = stable.slice(half);
  if (
    firstSlice.length < P11_TREND_MIN_EPISODES_PER_HALF ||
    secondSlice.length < P11_TREND_MIN_EPISODES_PER_HALF
  ) {
    return {
      trend: 'NOT_EVALUABLE',
      deltaMv: null,
      firstHalfCount: firstSlice.length,
      secondHalfCount: secondSlice.length,
    };
  }

  const toObs = (e: P11QualifiedEpisodeV1) => ({
    observationId: e.observationId,
    sourceMeasurementId: e.sourceMeasurementId,
    restSessionId: e.restSessionId,
    voltageV: e.representativeVoltageV,
    voltageObservedAt: e.voltageObservedAt,
    providerObservationAt: e.providerObservationAt,
    operationalContext: 'REST' as const,
    evidenceClass: e.evidenceClass,
    actualRestAgeHours: e.actualRestAgeHours,
    temperatureC: e.temperatureC,
    isLvCharging: e.isLvCharging,
    engineRunning: e.engineRunning,
  });

  const firstMedian = medianRestVoltageMv(firstSlice.map(toObs));
  const secondMedian = medianRestVoltageMv(secondSlice.map(toObs));
  if (firstMedian == null || secondMedian == null) {
    return {
      trend: 'NOT_EVALUABLE',
      deltaMv: null,
      firstHalfCount: firstSlice.length,
      secondHalfCount: secondSlice.length,
    };
  }

  const deltaMv = secondMedian - firstMedian;
  if (deltaMv <= P11_TREND_DECLINE_DELTA_MV) {
    return {
      trend: 'DECLINE',
      deltaMv,
      firstHalfCount: firstSlice.length,
      secondHalfCount: secondSlice.length,
    };
  }
  if (deltaMv >= P11_TREND_IMPROVING_DELTA_MV) {
    return {
      trend: 'IMPROVING',
      deltaMv,
      firstHalfCount: firstSlice.length,
      secondHalfCount: secondSlice.length,
    };
  }
  if (Math.abs(deltaMv) < P11_TREND_STABLE_ABS_DELTA_MV) {
    return {
      trend: 'STABLE',
      deltaMv,
      firstHalfCount: firstSlice.length,
      secondHalfCount: secondSlice.length,
    };
  }
  return {
    trend: 'NOT_EVALUABLE',
    deltaMv,
    firstHalfCount: firstSlice.length,
    secondHalfCount: secondSlice.length,
  };
}
