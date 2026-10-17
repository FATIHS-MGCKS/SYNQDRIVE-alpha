import { RETENTION_MIN_SLOPE_POINTS } from '../rest-session-features/rest-session-feature.constants';
import { computePairwiseNominalRungDeltas } from '../rest-session-features/rest-session-retention.policy';
import type { RestSessionFeatureInputRetentionPointV1 } from '../rest-session-features/rest-session-feature-input-snapshot.types';

/**
 * Minimum rest-age span required before the N13 read model presents a C3 Theil-Sen slope
 * as a resting self-discharge trend (not a hard C3 computation gate).
 *
 * Rationale: C3 allows RETENTION_MIN_SLOPE_POINTS=2 with RETENTION_TIME_AUTHORITY=actualRestAgeMs.
 * Pairwise slopes over sub-hour spans amplify measurement noise and transition effects
 * (e.g. Ruptela production rows at ~73s / ~110s spans with CHARGING_DETECTED endings).
 */
export const LV_MEASURED_SLOPE_MIN_REST_OBSERVATION_SPAN_MS = 60 * 60 * 1000;

export type LvMeasuredSlopeInterpretabilityV1 = 'REST_SELF_DISCHARGE_TREND' | 'CONTEXT_LIMITED';

export type LvMeasuredSlopeLimitationCodeV1 =
  | 'C3_SLOPE_NOT_COMPUTED'
  | 'C3_SLOPE_TWO_POINT_MINIMUM_ONLY'
  | 'C3_SLOPE_SHORT_OBSERVATION_SPAN'
  | 'C3_SLOPE_CHARGING_TRANSITION_END'
  | 'C3_SLOPE_DUPLICATE_NOMINAL_RUNG';

export interface LvMeasuredC3SlopeQualityV1 {
  interpretability: LvMeasuredSlopeInterpretabilityV1;
  limitationCodes: LvMeasuredSlopeLimitationCodeV1[];
}

function retentionPointsToEligible(
  retentionPoints: RestSessionFeatureInputRetentionPointV1[],
): { nominalRestIntervalIndex: number | null; actualRestAgeMs: number; voltageMv: number }[] {
  return retentionPoints
    .filter((p) => p.actualRestAgeMs != null && p.voltageMv != null)
    .map((p) => ({
      nominalRestIntervalIndex: p.nominalRestIntervalIndex ?? null,
      actualRestAgeMs: p.actualRestAgeMs!,
      voltageMv: p.voltageMv!,
    }));
}

export function assessLvMeasuredC3SlopeQualityV1(input: {
  robustRestSlopeMvPerHour: number | null;
  numberOfValidRestPoints: number | null;
  observationSpanMs: number | null;
  sessionEndReason: string | null;
  retentionPoints: RestSessionFeatureInputRetentionPointV1[];
}): LvMeasuredC3SlopeQualityV1 {
  const codes: LvMeasuredSlopeLimitationCodeV1[] = [];

  if (input.robustRestSlopeMvPerHour == null) {
    return { interpretability: 'CONTEXT_LIMITED', limitationCodes: ['C3_SLOPE_NOT_COMPUTED'] };
  }

  const pointCount = input.numberOfValidRestPoints ?? 0;
  if (pointCount === RETENTION_MIN_SLOPE_POINTS) {
    codes.push('C3_SLOPE_TWO_POINT_MINIMUM_ONLY');
  }

  if (
    input.observationSpanMs != null &&
    input.observationSpanMs < LV_MEASURED_SLOPE_MIN_REST_OBSERVATION_SPAN_MS
  ) {
    codes.push('C3_SLOPE_SHORT_OBSERVATION_SPAN');
  }

  if (input.sessionEndReason === 'CHARGING_DETECTED') {
    codes.push('C3_SLOPE_CHARGING_TRANSITION_END');
  }

  const eligible = retentionPointsToEligible(input.retentionPoints);
  if (eligible.length >= 2) {
    const pairwise = computePairwiseNominalRungDeltas(
      eligible.map((p, i) => ({
        observationId: `n13-${i}`,
        actualRestAgeMs: p.actualRestAgeMs,
        voltageMv: p.voltageMv,
        providerObservationAtMs: null,
        nominalRestIntervalIndex: p.nominalRestIntervalIndex,
        evidenceClass: 'PARKED_REST_CANDIDATE' as never,
      })),
    );
    if (pairwise == null) {
      codes.push('C3_SLOPE_DUPLICATE_NOMINAL_RUNG');
    }
  }

  return {
    interpretability: codes.length === 0 ? 'REST_SELF_DISCHARGE_TREND' : 'CONTEXT_LIMITED',
    limitationCodes: codes,
  };
}
