import {
  canonicalFeatureInputUtf8,
  compareUtf16CodeUnitLexicographic,
  sha256HexLowercaseUtf8,
} from '../feature-input-canonical.serializer';
import {
  computeM3_3E_ConsumptionInputFingerprintV1,
} from './longitudinal-assessment-input.adapter';
import { M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION } from './longitudinal-assessment-input.constants';
import type {
  M3_3E_AssessmentGradeObservationV1,
  M3_3E_LongitudinalAssessmentInputV1,
} from './longitudinal-assessment-input.types';
import { LONGITUDINAL_PROFILE_FINGERPRINT_HEX_PATTERN } from './longitudinal-profile-materialization.errors';
import { isCanonicalUtcIsoTimestamp } from './longitudinal-profile.validation';
import {
  computeM3_3E_CalibrationProfileFingerprintV1,
  M3_3E_CALIBRATION_UNSET_PROFILE_V1,
  M3_3E_CALIBRATION_UNSET_V1,
  type M3_3E_CalibrationProfileV1,
} from './longitudinal-health-calibration-profile';
import {
  M3_3E_E2_MODEL_POLICY_VERSION,
  M3_3E_HEALTH_EVALUATION_CONTRACT_VERSION,
  M3_3E_HEALTH_EVALUATION_DAY_MS,
  M3_3E_HEALTH_PRIMARY_METRICS_V1,
  type M3_3E_HEALTH_EVALUATION_REASON_CODE_V1,
  type M3_3E_HEALTH_PRIMARY_METRIC_V1,
} from './longitudinal-health-evaluation.constants';
import type {
  M3_3E_EvaluateHealthArgs,
  M3_3E_EvaluateHealthOutcome,
  M3_3E_HealthComparabilityState,
  M3_3E_HealthEvaluationRejectReason,
  M3_3E_HealthMetricContextDescriptorsV1,
  M3_3E_HealthMetricEvaluationV1,
  M3_3E_HealthMetricStatisticsV1,
  M3_3E_HealthOutlierClass,
  M3_3E_HealthSegmentEvaluationV1,
  M3_3E_HealthSufficiencyState,
  M3_3E_HealthTrendState,
  M3_3E_KendallPairCountsV1,
  M3_3E_LongitudinalHealthEvaluationV1,
} from './longitudinal-health-evaluation.types';

type Reject = { kind: 'reject'; reason: M3_3E_HealthEvaluationRejectReason };

function reject(reason: M3_3E_HealthEvaluationRejectReason): Reject {
  return { kind: 'reject', reason };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function canonicalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function overflowReject(): Reject {
  return reject('M3_3E_HEALTH_EVALUATION_NUMERIC_OVERFLOW');
}

function storeSafeInteger(preQuantized: number, quantized: number): number | Reject {
  if (!Number.isFinite(preQuantized)) {
    return overflowReject();
  }
  const v = canonicalizeNegativeZero(Math.round(quantized));
  if (!Number.isSafeInteger(v)) {
    return overflowReject();
  }
  return v;
}

function medianInteger(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sorted[mid];
  }
  return canonicalizeNegativeZero(Math.round((sorted[mid - 1] + sorted[mid]) / 2));
}

/** Even count: unrounded mean of two middle physical slopes (Theil-Sen). */
function medianPhysicalSlopes(slopes: number[]): number | null {
  if (slopes.length === 0) {
    return null;
  }
  const sorted = [...slopes].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianPhysicalNumbers(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function sortReasonCodes(codes: M3_3E_HEALTH_EVALUATION_REASON_CODE_V1[]): M3_3E_HEALTH_EVALUATION_REASON_CODE_V1[] {
  const unique = [...new Set(codes)];
  unique.sort(compareUtf16CodeUnitLexicographic);
  return unique;
}

function compareObservations(
  a: M3_3E_AssessmentGradeObservationV1,
  b: M3_3E_AssessmentGradeObservationV1,
): number {
  const anchorCmp = compareUtf16CodeUnitLexicographic(a.anchorAt, b.anchorAt);
  if (anchorCmp !== 0) {
    return anchorCmp;
  }
  return compareUtf16CodeUnitLexicographic(a.restSessionId, b.restSessionId);
}

function getMetricScalarY(
  obs: M3_3E_AssessmentGradeObservationV1,
  metric: M3_3E_HEALTH_PRIMARY_METRIC_V1,
): number | null {
  const f = obs.features;
  switch (metric) {
    case 'MEDIAN_REST_VOLTAGE':
      return f.medianRestVoltageMv;
    case 'ROBUST_REST_SLOPE':
      return f.robustRestSlopeMvPerHour;
    case 'SHUTDOWN_TO_FIRST_REST_DELTA':
      return f.shutdownToFirstRestDeltaMv;
    default:
      return null;
  }
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

type SeriesPoint = {
  obs: M3_3E_AssessmentGradeObservationV1;
  y: number;
  xMs: number;
};

function buildSeriesPoints(
  observations: M3_3E_AssessmentGradeObservationV1[],
  metric: M3_3E_HEALTH_PRIMARY_METRIC_V1,
): SeriesPoint[] | Reject {
  const points: SeriesPoint[] = [];
  for (const obs of observations) {
    const yRaw = getMetricScalarY(obs, metric);
    if (yRaw === null) {
      continue;
    }
    if (!Number.isFinite(yRaw)) {
      return overflowReject();
    }
    if (metric === 'SHUTDOWN_TO_FIRST_REST_DELTA' && obs.anchorResolutionStatus !== 'SELECTED') {
      return reject('M3_3E_EVALUATION_SHUTDOWN_DELTA_ANCHOR_INCONSISTENT');
    }
    points.push({ obs, y: yRaw, xMs: 0 });
  }
  if (points.length === 0) {
    return points;
  }
  const t0 = Date.parse(points[0].obs.anchorAt);
  for (let i = 0; i < points.length; i++) {
    const parsed = Date.parse(points[i].obs.anchorAt);
    points[i] = {
      ...points[i],
      xMs: parsed - t0,
    };
    if (i > 0) {
      const prevParsed = Date.parse(points[i - 1].obs.anchorAt);
      if (parsed < prevParsed) {
        return reject('M3_3E_EVALUATION_NON_ASCENDING_OBSERVATIONS');
      }
      if (
        parsed === prevParsed &&
        compareUtf16CodeUnitLexicographic(
          points[i].obs.restSessionId,
          points[i - 1].obs.restSessionId,
        ) < 0
      ) {
        return reject('M3_3E_EVALUATION_NON_ASCENDING_OBSERVATIONS');
      }
    }
  }
  for (let i = 1; i < points.length; i++) {
    if (points[i].xMs < points[i - 1].xMs) {
      return reject('M3_3E_EVALUATION_NON_ASCENDING_OBSERVATIONS');
    }
  }
  return points;
}

function distinctAnchorCount(points: SeriesPoint[]): number {
  const set = new Set(points.map((p) => p.obs.anchorAt));
  return set.size;
}

function quantizeSeriesMedian(
  metric: M3_3E_HEALTH_PRIMARY_METRIC_V1,
  points: SeriesPoint[],
): number | null | Reject {
  if (points.length === 0) {
    return null;
  }
  if (metric === 'ROBUST_REST_SLOPE') {
    const micro: number[] = [];
    for (const p of points) {
      if (!Number.isFinite(p.y)) {
        return overflowReject();
      }
      const v = canonicalizeNegativeZero(Math.round(p.y * 1_000_000));
      if (!Number.isSafeInteger(v)) {
        return overflowReject();
      }
      micro.push(v);
    }
    return medianInteger(micro);
  }
  const microV: number[] = [];
  for (const p of points) {
    if (!Number.isInteger(p.y)) {
      return overflowReject();
    }
    const v = p.y * 1000;
    if (!Number.isSafeInteger(v)) {
      return overflowReject();
    }
    microV.push(v);
  }
  return medianInteger(microV);
}

function computeTheilSenSlopePerDay(
  metric: M3_3E_HEALTH_PRIMARY_METRIC_V1,
  points: SeriesPoint[],
): number | null | Reject {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const xi = points[i].xMs;
      const xj = points[j].xMs;
      if (xj === xi) {
        continue;
      }
      if (xj < xi) {
        return reject('M3_3E_EVALUATION_NON_ASCENDING_OBSERVATIONS');
      }
      const yi = points[i].y;
      const yj = points[j].y;
      const s = ((yj - yi) * M3_3E_HEALTH_EVALUATION_DAY_MS) / (xj - xi);
      if (!Number.isFinite(s)) {
        return overflowReject();
      }
      slopes.push(s);
    }
  }
  if (slopes.length === 0) {
    return null;
  }
  const med = medianPhysicalSlopes(slopes);
  if (med === null) {
    return null;
  }
  if (metric === 'ROBUST_REST_SLOPE') {
    return storeSafeInteger(med, med * 1_000_000);
  }
  return storeSafeInteger(med, med * 1000);
}

function computeKendallCounts(points: SeriesPoint[]): M3_3E_KendallPairCountsV1 {
  let increasing = 0;
  let decreasing = 0;
  let tied = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (points[j].xMs <= points[i].xMs) {
        continue;
      }
      const dy = points[j].y - points[i].y;
      if (dy > 0) {
        increasing += 1;
      } else if (dy < 0) {
        decreasing += 1;
      } else {
        tied += 1;
      }
    }
  }
  return { increasing, decreasing, tied };
}

function dequantizeSlopePerDay(
  metric: M3_3E_HEALTH_PRIMARY_METRIC_V1,
  slopeQuantized: number,
): number {
  if (metric === 'ROBUST_REST_SLOPE') {
    return slopeQuantized / 1_000_000;
  }
  return slopeQuantized / 1000;
}

function computeResidualMad(
  metric: M3_3E_HEALTH_PRIMARY_METRIC_V1,
  points: SeriesPoint[],
  slopeQuantized: number,
): number | null | Reject {
  const s = dequantizeSlopePerDay(metric, slopeQuantized);
  const z: number[] = [];
  for (const p of points) {
    const zi = p.y - s * (p.xMs / M3_3E_HEALTH_EVALUATION_DAY_MS);
    if (!Number.isFinite(zi)) {
      return overflowReject();
    }
    z.push(zi);
  }
  const intercept = medianPhysicalNumbers(z);
  if (intercept === null) {
    return null;
  }
  const residuals = z.map((zi) => zi - intercept);
  const medR = medianPhysicalNumbers(residuals);
  if (medR === null) {
    return null;
  }
  const absDev = residuals.map((r) => Math.abs(r - medR));
  const mad = medianPhysicalNumbers(absDev);
  if (mad === null) {
    return null;
  }
  if (metric === 'ROBUST_REST_SLOPE') {
    return storeSafeInteger(mad, mad * 1_000_000);
  }
  return storeSafeInteger(mad, mad * 1000);
}

function computeStepMagnitude(
  metric: M3_3E_HEALTH_PRIMARY_METRIC_V1,
  points: SeriesPoint[],
): number | null | Reject {
  let bestMag: number | null = null;
  let bestSplit = -1;
  for (let k = 1; k < points.length; k++) {
    const left = points.slice(0, k);
    const right = points.slice(k);
    if (left.length < 2 || right.length < 2) {
      continue;
    }
    const leftMed = medianPhysicalNumbers(left.map((p) => p.y));
    const rightMed = medianPhysicalNumbers(right.map((p) => p.y));
    if (leftMed === null || rightMed === null) {
      continue;
    }
    const mag = Math.abs(rightMed - leftMed);
    if (!Number.isFinite(mag)) {
      return overflowReject();
    }
    if (bestMag === null || mag > bestMag || (mag === bestMag && k < bestSplit)) {
      bestMag = mag;
      bestSplit = k;
    }
  }
  if (bestMag === null) {
    return null;
  }
  if (metric === 'ROBUST_REST_SLOPE') {
    return storeSafeInteger(bestMag, bestMag * 1_000_000);
  }
  return storeSafeInteger(bestMag, bestMag * 1000);
}

function metricStepEvaluable(points: SeriesPoint[]): boolean {
  if (points.length < 4) {
    return false;
  }
  for (let k = 1; k < points.length; k++) {
    if (k >= 2 && points.length - k >= 2) {
      return true;
    }
  }
  return false;
}

function buildContextDescriptors(
  observations: M3_3E_AssessmentGradeObservationV1[],
): M3_3E_HealthMetricContextDescriptorsV1 {
  let tripExterior = 0;
  let unknownTemp = 0;
  const knownTemps: number[] = [];
  const chargeCounts: Record<string, number> = {};
  const restDepths: number[] = [];
  const firstAges: number[] = [];

  for (const obs of observations) {
    if (obs.temperatureSource === 'TRIP_EXTERIOR' && obs.temperatureC !== null) {
      tripExterior += 1;
      knownTemps.push(obs.temperatureC);
    } else {
      unknownTemp += 1;
    }
    const cc = obs.chargeOpportunityClass ?? 'UNKNOWN';
    chargeCounts[cc] = (chargeCounts[cc] ?? 0) + 1;
    if (obs.features.maxActualRestAgeMs !== null) {
      restDepths.push(obs.features.maxActualRestAgeMs);
    }
    const maxAge = obs.features.maxActualRestAgeMs;
    const span = obs.features.observationSpanMs;
    if (maxAge !== null && span !== null) {
      firstAges.push(maxAge - span);
    }
  }

  knownTemps.sort((a, b) => a - b);
  restDepths.sort((a, b) => a - b);
  firstAges.sort((a, b) => a - b);

  return {
    temperature: {
      tripExteriorCount: tripExterior,
      unknownCount: unknownTemp,
      knownMinC: knownTemps.length ? knownTemps[0] : null,
      knownMedianC: medianPhysicalNumbers(knownTemps),
      knownMaxC: knownTemps.length ? knownTemps[knownTemps.length - 1] : null,
    },
    chargeClassCounts: chargeCounts,
    restDepthRangeMs: {
      min: restDepths.length ? restDepths[0] : null,
      max: restDepths.length ? restDepths[restDepths.length - 1] : null,
    },
    firstPointAgeRangeMs: {
      min: firstAges.length ? firstAges[0] : null,
      max: firstAges.length ? firstAges[firstAges.length - 1] : null,
    },
  };
}

function buildOutliers(
  observations: M3_3E_AssessmentGradeObservationV1[],
): Array<{ restSessionId: string; outlierClass: M3_3E_HealthOutlierClass }> {
  const rows: Array<{ restSessionId: string; outlierClass: M3_3E_HealthOutlierClass }> = [];
  for (const obs of observations) {
    let cls: M3_3E_HealthOutlierClass = 'REPRESENTATIVE';
    if (
      obs.anchorResolutionStatus !== 'SELECTED' ||
      obs.features.numberOfValidRestPoints === 1
    ) {
      cls = 'CONTEXTUAL_EXTREME';
    }
    rows.push({ restSessionId: obs.restSessionId, outlierClass: cls });
  }
  rows.sort((a, b) => compareUtf16CodeUnitLexicographic(a.restSessionId, b.restSessionId));
  return rows;
}

function resolveTrendState(
  trendEvaluable: boolean,
  calibrationProfileId: string,
): M3_3E_HealthTrendState {
  if (!trendEvaluable) {
    return 'NOT_EVALUABLE_INSUFFICIENT_STRUCTURAL';
  }
  if (calibrationProfileId === M3_3E_CALIBRATION_UNSET_V1) {
    return 'NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED';
  }
  return 'NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED';
}

function resolveSufficiency(
  levelEvaluable: boolean,
  trendEvaluable: boolean,
): M3_3E_HealthSufficiencyState {
  if (!levelEvaluable) {
    return 'INSUFFICIENT_STRUCTURAL';
  }
  return 'UNDETERMINED_CALIBRATION_REQUIRED';
}

function resolveComparability(
  _metric: M3_3E_HEALTH_PRIMARY_METRIC_V1,
  _metricSeriesObservations: M3_3E_AssessmentGradeObservationV1[],
  calibrationProfileId: string,
): M3_3E_HealthComparabilityState {
  if (calibrationProfileId === M3_3E_CALIBRATION_UNSET_V1) {
    return 'SAME_SEGMENT_CONTEXT_LIMITED';
  }
  const hasUnknownCharge = _metricSeriesObservations.some(
    (o) => o.chargeOpportunityClass === 'UNKNOWN',
  );
  if (hasUnknownCharge) {
    return 'SAME_SEGMENT_CONTEXT_LIMITED';
  }
  return 'SAME_SEGMENT_COMPARABLE';
}

function segmentHasUnresolvedDeltaAnchor(
  observations: M3_3E_AssessmentGradeObservationV1[],
): boolean {
  return observations.some(
    (o) =>
      o.anchorResolutionStatus !== 'SELECTED' &&
      o.features.shutdownToFirstRestDeltaMv === null,
  );
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validateObservationNumerics(
  obs: M3_3E_AssessmentGradeObservationV1,
): Reject | null {
  if (obs.chargeOpportunityClass !== obs.features.chargeOpportunityClass) {
    return reject('M3_3E_EVALUATION_CHARGE_CLASS_MIRROR_MISMATCH');
  }
  const f = obs.features;
  if (!Number.isSafeInteger(f.numberOfValidRestPoints) || f.numberOfValidRestPoints < 0) {
    return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
  }
  const maxAgeNull = f.maxActualRestAgeMs === null;
  const spanNull = f.observationSpanMs === null;
  if (maxAgeNull !== spanNull) {
    return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
  }
  if (f.numberOfValidRestPoints === 0) {
    if (
      f.medianRestVoltageMv !== null ||
      f.minimumRestVoltageMv !== null ||
      f.maximumRestVoltageMv !== null ||
      f.maxActualRestAgeMs !== null ||
      f.observationSpanMs !== null
    ) {
      return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
    }
  } else {
    if (
      f.medianRestVoltageMv === null ||
      f.minimumRestVoltageMv === null ||
      f.maximumRestVoltageMv === null ||
      f.maxActualRestAgeMs === null ||
      f.observationSpanMs === null
    ) {
      return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
    }
  }
  for (const key of [
    'medianRestVoltageMv',
    'minimumRestVoltageMv',
    'maximumRestVoltageMv',
    'shutdownToFirstRestDeltaMv',
  ] as const) {
    const v = f[key];
    if (v !== null && !Number.isSafeInteger(v)) {
      return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
    }
  }
  if (f.robustRestSlopeMvPerHour !== null && !Number.isFinite(f.robustRestSlopeMvPerHour)) {
    return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
  }
  if (f.restVoltageVarianceMv2 !== null && !Number.isFinite(f.restVoltageVarianceMv2)) {
    return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
  }
  if (f.maxActualRestAgeMs !== null && !isSafeNonNegativeInteger(f.maxActualRestAgeMs)) {
    return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
  }
  if (f.maxInterObservationGapMs !== null && !isSafeNonNegativeInteger(f.maxInterObservationGapMs)) {
    return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
  }
  if (f.observationSpanMs !== null && !isSafeNonNegativeInteger(f.observationSpanMs)) {
    return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
  }
  if (f.missingRungCount !== null && !isSafeNonNegativeInteger(f.missingRungCount)) {
    return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
  }
  if (obs.temperatureC !== null && !Number.isFinite(obs.temperatureC)) {
    return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
  }
  if (f.maxActualRestAgeMs !== null && f.observationSpanMs !== null) {
    const firstAge = f.maxActualRestAgeMs - f.observationSpanMs;
    if (!Number.isSafeInteger(firstAge) || firstAge < 0) {
      return reject('M3_3E_EVALUATION_MALFORMED_FEATURE_NUMERIC');
    }
  }
  return null;
}

function validateCoverageAccounting(input: M3_3E_LongitudinalAssessmentInputV1): Reject | null {
  const c = input.coverage;
  for (const n of [
    c.d3DefaultObservationCount,
    c.assessmentGradeObservationCount,
    c.quarantinedIntegrityWarningCount,
    c.sourceEvidenceLimitedCount,
    c.provisionalContextCount,
    c.excludedContextCount,
  ]) {
    if (!isSafeNonNegativeInteger(n)) {
      return reject('M3_3E_EVALUATION_MALFORMED_COVERAGE');
    }
  }
  if (c.assessmentGradeObservationCount !== input.assessmentGradeObservations.length) {
    return reject('M3_3E_EVALUATION_MALFORMED_COVERAGE');
  }
  if (
    c.d3DefaultObservationCount !==
    c.assessmentGradeObservationCount +
      c.quarantinedIntegrityWarningCount +
      c.sourceEvidenceLimitedCount
  ) {
    return reject('M3_3E_EVALUATION_MALFORMED_COVERAGE');
  }
  return null;
}

function validateEvidenceWindow(input: M3_3E_LongitudinalAssessmentInputV1): Reject | null {
  const w = input.evidenceWindow;
  const n = input.assessmentGradeObservations.length;
  if (n === 0) {
    if (
      w.firstEligibleAnchorAt !== null ||
      w.lastEligibleAnchorAt !== null ||
      w.eligibleEvidenceSpanMs !== null
    ) {
      return reject('M3_3E_EVALUATION_EVIDENCE_WINDOW_INCONSISTENT');
    }
    return null;
  }
  const sorted = [...input.assessmentGradeObservations].sort(compareObservations);
  const first = sorted[0].anchorAt;
  const last = sorted[sorted.length - 1].anchorAt;
  if (w.firstEligibleAnchorAt !== first || w.lastEligibleAnchorAt !== last) {
    return reject('M3_3E_EVALUATION_EVIDENCE_WINDOW_INCONSISTENT');
  }
  const expectedSpan = n === 1 ? 0 : Date.parse(last) - Date.parse(first);
  if (!Number.isFinite(expectedSpan) || expectedSpan < 0 || !Number.isSafeInteger(expectedSpan)) {
    return reject('M3_3E_EVALUATION_EVIDENCE_WINDOW_INCONSISTENT');
  }
  if (w.eligibleEvidenceSpanMs !== expectedSpan) {
    return reject('M3_3E_EVALUATION_EVIDENCE_WINDOW_INCONSISTENT');
  }
  return null;
}

function validateInput(
  input: M3_3E_LongitudinalAssessmentInputV1,
  profile: M3_3E_CalibrationProfileV1,
): Reject | null {
  if (input.contractVersion !== M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION) {
    return reject('M3_3E_EVALUATION_UNSUPPORTED_INPUT_CONTRACT_VERSION');
  }
  if (profile.calibrationProfileId !== M3_3E_CALIBRATION_UNSET_V1) {
    return reject('M3_3E_EVALUATION_UNSUPPORTED_CALIBRATION_PROFILE');
  }
  const id = input.identity;
  if (
    !isNonEmptyString(id.organizationId) ||
    !isNonEmptyString(id.vehicleId) ||
    !isNonEmptyString(id.revisionId) ||
    !LONGITUDINAL_PROFILE_FINGERPRINT_HEX_PATTERN.test(id.canonicalProfileFingerprint)
  ) {
    return reject('M3_3E_EVALUATION_IDENTITY_INVALID');
  }
  if (
    !isNonEmptyString(input.consumptionInputFingerprint) ||
    !LONGITUDINAL_PROFILE_FINGERPRINT_HEX_PATTERN.test(input.consumptionInputFingerprint)
  ) {
    return reject('M3_3E_EVALUATION_CONSUMPTION_FINGERPRINT_MISMATCH');
  }

  const obsCount = input.assessmentGradeObservations.length;
  const hasObs = obsCount > 0;
  if (hasObs && input.modelEvaluation.inputAvailability !== 'ASSESSMENT_GRADE_INPUT_AVAILABLE') {
    return reject('M3_3E_EVALUATION_MODEL_INPUT_AVAILABILITY_MISMATCH');
  }
  if (!hasObs && input.modelEvaluation.inputAvailability !== 'NO_ASSESSMENT_GRADE_INPUT') {
    return reject('M3_3E_EVALUATION_MODEL_INPUT_AVAILABILITY_MISMATCH');
  }
  if (input.modelEvaluation.modelSufficiency !== 'NOT_EVALUATED') {
    return reject('M3_3E_EVALUATION_MODEL_SUFFICIENCY_MISMATCH');
  }
  const coverageErr = validateCoverageAccounting(input);
  if (coverageErr) {
    return coverageErr;
  }

  const seenSession = new Set<string>();
  for (const obs of input.assessmentGradeObservations) {
    if (seenSession.has(obs.restSessionId)) {
      return reject('M3_3E_EVALUATION_DUPLICATE_REST_SESSION_ID');
    }
    seenSession.add(obs.restSessionId);
    if (!isCanonicalUtcIsoTimestamp(obs.anchorAt)) {
      return reject('M3_3E_EVALUATION_MALFORMED_ANCHOR_AT');
    }
    const numericErr = validateObservationNumerics(obs);
    if (numericErr) {
      return numericErr;
    }
    if (
      obs.features.shutdownToFirstRestDeltaMv !== null &&
      obs.anchorResolutionStatus !== 'SELECTED'
    ) {
      return reject('M3_3E_EVALUATION_SHUTDOWN_DELTA_ANCHOR_INCONSISTENT');
    }
  }

  for (let i = 1; i < input.assessmentGradeObservations.length; i++) {
    if (compareObservations(input.assessmentGradeObservations[i - 1], input.assessmentGradeObservations[i]) > 0) {
      return reject('M3_3E_EVALUATION_NON_ASCENDING_OBSERVATIONS');
    }
  }

  const recomputed = computeM3_3E_ConsumptionInputFingerprintV1({
    organizationId: id.organizationId,
    vehicleId: id.vehicleId,
    canonicalProfileFingerprint: id.canonicalProfileFingerprint,
    longitudinalProfileContractVersion: id.longitudinalProfileContractVersion,
    profilePolicyVersion: id.profilePolicyVersion,
    integrityInspectionContractVersion: id.integrityInspectionContractVersion,
    assessmentGradeObservations: input.assessmentGradeObservations,
  });
  if (recomputed !== input.consumptionInputFingerprint) {
    return reject('M3_3E_EVALUATION_CONSUMPTION_FINGERPRINT_MISMATCH');
  }

  const segmentBySession = new Map<string, number>();
  let prevSegmentIndex = -1;
  for (const seg of input.eligibleVersionSegments) {
    if (!isSafeNonNegativeInteger(seg.sourceSegmentIndex)) {
      return reject('M3_3E_EVALUATION_MALFORMED_SEGMENT_STRUCTURE');
    }
    if (seg.sourceSegmentIndex <= prevSegmentIndex) {
      return reject('M3_3E_EVALUATION_MALFORMED_SEGMENT_STRUCTURE');
    }
    prevSegmentIndex = seg.sourceSegmentIndex;
    if (!Number.isSafeInteger(seg.observationCount) || seg.observationCount <= 0) {
      return reject('M3_3E_EVALUATION_MALFORMED_SEGMENT_STRUCTURE');
    }
    if (seg.restSessionIds.length !== seg.observationCount) {
      return reject('M3_3E_EVALUATION_MALFORMED_SEGMENT_STRUCTURE');
    }
    const seenInSegment = new Set<string>();
    for (const sid of seg.restSessionIds) {
      if (seenInSegment.has(sid)) {
        return reject('M3_3E_EVALUATION_MALFORMED_SEGMENT_STRUCTURE');
      }
      seenInSegment.add(sid);
    }
    const segObs = input.assessmentGradeObservations.filter((o) =>
      seg.restSessionIds.includes(o.restSessionId),
    );
    if (segObs.length !== seg.observationCount) {
      return reject('M3_3E_EVALUATION_SEGMENT_METADATA_INCONSISTENT');
    }
    const sorted = [...segObs].sort(compareObservations);
    if (sorted[0].anchorAt !== seg.firstAnchorAt || sorted[sorted.length - 1].anchorAt !== seg.lastAnchorAt) {
      return reject('M3_3E_EVALUATION_SEGMENT_METADATA_INCONSISTENT');
    }
    const ids = sorted.map((o) => o.restSessionId);
    if (ids.some((id, idx) => id !== seg.restSessionIds[idx])) {
      return reject('M3_3E_EVALUATION_SEGMENT_METADATA_INCONSISTENT');
    }
    for (const obs of segObs) {
      if (
        seg.versionTuple.featureModelVersion !== obs.versionTuple.featureModelVersion ||
        seg.versionTuple.retentionPolicyVersion !== obs.versionTuple.retentionPolicyVersion ||
        seg.versionTuple.chargeOpportunityPolicyVersion !==
          obs.versionTuple.chargeOpportunityPolicyVersion ||
        seg.versionTuple.inputContractVersion !== obs.versionTuple.inputContractVersion
      ) {
        return reject('M3_3E_EVALUATION_SEGMENT_METADATA_INCONSISTENT');
      }
    }
    for (const sid of seg.restSessionIds) {
      if (segmentBySession.has(sid)) {
        return reject('M3_3E_EVALUATION_OBSERVATION_SEGMENT_MISMATCH');
      }
      segmentBySession.set(sid, seg.sourceSegmentIndex);
    }
  }

  for (const obs of input.assessmentGradeObservations) {
    if (!segmentBySession.has(obs.restSessionId)) {
      return reject('M3_3E_EVALUATION_OBSERVATION_SEGMENT_MISMATCH');
    }
  }

  const evidenceErr = validateEvidenceWindow(input);
  if (evidenceErr) {
    return evidenceErr;
  }

  return null;
}

function isSegmentStructurallyEvaluable(
  observations: M3_3E_AssessmentGradeObservationV1[],
): boolean {
  for (const metric of M3_3E_HEALTH_PRIMARY_METRICS_V1) {
    const yCount = observations.filter((o) => getMetricScalarY(o, metric) !== null).length;
    if (yCount >= 1) {
      return true;
    }
  }
  return false;
}

function computeMetricEvaluation(input: {
  metric: M3_3E_HEALTH_PRIMARY_METRIC_V1;
  segmentObservations: M3_3E_AssessmentGradeObservationV1[];
  calibrationProfileId: string;
  multiSegmentPooling: boolean;
  coverageReasons: M3_3E_HEALTH_EVALUATION_REASON_CODE_V1[];
  digestScope: M3_3E_LongitudinalAssessmentInputV1['coverage']['d4DigestVerificationScope'];
}): M3_3E_HealthMetricEvaluationV1 | Reject {
  const seriesResult = buildSeriesPoints(input.segmentObservations, input.metric);
  if ('kind' in seriesResult) {
    return seriesResult;
  }
  const points = seriesResult;
  const metricSeriesObservations = points.map((p) => p.obs);
  const levelEvaluable = points.length >= 1;
  const distinctAnchors = distinctAnchorCount(points);
  const trendEvaluable = distinctAnchors >= 2;
  const dispersionEvaluable = distinctAnchors >= 3;
  const stepEvaluable = metricStepEvaluable(points);

  const stats: M3_3E_HealthMetricStatisticsV1 = {
    seriesCount: points.length,
    distinctAnchorCount: distinctAnchors,
    seriesSpanMs: points.length ? points[points.length - 1].xMs : 0,
    seriesMedianQuantized: null,
    theilSenSlopePerDayQuantized: null,
    kendallPairCounts: null,
    residualMadQuantized: null,
    stepChangeMagnitudeQuantized: null,
  };

  if (levelEvaluable) {
    const med = quantizeSeriesMedian(input.metric, points);
    if (med !== null && typeof med === 'object' && 'kind' in med) {
      return med;
    }
    stats.seriesMedianQuantized = med as number | null;
  }

  if (trendEvaluable) {
    const slope = computeTheilSenSlopePerDay(input.metric, points);
    if (slope !== null && typeof slope === 'object' && 'kind' in slope) {
      return slope;
    }
    stats.theilSenSlopePerDayQuantized = slope as number | null;
    stats.kendallPairCounts = computeKendallCounts(points);
    if (dispersionEvaluable && stats.theilSenSlopePerDayQuantized !== null) {
      const mad = computeResidualMad(input.metric, points, stats.theilSenSlopePerDayQuantized);
      if (mad !== null && typeof mad === 'object' && 'kind' in mad) {
        return mad;
      }
      stats.residualMadQuantized = mad as number | null;
    }
  }

  if (stepEvaluable) {
    const step = computeStepMagnitude(input.metric, points);
    if (step !== null && typeof step === 'object' && 'kind' in step) {
      return step;
    }
    stats.stepChangeMagnitudeQuantized = step as number | null;
  }

  const reasonCodes: M3_3E_HEALTH_EVALUATION_REASON_CODE_V1[] = [...input.coverageReasons];
  reasonCodes.push('TEMPERATURE_CONTEXT_ONLY');
  if (
    metricSeriesObservations.some(
      (o) => o.temperatureSource !== 'TRIP_EXTERIOR' || o.temperatureC === null,
    )
  ) {
    reasonCodes.push('TEMPERATURE_UNKNOWN_PRESENT');
  }
  const ctx = buildContextDescriptors(metricSeriesObservations);
  if (ctx.temperature.knownMinC !== null && ctx.temperature.knownMaxC !== null) {
    reasonCodes.push('TEMPERATURE_RANGE_UNCONTROLLED');
  }
  reasonCodes.push('CHARGE_CLASSIFIER_NOT_PRODUCTION_CALIBRATED');
  if (metricSeriesObservations.some((o) => o.chargeOpportunityClass === 'UNKNOWN')) {
    reasonCodes.push('CHARGE_CONTEXT_UNCONTROLLED');
  }
  reasonCodes.push('REST_DEPTH_UNCONTROLLED');
  if (input.metric === 'ROBUST_REST_SLOPE' || input.metric === 'SHUTDOWN_TO_FIRST_REST_DELTA') {
    reasonCodes.push('FIRST_POINT_AGE_UNCONTROLLED');
  }
  if (
    input.metric === 'SHUTDOWN_TO_FIRST_REST_DELTA' &&
    segmentHasUnresolvedDeltaAnchor(input.segmentObservations)
  ) {
    reasonCodes.push('ANCHOR_UNRESOLVED_FOR_DELTA_METRIC');
  }
  if (!levelEvaluable) {
    reasonCodes.push('INSUFFICIENT_DISTINCT_ANCHORS');
  }
  if (trendEvaluable && !dispersionEvaluable) {
    reasonCodes.push('INSUFFICIENT_POINTS_FOR_DISPERSION');
  }
  if (trendEvaluable && !stepEvaluable) {
    reasonCodes.push('INSUFFICIENT_POINTS_FOR_STEP');
  }
  if (trendEvaluable && input.calibrationProfileId === M3_3E_CALIBRATION_UNSET_V1) {
    reasonCodes.push('CALIBRATION_NOT_ESTABLISHED');
  }
  if (input.multiSegmentPooling) {
    reasonCodes.push('MULTI_SEGMENT_NO_POOLING');
  }
  if (input.digestScope === 'BOUNDED_LATEST_WINDOW') {
    reasonCodes.push('DIGEST_SCOPE_BOUNDED_LATEST_WINDOW');
  }
  if (input.digestScope === 'NOT_EVALUATED') {
    reasonCodes.push('DIGEST_SCOPE_NOT_EVALUATED');
  }

  return {
    metric: input.metric,
    comparability: resolveComparability(
      input.metric,
      metricSeriesObservations,
      input.calibrationProfileId,
    ),
    sufficiency: resolveSufficiency(levelEvaluable, trendEvaluable),
    statistics: stats,
    contextDescriptors: ctx,
    trendState: resolveTrendState(trendEvaluable, input.calibrationProfileId),
    outliers: buildOutliers(metricSeriesObservations),
    confidence: 'NOT_APPLICABLE',
    reasonCodes: sortReasonCodes(reasonCodes),
  };
}

function computeResultFingerprint(
  body: Omit<M3_3E_LongitudinalHealthEvaluationV1, 'resultFingerprint'>,
): string {
  const preimage = {
    contractVersion: body.contractVersion,
    modelPolicyVersion: body.modelPolicyVersion,
    calibrationProfileId: body.calibration.calibrationProfileId,
    calibrationProfileFingerprint: body.calibration.calibrationProfileFingerprint,
    consumptionInputFingerprint: body.inputBinding.consumptionInputFingerprint,
    evaluation: {
      evaluationStatus: body.evaluationStatus,
      noConclusionReasons: body.noConclusionReasons,
      claimLevel: body.claimLevel,
      condition: body.condition,
      segments: body.segments,
      vehicleSummary: body.vehicleSummary,
      inputBinding: body.inputBinding,
      calibration: body.calibration,
    },
  };
  return sha256HexLowercaseUtf8(canonicalFeatureInputUtf8(preimage));
}

export function computeM3_3E_HealthEvaluationResultFingerprintV1(
  body: Omit<M3_3E_LongitudinalHealthEvaluationV1, 'resultFingerprint'>,
): string {
  return computeResultFingerprint(body);
}

export function evaluateM3_3E_LongitudinalHealthEvaluationV1(
  args: M3_3E_EvaluateHealthArgs,
): M3_3E_EvaluateHealthOutcome {
  const profile =
    args.calibrationProfileId === undefined || args.calibrationProfileId === M3_3E_CALIBRATION_UNSET_V1
      ? M3_3E_CALIBRATION_UNSET_PROFILE_V1
      : null;
  if (!profile) {
    return { status: 'REJECTED', reason: 'M3_3E_EVALUATION_UNSUPPORTED_CALIBRATION_PROFILE' };
  }

  const validationError = validateInput(args.input, profile);
  if (validationError) {
    return { status: 'REJECTED', reason: validationError.reason };
  }

  const calibrationProfileFingerprint = computeM3_3E_CalibrationProfileFingerprintV1(profile);
  const coverageReasons: M3_3E_HEALTH_EVALUATION_REASON_CODE_V1[] = [];
  if (
    args.input.coverage.quarantinedIntegrityWarningCount > 0 ||
    args.input.coverage.sourceEvidenceLimitedCount > 0 ||
    args.input.coverage.excludedContextCount > 0
  ) {
    coverageReasons.push('EXCLUDED_NON_ELIGIBLE_SESSIONS_PRESENT');
  }

  const segmentsSorted = [...args.input.eligibleVersionSegments].sort(
    (a, b) => a.sourceSegmentIndex - b.sourceSegmentIndex,
  );

  const structurallyEvaluableCount = segmentsSorted.filter((seg) => {
    const obs = args.input.assessmentGradeObservations.filter((o) =>
      seg.restSessionIds.includes(o.restSessionId),
    );
    return isSegmentStructurallyEvaluable(obs);
  }).length;

  const multiSegment = structurallyEvaluableCount >= 2;

  const segmentEvaluations: M3_3E_HealthSegmentEvaluationV1[] = [];
  for (const seg of segmentsSorted) {
    const segObs = args.input.assessmentGradeObservations
      .filter((o) => seg.restSessionIds.includes(o.restSessionId))
      .sort(compareObservations);
    const metrics: M3_3E_HealthMetricEvaluationV1[] = [];
    for (const metric of M3_3E_HEALTH_PRIMARY_METRICS_V1) {
      const metricEval = computeMetricEvaluation({
        metric,
        segmentObservations: segObs,
        calibrationProfileId: profile.calibrationProfileId,
        multiSegmentPooling: multiSegment,
        coverageReasons,
        digestScope: args.input.coverage.d4DigestVerificationScope,
      });
      if ('kind' in metricEval) {
        return { status: 'REJECTED', reason: metricEval.reason };
      }
      metrics.push(metricEval);
    }
    segmentEvaluations.push({
      sourceSegmentIndex: seg.sourceSegmentIndex,
      versionTuple: { ...seg.versionTuple },
      metrics,
    });
  }

  let evaluationStatus: M3_3E_LongitudinalHealthEvaluationV1['evaluationStatus'];
  let vehicleSummary: M3_3E_LongitudinalHealthEvaluationV1['vehicleSummary'];
  let noConclusionReasons: M3_3E_HEALTH_EVALUATION_REASON_CODE_V1[] = [];

  if (args.input.assessmentGradeObservations.length === 0) {
    evaluationStatus = 'NO_CONCLUSION';
    vehicleSummary = 'NO_EVALUABLE_SEGMENT';
    noConclusionReasons = sortReasonCodes(['NO_ASSESSMENT_GRADE_OBSERVATIONS']);
  } else if (structurallyEvaluableCount === 0) {
    evaluationStatus = 'NO_CONCLUSION';
    vehicleSummary = 'NO_EVALUABLE_SEGMENT';
    noConclusionReasons = [];
  } else if (structurallyEvaluableCount === 1) {
    evaluationStatus = 'EVALUATED_DESCRIPTIVE_ONLY';
    vehicleSummary = 'SINGLE_EVALUABLE_SEGMENT';
  } else {
    evaluationStatus = 'EVALUATED_DESCRIPTIVE_ONLY';
    vehicleSummary = 'SEGMENTED_NO_POOLED_CONCLUSION';
  }

  const bodyWithoutFingerprint: Omit<M3_3E_LongitudinalHealthEvaluationV1, 'resultFingerprint'> = {
    contractVersion: M3_3E_HEALTH_EVALUATION_CONTRACT_VERSION,
    modelPolicyVersion: M3_3E_E2_MODEL_POLICY_VERSION,
    calibration: {
      calibrationProfileId: profile.calibrationProfileId,
      calibrationMaturity: profile.calibrationMaturity,
      calibrationProfileFingerprint,
    },
    inputBinding: {
      inputContractVersion: args.input.contractVersion,
      consumptionInputFingerprint: args.input.consumptionInputFingerprint,
      organizationId: args.input.identity.organizationId,
      vehicleId: args.input.identity.vehicleId,
      revisionIdentity: {
        revisionId: args.input.identity.revisionId,
        canonicalProfileFingerprint: args.input.identity.canonicalProfileFingerprint,
        longitudinalProfileContractVersion: args.input.identity.longitudinalProfileContractVersion,
        profilePolicyVersion: args.input.identity.profilePolicyVersion,
        integrityInspectionContractVersion: args.input.identity.integrityInspectionContractVersion,
      },
    },
    evaluationStatus,
    noConclusionReasons,
    claimLevel: 'NONE',
    condition: 'NOT_ASSESSED',
    segments: segmentEvaluations,
    vehicleSummary,
  };

  const resultFingerprint = computeResultFingerprint(bodyWithoutFingerprint);

  return {
    status: 'OK',
    evaluation: {
      ...bodyWithoutFingerprint,
      resultFingerprint,
    },
  };
}
