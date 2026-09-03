/**
 * DI-EV-0034E / DI-EV-0034E.1 — RD003 Signal Quality Interpretation + Usability Matrix.
 * Read-only analysis; does not modify production Driving Score, external GT, or canonical telemetry.
 */
import * as crypto from 'crypto';
import {
  analyzeSignalGroup,
  computeProviderCadence,
  extractNumericValue,
  percentile,
  uniqueProviderTimestamps,
  type SignalMetricsObsRow,
} from './reference-capture-signal-metrics';
import type { VideoGtExportedRow } from './reference-capture-rd003-video-gt-export';
import {
  ACQUISITION_SURFACES,
  absoluteEventMsFromAlignedClipStart,
  computeProviderDeliveryMetrics,
  deriveTelemetryAtUtc,
  detectStaleHolds,
  filterTelemetryByFieldAndSurface,
  buildSpeedSeries,
  isAlignmentEligibleGroundTruth,
  MIN_ALIGNMENT_ELIGIBLE_GT_POINTS,
  SESSION_START,
  SESSION_STOP,
  stableStringify,
  SURFACE_INTERPOLATION_GAP_SECONDS,
  type AcquisitionSurface,
  type ExternalGtClip,
  type ExternalGtDocument,
  type ExternalGtObservation,
  type SpeedSeriesPoint,
} from './reference-capture-rd003-video-gt-alignment';
import {
  coarseToFineGlobalSearchV2,
  dedupePhysicalSamples,
  runGlobalFingerprintDiscoveryV2,
  type BasinV2Result,
  type ClipDiscoveryV2Result,
} from './reference-capture-rd003-video-gt-global-discovery-v2';

export const SIGNAL_QUALITY_EVIDENCE_ID = 'DI-EV-0034E';
export const SIGNAL_QUALITY_CLOSEOUT_REVISION = 'DI-EV-0034E.1';
export const SIGNAL_QUALITY_MODE = 'RD003_SIGNAL_QUALITY_INTERPRETATION';

export const DIAGNOSTIC_LAG_SECONDS = [0, 1, 2, 3, 4] as const;
export const IMPLAUSIBLE_ABS_ACCELERATION_MPS2 = 8.0;

export const CORE_AUDIT_SIGNALS = [
  'speed',
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
  'powertrainCombustionEngineTPS',
  'obdEngineLoad',
  'powertrainTransmissionActualGear',
  'powertrainTransmissionActualGearRatio',
] as const;

export const DERIVED_SIGNALS = ['longitudinalAccelerationFromSpeed', 'jerkFromAcceleration'] as const;

export const PROVISIONAL_ACCELERATION_MAX_GAP_POLICIES_SECONDS = [1.5, 2.0, 3.0, 5.0] as const;

export const USE_CASE_IDS = [
  'trip_level_driving_analysis',
  'acceleration_episode_detection',
  'braking_episode_detection',
  'stop_launch_detection',
  'stable_cruise_recognition',
  'shift_detection',
  'direction_detection',
  'instantaneous_harsh_event_timing',
  'longitudinal_acceleration_reconstruction',
  'jerk_reconstruction',
  'powertrain_stress_estimation',
  'near_realtime_feedback',
  'post_trip_scoring',
] as const;

export type EligibilityRating = 'A' | 'B' | 'C' | 'D';
export type SignalUsabilityClass =
  | 'STRONG'
  | 'USEFUL_WITH_GATING'
  | 'CONTEXT_ONLY'
  | 'WEAK'
  | 'NOT_RELIABLE';

export type SignalRatingEvidence = {
  RATING: SignalUsabilityClass | string;
  EVIDENCE_BASIS: string;
  LIMITATION: string;
};

export type NegativeControlDynamics = 'LOW' | 'MODERATE' | 'ELEVATED' | 'INSUFFICIENT_EVIDENCE';

export type AuthorityClass =
  | 'PRIMARY_KINEMATIC_AUTHORITY'
  | 'SECONDARY_DYNAMIC_CONFIRMATION'
  | 'POWERTRAIN_CONTEXT'
  | 'STATE_CONTEXT'
  | 'DELIVERY_ONLY'
  | 'UNSUITABLE';

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function toMetricsRow(row: VideoGtExportedRow): SignalMetricsObsRow {
  return {
    observationKind: 'SIGNAL_POINT',
    providerField: row.providerField,
    acquisitionSurface: row.acquisitionSurface,
    providerTimestamp: row.providerTimestamp,
    synqReceivedAt: row.synqReceivedAt,
    requestStartedAt: row.requestStartedAt,
    requestCompletedAt: row.requestCompletedAt,
    sequenceNumber: row.sequenceNumber,
    physicalSampleFingerprint: row.physicalSampleFingerprint,
    rawValueJson: row.rawValueJson,
    createdAt: row.createdAt,
  };
}

function pct(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, p);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function rmse(errors: number[]): number | null {
  if (errors.length === 0) return null;
  return Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const vx = xs[i]! - mx;
    const vy = ys[i]! - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function buildStaleHoldKey(row: VideoGtExportedRow): string {
  return [
    row.providerField,
    row.acquisitionSurface,
    row.physicalSampleFingerprint ?? '',
    row.providerTimestamp ?? '',
  ].join('|');
}

/** Rows that are duplicate re-acquisitions of the same physical identity (stale holds). */
export function identifyStaleHoldDuplicateRows(rows: VideoGtExportedRow[]): Set<number> {
  const duplicateAcquisitionOrdinals = new Set<number>();
  const groups = new Map<string, VideoGtExportedRow[]>();
  for (const row of rows) {
    const key = buildStaleHoldKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => (parseMs(a.synqReceivedAt) ?? 0) - (parseMs(b.synqReceivedAt) ?? 0),
    );
    for (let i = 1; i < sorted.length; i++) {
      duplicateAcquisitionOrdinals.add(sorted[i]!.acquisitionOrdinal);
    }
  }
  return duplicateAcquisitionOrdinals;
}

export function rowsForPhysicalCadenceAnalysis(rows: VideoGtExportedRow[]): VideoGtExportedRow[] {
  const staleDupes = identifyStaleHoldDuplicateRows(rows);
  const deduped = dedupePhysicalSamples(rows);
  return deduped.filter((r) => !staleDupes.has(r.acquisitionOrdinal));
}

export function computePhysicalCadenceMetrics(rows: VideoGtExportedRow[]): {
  NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS: number | null;
  NEW_PHYSICAL_SAMPLE_CADENCE_P10_SECONDS: number | null;
  NEW_PHYSICAL_SAMPLE_CADENCE_P90_SECONDS: number | null;
  NEW_PHYSICAL_SAMPLE_CADENCE_MAX_GAP_SECONDS: number | null;
  UNIQUE_PHYSICAL_SAMPLE_COUNT: number;
} {
  const physicalRows = rowsForPhysicalCadenceAnalysis(rows);
  const uniqueMs = uniqueProviderTimestamps(physicalRows.map(toMetricsRow));
  const cadence = computeProviderCadence(physicalRows.map(toMetricsRow));
  const dts = uniqueMs.length > 1
    ? uniqueMs.slice(1).map((t, i) => (t - uniqueMs[i]!) / 1000)
    : [];
  return {
    NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS: cadence.deltaTSeconds.p50,
    NEW_PHYSICAL_SAMPLE_CADENCE_P10_SECONDS: pct(dts, 10),
    NEW_PHYSICAL_SAMPLE_CADENCE_P90_SECONDS: pct(dts, 90),
    NEW_PHYSICAL_SAMPLE_CADENCE_MAX_GAP_SECONDS: cadence.maxGapSeconds,
    UNIQUE_PHYSICAL_SAMPLE_COUNT: uniqueMs.length,
  };
}

const SESSION_START_MS = Date.parse(SESSION_START);
const SESSION_STOP_MS = Date.parse(SESSION_STOP);

export function computeSessionCoverageMetrics(rows: VideoGtExportedRow[]): Record<string, unknown> {
  const physicalRows = rowsForPhysicalCadenceAnalysis(rows);
  const timestamps = physicalRows
    .map((r) => parseMs(r.providerTimestamp))
    .filter((t): t is number => t != null)
    .sort((a, b) => a - b);

  if (timestamps.length === 0) {
    return {
      SESSION_SPAN_COVERAGE: 'NOT_OBSERVED',
      TEMPORAL_CONTINUITY: 'NOT_OBSERVED',
      OBSERVED_SPAN_FROM: null,
      OBSERVED_SPAN_TO: null,
      OBSERVED_SPAN_RATIO: null,
      MAX_PHYSICAL_SAMPLE_GAP_SECONDS: null,
      TIME_COVERAGE_WITHIN_3S: null,
      TIME_COVERAGE_WITHIN_5S: null,
      TIME_COVERAGE_WITHIN_10S: null,
    };
  }

  const observedFrom = timestamps[0]!;
  const observedTo = timestamps[timestamps.length - 1]!;
  const sessionSpanMs = SESSION_STOP_MS - SESSION_START_MS;
  const observedSpanMs = observedTo - observedFrom;
  const gaps = timestamps.slice(1).map((t, i) => (t - timestamps[i]!) / 1000);
  const maxGap = gaps.length ? Math.max(...gaps) : 0;

  const coverageWithin = (thresholdSec: number): number | null => {
    if (sessionSpanMs <= 0) return null;
    let coveredMs = 0;
    const stepMs = 1000;
    for (let t = SESSION_START_MS; t < SESSION_STOP_MS; t += stepMs) {
      const nearest = timestamps.reduce(
        (best, ts) => Math.min(best, Math.abs(ts - t)),
        Number.POSITIVE_INFINITY,
      );
      if (nearest <= thresholdSec * 1000) coveredMs += stepMs;
    }
    return coveredMs / sessionSpanMs;
  };

  const continuity =
    maxGap > 60 ? 'DISCONTINUOUS' : maxGap > 10 ? 'GAPPED' : maxGap > 3 ? 'MODERATE' : 'CONTINUOUS';

  return {
    SESSION_SPAN_COVERAGE:
      observedFrom <= SESSION_START_MS + 5000 && observedTo >= SESSION_STOP_MS - 5000
        ? 'FULL_SESSION_SPAN'
        : 'PARTIAL_SESSION_SPAN',
    TEMPORAL_CONTINUITY: continuity,
    OBSERVED_SPAN_FROM: new Date(observedFrom).toISOString(),
    OBSERVED_SPAN_TO: new Date(observedTo).toISOString(),
    OBSERVED_SPAN_RATIO: sessionSpanMs > 0 ? observedSpanMs / sessionSpanMs : null,
    MAX_PHYSICAL_SAMPLE_GAP_SECONDS: maxGap,
    TIME_COVERAGE_WITHIN_3S: coverageWithin(3),
    TIME_COVERAGE_WITHIN_5S: coverageWithin(5),
    TIME_COVERAGE_WITHIN_10S: coverageWithin(10),
  };
}

export function evaluateSurfaceFreshness(params: {
  subset: VideoGtExportedRow[];
  staleHoldCount: number;
  medianCadence: number | null;
  providerAgeP90: number | null;
}): Record<string, unknown> {
  const { subset, staleHoldCount, medianCadence, providerAgeP90 } = params;
  const physicalIdentityFresh =
    staleHoldCount === 0 && (medianCadence ?? 99) <= 3 && (providerAgeP90 ?? 99) <= 5;
  return {
    freshnessEvaluatedFromProviderMetrics: 'YES',
    surfaceNameImpliesFreshPhysicalSample: 'NO',
    LATEST_LIVE_EQUALS_FRESH_PHYSICAL_SAMPLE: 'NO',
    medianPhysicalCadenceSeconds: medianCadence,
    staleHoldExposure: staleHoldCount > 0 ? 'YES' : 'NO',
    providerAgeP90Seconds: providerAgeP90,
    suitableForNearRealtimeWithoutGating: physicalIdentityFresh ? 'PARTIAL' : 'NO',
    note: 'Freshness from providerTimestamp cadence, physical identity, stale holds — not surface label',
  };
}

export function resolveNegativeControlCruiseWindow(clip: ExternalGtClip): {
  fromSeconds: number;
  toSeconds: number;
  source: 'CRUISE_STABLE_LANDMARK' | 'FULL_CLIP_NEGATIVE_CONTROL';
} | null {
  if (!clip.negativeControl) return null;
  const cruiseStable = clip.observations.find((o) => o.observationType === 'CRUISE_STABLE');
  if (cruiseStable?.videoTimeSeconds != null) {
    const unc = cruiseStable.videoTimeUncertaintySeconds ?? 0;
    return {
      fromSeconds: Math.max(0, cruiseStable.videoTimeSeconds - unc),
      toSeconds: Math.min(clip.videoDurationSeconds ?? 60, cruiseStable.videoTimeSeconds + unc),
      source: 'CRUISE_STABLE_LANDMARK',
    };
  }
  return {
    fromSeconds: 0,
    toSeconds: clip.videoDurationSeconds ?? 60,
    source: 'FULL_CLIP_NEGATIVE_CONTROL',
  };
}

export function getCruiseSpeedGtObservations(clip: ExternalGtClip): ExternalGtObservation[] {
  const window = resolveNegativeControlCruiseWindow(clip);
  if (!window) return [];
  return clip.observations.filter(
    (o) =>
      o.observationType === 'SPEED' &&
      o.videoTimeSeconds != null &&
      typeof o.value === 'number' &&
      o.videoTimeSeconds >= window.fromSeconds &&
      o.videoTimeSeconds <= window.toSeconds &&
      isAlignmentEligibleGroundTruth(o),
  );
}

export function splitHoldoutTrainObservations(observations: ExternalGtObservation[]): {
  train: ExternalGtObservation[];
  holdout: ExternalGtObservation[];
} {
  const eligible = observations
    .filter(isAlignmentEligibleGroundTruth)
    .sort((a, b) => (a.observationId ?? '').localeCompare(b.observationId ?? ''));
  const train: ExternalGtObservation[] = [];
  const holdout: ExternalGtObservation[] = [];
  for (let i = 0; i < eligible.length; i++) {
    if (i % 2 === 0) train.push(eligible[i]!);
    else holdout.push(eligible[i]!);
  }
  if (train.length < MIN_ALIGNMENT_ELIGIBLE_GT_POINTS || holdout.length < 1) {
    return { train: [], holdout: [] };
  }
  return { train, holdout };
}

export function runHoldoutSpeedValidation(params: {
  clip: ExternalGtClip;
  speedSeries: SpeedSeriesPoint[];
  surface: AcquisitionSurface;
}): Record<string, unknown> {
  const { train, holdout } = splitHoldoutTrainObservations(params.clip.observations);
  if (train.length < MIN_ALIGNMENT_ELIGIBLE_GT_POINTS || holdout.length < 1) {
    return { status: 'INSUFFICIENT_GROUND_TRUTH_FOR_HOLDOUT' };
  }

  const search = coarseToFineGlobalSearchV2({
    clip: params.clip,
    speedSeries: params.speedSeries,
    eligibleObservations: train,
    surface: params.surface,
  });

  const strongBasins = search.basins.filter((b) => b.status === 'STRONG_CANDIDATE');
  if (strongBasins.length === 0) {
    return {
      status: 'AMBIGUOUS',
      reason: 'NO_ISOLATED_TRAIN_CANDIDATE',
      trainPointCount: train.length,
      holdoutPointCount: holdout.length,
    };
  }
  if (strongBasins.length > 1) {
    const maeSpread = Math.max(...strongBasins.map((b) => b.MAE)) - Math.min(...strongBasins.map((b) => b.MAE));
    if (maeSpread <= 1.0) {
      return {
        status: 'AMBIGUOUS',
        reason: 'MULTIPLE_COMPETING_TRAIN_CANDIDATES',
        trainPointCount: train.length,
        holdoutPointCount: holdout.length,
        competingStrongBasinCount: strongBasins.length,
      };
    }
  }

  const basin = strongBasins.sort((a, b) => a.MAE - b.MAE)[0]!;
  const maxGap = SURFACE_INTERPOLATION_GAP_SECONDS[params.surface];
  const trainErrors: number[] = [];
  const holdoutErrors: number[] = [];

  for (const obs of train) {
    const absMs = absoluteEventMsFromAlignedClipStart(basin.alignedClipStartMs, obs.videoTimeSeconds!);
    const pt = deriveTelemetryAtUtc(params.speedSeries, absMs, maxGap);
    if (pt.status === 'MATCHED' && pt.telemetryValue != null && typeof obs.value === 'number') {
      trainErrors.push(Math.abs(pt.telemetryValue - obs.value));
    }
  }
  for (const obs of holdout) {
    const absMs = absoluteEventMsFromAlignedClipStart(basin.alignedClipStartMs, obs.videoTimeSeconds!);
    const pt = deriveTelemetryAtUtc(params.speedSeries, absMs, maxGap);
    if (pt.status === 'MATCHED' && pt.telemetryValue != null && typeof obs.value === 'number') {
      holdoutErrors.push(Math.abs(pt.telemetryValue - obs.value));
    }
  }

  return {
    status: holdoutErrors.length > 0 ? 'EVALUATED' : 'INSUFFICIENT_HOLDOUT_MATCHES',
    trainPointCount: train.length,
    holdoutPointCount: holdout.length,
    TRAIN_ALIGNMENT_MAE: mean(trainErrors),
    HOLDOUT_MAE: mean(holdoutErrors),
    HOLDOUT_RMSE: rmse(holdoutErrors),
    HOLDOUT_MAX_ERROR: holdoutErrors.length ? Math.max(...holdoutErrors) : null,
    HOLDOUT_POINT_COUNT: holdoutErrors.length,
    trainAlignedClipStartUtc: basin.alignedClipStartUtc,
    note: 'Holdout points never used for candidate start-time selection; within-clip generalization only — not independent absolute accuracy',
  };
}

export function summarizeHoldoutByAlignmentClass(
  holdoutResults: Array<Record<string, unknown>>,
): {
  uniqueAlignmentHoldoutResults: Array<Record<string, unknown>>;
  ambiguousAlignmentHoldoutDiagnostics: Array<Record<string, unknown>>;
  uniqueAlignmentHoldoutClips: number;
  uniqueAlignmentHoldoutMaeKmh: number | null;
  ambiguousAlignmentHoldoutClips: number;
  ambiguousAlignmentHoldoutMaeKmh: number | null;
  withinClipHoldoutMaeKmh: number | null;
} {
  const evaluated = holdoutResults.filter((h) => h.status === 'EVALUATED');
  const uniqueAlignmentHoldoutResults = evaluated.filter(
    (h) => h.independentStatus === 'STRONG_CANDIDATE',
  );
  const ambiguousAlignmentHoldoutDiagnostics = evaluated.filter(
    (h) => h.independentStatus === 'AMBIGUOUS',
  );
  const uniqueMaes = uniqueAlignmentHoldoutResults
    .map((h) => h.HOLDOUT_MAE as number)
    .filter((v): v is number => v != null);
  const ambiguousMaes = ambiguousAlignmentHoldoutDiagnostics
    .map((h) => h.HOLDOUT_MAE as number)
    .filter((v): v is number => v != null);
  const allMaes = evaluated
    .map((h) => h.HOLDOUT_MAE as number)
    .filter((v): v is number => v != null);

  return {
    uniqueAlignmentHoldoutResults,
    ambiguousAlignmentHoldoutDiagnostics,
    uniqueAlignmentHoldoutClips: uniqueAlignmentHoldoutResults.length,
    uniqueAlignmentHoldoutMaeKmh: uniqueMaes.length ? mean(uniqueMaes) : null,
    ambiguousAlignmentHoldoutClips: ambiguousAlignmentHoldoutDiagnostics.length,
    ambiguousAlignmentHoldoutMaeKmh: ambiguousMaes.length ? mean(ambiguousMaes) : null,
    withinClipHoldoutMaeKmh: allMaes.length ? mean(allMaes) : null,
  };
}

export function classifyNegativeControlDynamics(params: {
  cruiseSpeedMeanError: number | null;
  cruiseSpeedErrorStdDev: number | null;
  telemetrySpeedStdDev: number | null;
  artificialAccelStdMps2: number | null;
  cruisePointCount: number;
}): NegativeControlDynamics {
  if (params.cruisePointCount < 2) return 'INSUFFICIENT_EVIDENCE';
  const errStd = params.cruiseSpeedErrorStdDev ?? 0;
  const telemStd = params.telemetrySpeedStdDev ?? 0;
  const artAccel = params.artificialAccelStdMps2 ?? 0;
  if (errStd > 4 || telemStd > 3 || artAccel > 0.8) return 'ELEVATED';
  if (errStd > 2 || telemStd > 1.5 || artAccel > 0.35) return 'MODERATE';
  return 'LOW';
}

export function computeSignalSurfaceEntry(params: {
  field: string;
  surface: AcquisitionSurface;
  rows: VideoGtExportedRow[];
  staleHolds: ReturnType<typeof detectStaleHolds>;
}): Record<string, unknown> {
  const subset = params.rows.filter(
    (r) => r.providerField === params.field && r.acquisitionSurface === params.surface,
  );
  if (subset.length === 0) {
    return { status: 'NOT_OBSERVED', OBSERVATION_COUNT: 0 };
  }

  const metrics = analyzeSignalGroup(subset.map(toMetricsRow));
  const physicalCadence = computePhysicalCadenceMetrics(subset);
  const ages = subset
    .map((r) => computeProviderDeliveryMetrics(r).providerSampleAgeSeconds)
    .filter((v): v is number => v != null);
  const holds = params.staleHolds.filter(
    (h) => h.providerField === params.field && h.acquisitionSurface === params.surface,
  );
  const holdDurations = holds.map((h) => h.staleHoldDurationSeconds);
  const duplicateRate =
    metrics.fingerprint.fingerprintedRows > 0
      ? metrics.fingerprint.duplicateFingerprintRetrievals / metrics.fingerprint.fingerprintedRows
      : null;

  const valueHolds = metrics.dynamics.staticFraction;
  const sessionCoverage = computeSessionCoverageMetrics(subset);
  const freshness = evaluateSurfaceFreshness({
    subset,
    staleHoldCount: holds.length,
    medianCadence: physicalCadence.NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS,
    providerAgeP90: pct(ages, 90),
  });

  return {
    OBSERVATION_COUNT: subset.length,
    UNIQUE_PHYSICAL_SAMPLE_COUNT: physicalCadence.UNIQUE_PHYSICAL_SAMPLE_COUNT,
    ...sessionCoverage,
    NEW_PHYSICAL_SAMPLE_CADENCE: {
      medianSeconds: physicalCadence.NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS,
      p10Seconds: physicalCadence.NEW_PHYSICAL_SAMPLE_CADENCE_P10_SECONDS,
      p90Seconds: physicalCadence.NEW_PHYSICAL_SAMPLE_CADENCE_P90_SECONDS,
      maxGapSeconds: physicalCadence.NEW_PHYSICAL_SAMPLE_CADENCE_MAX_GAP_SECONDS,
      staleHoldDuplicatesExcludedFromCadence: 'YES',
    },
    PROVIDER_SAMPLE_AGE: {
      medianSeconds: pct(ages, 50),
      p90Seconds: pct(ages, 90),
      maxSeconds: ages.length ? Math.max(...ages) : null,
    },
    STALE_HOLD: {
      count: holds.length,
      totalDurationSeconds: holdDurations.reduce((a, b) => a + b, 0),
      longestDurationSeconds: holdDurations.length ? Math.max(...holdDurations) : 0,
      repeatedAcquisitionCount: holds.reduce((s, h) => s + h.staleHoldAcquisitionCount, 0),
    },
    VALUE_HOLD_DURATION: {
      staticFraction: valueHolds,
      note: 'High staticFraction may be legitimate constant state or stale identity — interpret with STALE_HOLD',
    },
    NULL_MISSING_RATE: metrics.nullRate,
    OUT_OF_ORDER_RATE: metrics.outOfOrder.outOfOrderRate,
    DUPLICATE_PHYSICAL_SAMPLE_RATE: duplicateRate,
    dynamicsClassification: metrics.dynamics.classification,
    configuredMaxInterpolationGapSeconds: SURFACE_INTERPOLATION_GAP_SECONDS[params.surface],
    ...freshness,
    BEST_AVAILABLE_PHYSICAL_EVENT_TIME_AUTHORITY: 'providerTimestamp',
    DELIVERY_TIME_ONLY: 'synqReceivedAt',
  };
}

export function buildSignalSurfaceQualityMatrix(
  telemetryRows: VideoGtExportedRow[],
): Record<string, Record<string, Record<string, unknown>>> {
  const staleHolds = detectStaleHolds(telemetryRows);
  const out: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const field of CORE_AUDIT_SIGNALS) {
    out[field] = {};
    for (const surface of ACQUISITION_SURFACES) {
      out[field][surface] = computeSignalSurfaceEntry({
        field,
        surface,
        rows: telemetryRows,
        staleHolds,
      });
    }
  }
  for (const derived of DERIVED_SIGNALS) {
    out[derived] = Object.fromEntries(
      ACQUISITION_SURFACES.map((surface) => [
        surface,
        {
          status: 'DERIVED_NOT_RAW_TELEMETRY',
          sourceSignal: 'speed',
          sourceSurface: 'HF_HISTORICAL',
          note: 'See derived-acceleration-quality.json / jerk-quality.json',
        },
      ]),
    );
  }
  return out;
}

export function selectStrongBasinPerClip(
  discovery: ClipDiscoveryV2Result,
): BasinV2Result | null {
  return (
    discovery.HF_HISTORICAL.basins.find((b) => b.status === 'STRONG_CANDIDATE') ??
    discovery.HF_HISTORICAL.basins.sort((a, b) => a.rankByQuality - b.rankByQuality)[0] ??
    null
  );
}

export function scoreSpeedAtGtPoints(params: {
  clip: ExternalGtClip;
  basin: BasinV2Result;
  speedSeries: SpeedSeriesPoint[];
  surface: AcquisitionSurface;
}): {
  matched: number;
  total: number;
  absErrors: number[];
  gtValues: number[];
  telemValues: number[];
} {
  const eligible = params.clip.observations.filter(isAlignmentEligibleGroundTruth);
  const maxGap = SURFACE_INTERPOLATION_GAP_SECONDS[params.surface];
  const absErrors: number[] = [];
  const gtValues: number[] = [];
  const telemValues: number[] = [];
  let matched = 0;

  for (const obs of eligible) {
    const absMs = absoluteEventMsFromAlignedClipStart(
      params.basin.alignedClipStartMs,
      obs.videoTimeSeconds!,
    );
    const pt = deriveTelemetryAtUtc(params.speedSeries, absMs, maxGap);
    if (pt.status === 'MATCHED' && pt.telemetryValue != null && typeof obs.value === 'number') {
      matched++;
      const err = pt.telemetryValue - obs.value;
      absErrors.push(Math.abs(err));
      gtValues.push(obs.value);
      telemValues.push(pt.telemetryValue);
    }
  }

  return { matched, total: eligible.length, absErrors, gtValues, telemValues };
}

export function buildSpeedVideoValidation(params: {
  externalGt: ExternalGtDocument;
  perClipDiscoveries: ClipDiscoveryV2Result[];
  telemetryRows: VideoGtExportedRow[];
}): Record<string, unknown> {
  const clipResults: Record<string, unknown>[] = [];
  const hfAlignmentFitErrors: number[] = [];
  const liveAlignmentFitErrors: number[] = [];
  const negativeControls: Record<string, unknown>[] = [];
  const holdoutResults: Record<string, unknown>[] = [];
  let uniqueAlignmentSupportedClips = 0;
  let ambiguousClipsWithStrongSpeedBasin = 0;

  const hfSeriesAll = buildSpeedSeries(
    filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', 'HF_HISTORICAL'),
  );
  const liveSeriesAll = buildSpeedSeries(
    filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', 'LATEST_LIVE'),
  );

  for (const disc of params.perClipDiscoveries) {
    const clip = params.externalGt.clips.find((c) => c.clipId === disc.clipId);
    if (!clip) continue;
    const basin = selectStrongBasinPerClip(disc);
    if (!basin || basin.status !== 'STRONG_CANDIDATE') continue;

    if (disc.HF_HISTORICAL.independentStatus === 'STRONG_CANDIDATE') {
      uniqueAlignmentSupportedClips++;
    } else if (disc.HF_HISTORICAL.independentStatus === 'AMBIGUOUS') {
      ambiguousClipsWithStrongSpeedBasin++;
    }

    const hf = scoreSpeedAtGtPoints({ clip, basin, speedSeries: hfSeriesAll, surface: 'HF_HISTORICAL' });
    const live = scoreSpeedAtGtPoints({ clip, basin, speedSeries: liveSeriesAll, surface: 'LATEST_LIVE' });

    hfAlignmentFitErrors.push(...hf.absErrors);
    liveAlignmentFitErrors.push(...live.absErrors);

    const holdout = runHoldoutSpeedValidation({
      clip,
      speedSeries: hfSeriesAll,
      surface: 'HF_HISTORICAL',
    });
    holdoutResults.push({
      clipId: disc.clipId,
      fileName: disc.fileName,
      independentStatus: disc.HF_HISTORICAL.independentStatus,
      ...holdout,
    });

    const episode: Record<string, unknown> = {
      clipId: disc.clipId,
      fileName: disc.fileName,
      evidenceTier: 'TIER_A_DIRECT_VIDEO_VALIDATION',
      independentStatus: disc.HF_HISTORICAL.independentStatus,
      basinStatus: basin.status,
      alignmentFitNotIndependentAccuracy: 'IN_SAMPLE_ALIGNMENT_FIT_NOT_INDEPENDENT_ACCURACY',
      alignedClipStartUtc: basin.alignedClipStartUtc,
      basinAlignmentFitMAE: basin.MAE,
      HF_HISTORICAL: {
        matchedGtCount: hf.matched,
        eligibleGtCount: hf.total,
        ALIGNMENT_FIT_MAE: mean(hf.absErrors),
        RMSE: rmse(hf.absErrors.map((e, i) => hf.telemValues[i]! - hf.gtValues[i]!)),
        maxAbsError: hf.absErrors.length ? Math.max(...hf.absErrors) : null,
        shapeCorrelation: pearsonCorrelation(hf.gtValues, hf.telemValues),
      },
      LATEST_LIVE: {
        matchedGtCount: live.matched,
        eligibleGtCount: live.total,
        ALIGNMENT_FIT_MAE: mean(live.absErrors),
        RMSE: rmse(live.absErrors.map((e, i) => live.telemValues[i]! - live.gtValues[i]!)),
        maxAbsError: live.absErrors.length ? Math.max(...live.absErrors) : null,
        shapeCorrelation: pearsonCorrelation(live.gtValues, live.telemValues),
        directVideoValidationEvidence: live.matched >= 3 ? 'LIMITED' : 'INSUFFICIENT_EVIDENCE',
      },
    };

    if (clip.negativeControl) {
      const cruiseWindow = resolveNegativeControlCruiseWindow(clip);
      const cruiseObs = getCruiseSpeedGtObservations(clip);
      const cruiseGtValues: number[] = [];
      const cruiseTelemValues: number[] = [];
      const cruiseErrors: number[] = [];

      for (const obs of cruiseObs) {
        const absMs = absoluteEventMsFromAlignedClipStart(
          basin.alignedClipStartMs,
          obs.videoTimeSeconds!,
        );
        const pt = deriveTelemetryAtUtc(
          hfSeriesAll,
          absMs,
          SURFACE_INTERPOLATION_GAP_SECONDS.HF_HISTORICAL,
        );
        if (pt.status === 'MATCHED' && pt.telemetryValue != null && typeof obs.value === 'number') {
          cruiseGtValues.push(obs.value);
          cruiseTelemValues.push(pt.telemetryValue);
          cruiseErrors.push(Math.abs(pt.telemetryValue - obs.value));
        }
      }

      const windowStartMs = basin.alignedClipStartMs + (cruiseWindow?.fromSeconds ?? 0) * 1000;
      const windowEndMs = basin.alignedClipStartMs + (cruiseWindow?.toSeconds ?? 60) * 1000;
      const cruiseTelemInWindow = hfSeriesAll.filter(
        (p) => p.utcMs >= windowStartMs && p.utcMs <= windowEndMs,
      );
      const cruiseAccel = deriveLongitudinalAccelerationFromSpeed({
        speedSeries: cruiseTelemInWindow,
        maxGapSeconds: 2.0,
      }).filter((p) => p.reliable);

      const artificialDynamics = classifyNegativeControlDynamics({
        cruiseSpeedMeanError: mean(cruiseErrors),
        cruiseSpeedErrorStdDev: stddev(cruiseErrors),
        telemetrySpeedStdDev: stddev(cruiseTelemInWindow.map((p) => p.value)),
        artificialAccelStdMps2: stddev(cruiseAccel.map((p) => p.accelerationMps2)),
        cruisePointCount: cruiseErrors.length,
      });

      negativeControls.push({
        clipId: clip.clipId,
        fileName: clip.fileName,
        negativeControl: true,
        independentStatus: disc.HF_HISTORICAL.independentStatus,
        NEGATIVE_CONTROL_AUTHORITY:
          disc.HF_HISTORICAL.independentStatus === 'STRONG_CANDIDATE'
            ? 'UNIQUE_ALIGNMENT_SUPPORTED'
            : 'DIAGNOSTIC_ONLY_AMBIGUOUS_ALIGNMENT',
        cruiseWindow,
        cruiseObservationCount: cruiseObs.length,
        cruiseMatchedPointCount: cruiseErrors.length,
        cruiseSpeedMeanError: mean(cruiseErrors),
        cruiseSpeedErrorStdDev: stddev(cruiseErrors),
        telemetrySpeedStdDev: stddev(cruiseTelemInWindow.map((p) => p.value)),
        videoSpeedStdDev: stddev(cruiseGtValues),
        artificialAccelerationStdMps2InCruiseWindow: stddev(
          cruiseAccel.map((p) => p.accelerationMps2),
        ),
        NEGATIVE_CONTROL_ARTIFICIAL_DYNAMICS: artificialDynamics,
        note:
          disc.HF_HISTORICAL.independentStatus === 'AMBIGUOUS'
            ? 'Diagnostic only — ambiguous temporal alignment; not authoritative proof of artificial dynamics'
            : 'Scores only GT SPEED observations inside declared stable-cruise window',
      });
    }

    clipResults.push(episode);
  }

  const holdoutSummary = summarizeHoldoutByAlignmentClass(holdoutResults);

  return {
    evidenceTier: 'TIER_A_DIRECT_VIDEO_VALIDATION',
    evidenceClass: 'ALIGNMENT_FIT_VIDEO_COMPARISON',
    GROUND_TRUTH_VALIDATED: 'NO',
    INDEPENDENT_ABSOLUTE_ACCURACY_VALIDATED: 'NO',
    INDEPENDENT_ABSOLUTE_SPEED_ACCURACY_VALIDATED: 'NO',
    WITHIN_CLIP_HOLDOUT_IMPROVES_GENERALIZATION_EVIDENCE: 'YES',
    IN_SAMPLE_ALIGNMENT_FIT_NOT_INDEPENDENT_ACCURACY: 'YES',
    UNIQUE_ALIGNMENT_SUPPORTED_CLIPS: uniqueAlignmentSupportedClips,
    AMBIGUOUS_CLIPS_WITH_STRONG_SPEED_BASIN: ambiguousClipsWithStrongSpeedBasin,
    qualifiedStrongBasinClips: clipResults.length,
    aggregateHF: {
      ALIGNMENT_FIT_MAE: mean(hfAlignmentFitErrors),
      RMSE: rmse(hfAlignmentFitErrors),
      maxAbsError: hfAlignmentFitErrors.length ? Math.max(...hfAlignmentFitErrors) : null,
      matchedPoints: hfAlignmentFitErrors.length,
    },
    aggregateLATEST_LIVE: {
      ALIGNMENT_FIT_MAE: mean(liveAlignmentFitErrors),
      RMSE: rmse(liveAlignmentFitErrors),
      maxAbsError: liveAlignmentFitErrors.length ? Math.max(...liveAlignmentFitErrors) : null,
      matchedPoints: liveAlignmentFitErrors.length,
      directVideoValidationEvidence:
        liveAlignmentFitErrors.length >= 3 ? 'LIMITED' : 'INSUFFICIENT_EVIDENCE',
    },
    HF_SPEED_ALIGNMENT_FIT_MAE_KMH: mean(hfAlignmentFitErrors),
    HF_SPEED_WITHIN_CLIP_HOLDOUT_MAE_KMH: holdoutSummary.withinClipHoldoutMaeKmh,
    HF_SPEED_INDEPENDENT_ABSOLUTE_ACCURACY_MAE_KMH: null,
    UNIQUE_ALIGNMENT_HOLDOUT_CLIPS: holdoutSummary.uniqueAlignmentHoldoutClips,
    UNIQUE_ALIGNMENT_HOLDOUT_MAE_KMH: holdoutSummary.uniqueAlignmentHoldoutMaeKmh,
    AMBIGUOUS_ALIGNMENT_HOLDOUT_CLIPS: holdoutSummary.ambiguousAlignmentHoldoutClips,
    AMBIGUOUS_ALIGNMENT_HOLDOUT_MAE_KMH: holdoutSummary.ambiguousAlignmentHoldoutMaeKmh,
    UNIQUE_ALIGNMENT_HOLDOUT_RESULTS: holdoutSummary.uniqueAlignmentHoldoutResults,
    AMBIGUOUS_ALIGNMENT_HOLDOUT_DIAGNOSTICS: holdoutSummary.ambiguousAlignmentHoldoutDiagnostics,
    holdoutValidation: holdoutResults,
    perClip: clipResults,
    negativeControls,
    NEGATIVE_CONTROL_UNIQUE_ALIGNMENT_VALIDATED: 'NO',
    note: 'Alignment-fit MAE uses STRONG_CANDIDATE basins discovered with same video GT; within-clip holdout improves generalization evidence but does not establish independent absolute accuracy',
  };
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

export type DerivedAccelPoint = {
  utcMs: number;
  accelerationMps2: number;
  deltaTSec: number;
  deltaVKmh: number;
  reliable: boolean;
  rejectionReason: string | null;
};

export function deriveLongitudinalAccelerationFromSpeed(params: {
  speedSeries: SpeedSeriesPoint[];
  maxGapSeconds: number;
  staleHoldDuplicateOrdinals?: Set<number>;
}): DerivedAccelPoint[] {
  const points: DerivedAccelPoint[] = [];
  const stale = params.staleHoldDuplicateOrdinals ?? new Set<number>();

  for (let i = 1; i < params.speedSeries.length; i++) {
    const prev = params.speedSeries[i - 1]!;
    const cur = params.speedSeries[i]!;
    const dt = (cur.utcMs - prev.utcMs) / 1000;
    const dvKmh = cur.value - prev.value;
    let reliable = true;
    let rejectionReason: string | null = null;

    if (dt <= 0) {
      reliable = false;
      rejectionReason = 'NON_POSITIVE_DELTA_T';
    } else if (dt > params.maxGapSeconds) {
      reliable = false;
      rejectionReason = 'GAP_EXCEEDS_POLICY';
    } else if (stale.has(cur.row.acquisitionOrdinal) || stale.has(prev.row.acquisitionOrdinal)) {
      reliable = false;
      rejectionReason = 'STALE_HOLD_DUPLICATE';
    } else if (
      prev.row.physicalSampleFingerprint &&
      prev.row.physicalSampleFingerprint === cur.row.physicalSampleFingerprint &&
      prev.row.providerTimestamp === cur.row.providerTimestamp
    ) {
      reliable = false;
      rejectionReason = 'SAME_PHYSICAL_IDENTITY';
    }

    const aMps2 = reliable ? (dvKmh / 3.6) / dt : 0;
    points.push({
      utcMs: cur.utcMs,
      accelerationMps2: aMps2,
      deltaTSec: dt,
      deltaVKmh: dvKmh,
      reliable,
      rejectionReason,
    });
  }
  return points;
}

export function deriveJerkFromAcceleration(accelPoints: DerivedAccelPoint[]): Array<{
  utcMs: number;
  jerkMps3: number;
  reliable: boolean;
  rejectionReason: string | null;
}> {
  const reliableAccel = accelPoints.filter((p) => p.reliable);
  const out: Array<{
    utcMs: number;
    jerkMps3: number;
    reliable: boolean;
    rejectionReason: string | null;
  }> = [];

  for (let i = 1; i < reliableAccel.length; i++) {
    const prev = reliableAccel[i - 1]!;
    const cur = reliableAccel[i]!;
    const dt = (cur.utcMs - prev.utcMs) / 1000;
    if (dt <= 0 || dt > 3) {
      out.push({ utcMs: cur.utcMs, jerkMps3: 0, reliable: false, rejectionReason: 'INVALID_OR_LARGE_DELTA_T' });
      continue;
    }
    out.push({
      utcMs: cur.utcMs,
      jerkMps3: (cur.accelerationMps2 - prev.accelerationMps2) / dt,
      reliable: true,
      rejectionReason: null,
    });
  }
  return out;
}

export function buildDerivedAccelerationQuality(
  telemetryRows: VideoGtExportedRow[],
  negativeControls?: Record<string, unknown>[],
): Record<string, unknown> {
  const hfRows = filterTelemetryByFieldAndSurface(telemetryRows, 'speed', 'HF_HISTORICAL');
  const staleDupes = identifyStaleHoldDuplicateRows(hfRows);
  const speedSeries = buildSpeedSeries(hfRows);
  const policies: Record<string, unknown> = {};

  for (const maxGap of PROVISIONAL_ACCELERATION_MAX_GAP_POLICIES_SECONDS) {
    const accel = deriveLongitudinalAccelerationFromSpeed({
      speedSeries,
      maxGapSeconds: maxGap,
      staleHoldDuplicateOrdinals: staleDupes,
    });
    const reliable = accel.filter((p) => p.reliable);
    const absAccel = reliable.map((p) => Math.abs(p.accelerationMps2));
    const jerk = deriveJerkFromAcceleration(accel);
    const reliableJerk = jerk.filter((p) => p.reliable);
    policies[`maxGap_${maxGap}s`] = {
      maxGapSeconds: maxGap,
      policyRole: 'ANALYSIS_ONLY',
      totalAccelerationPoints: accel.length,
      reliableAccelerationPoints: reliable.length,
      qualifiedPointFraction: accel.length ? reliable.length / accel.length : 0,
      accelerationDistributionStdMps2: stddev(reliable.map((p) => p.accelerationMps2)),
      medianAbsAcceleration: pct(absAccel, 50),
      p90AbsAcceleration: pct(absAccel, 90),
      p99AbsAcceleration: pct(absAccel, 99),
      implausibleAccelerationFraction:
        absAccel.length > 0
          ? absAccel.filter((a) => a > IMPLAUSIBLE_ABS_ACCELERATION_MPS2).length / absAccel.length
          : 0,
      totalJerkPoints: jerk.length,
      reliableJerkPoints: reliableJerk.length,
      reliableJerkFraction: jerk.length ? reliableJerk.length / jerk.length : 0,
      jerkDistributionStdMps3: stddev(reliableJerk.map((p) => p.jerkMps3)),
    };
  }

  const negativeControlNearZero: Record<string, unknown> = {};
  for (const nc of negativeControls ?? []) {
    const fileName = String(nc.fileName ?? '');
    negativeControlNearZero[fileName] = {
      artificialAccelerationStdMps2InCruiseWindow: nc.artificialAccelerationStdMps2InCruiseWindow,
      NEGATIVE_CONTROL_ARTIFICIAL_DYNAMICS: nc.NEGATIVE_CONTROL_ARTIFICIAL_DYNAMICS,
    };
  }

  return {
    evidenceClass: 'DERIVED_KINEMATIC_ANALYSIS',
    sourceSignal: 'speed',
    sourceSurface: 'HF_HISTORICAL',
    physicalDeltaTAuthority: 'providerTimestamp',
    staleHoldExcluded: 'YES',
    accelerationDistributionNote: 'StdDev of reconstructed acceleration includes real vehicle dynamics — not sensor noise',
    policies,
    negativeControlNearZeroBehavior: negativeControlNearZero,
    PROVISIONAL_CANDIDATE_MAX_GAP: 'ANALYSIS_ONLY — no production threshold selected',
    note: 'Provisional gap policies — no production threshold selected',
  };
}

export function buildJerkQuality(derivedAccel: Record<string, unknown>): Record<string, unknown> {
  const policies = derivedAccel.policies as Record<string, Record<string, unknown>>;
  const policy24 = policies?.maxGap_2s ?? policies?.['maxGap_2s'];
  const reliableFrac = (policy24?.reliableJerkFraction as number) ?? 0;
  return {
    evidenceClass: 'DERIVED_KINEMATIC_ANALYSIS',
    DERIVED_JERK_CLASSIFICATION:
      reliableFrac >= 0.5 ? 'EPISODE_CONTEXT_ONLY' : 'NOT_RELIABLE',
    JERK_DIRECT_USE:
      reliableFrac >= 0.5 ? 'EPISODE_CONTEXT_ONLY' : 'NOT_RELIABLE',
    JERK_EPISODE_CONTEXT_ONLY: reliableFrac >= 0.25 ? 'YES' : 'NO',
    jerkDistributionNote: 'jerkDistributionStdMps3 includes real dynamic variation — not isolated sensor noise',
    source: 'jerkFromAcceleration',
    policies,
    note: 'Raw cadence-aware jerk without smoothing — high sensitivity to Δt',
  };
}

export function buildCadenceAndStaleness(
  telemetryRows: VideoGtExportedRow[],
): Record<string, unknown> {
  const staleHolds = detectStaleHolds(telemetryRows);
  const byFieldSurface: Record<string, Record<string, unknown>> = {};

  for (const field of CORE_AUDIT_SIGNALS) {
    byFieldSurface[field] = {};
    for (const surface of ACQUISITION_SURFACES) {
      const subset = filterTelemetryByFieldAndSurface(telemetryRows, field, surface);
      if (subset.length === 0) {
        byFieldSurface[field][surface] = { status: 'NOT_OBSERVED' };
        continue;
      }
      const physicalCadence = computePhysicalCadenceMetrics(subset);
      const holds = staleHolds.filter(
        (h) => h.providerField === field && h.acquisitionSurface === surface,
      );
      byFieldSurface[field][surface] = {
        ...physicalCadence,
        STALE_HOLD_COUNT: holds.length,
        STALE_HOLD_TOTAL_DURATION_SECONDS: holds.reduce((s, h) => s + h.staleHoldDurationSeconds, 0),
      };
    }
  }

  return {
    staleHoldRecords: staleHolds,
    perSignalSurface: byFieldSurface,
    providerTimestampAuthority: 'BEST_AVAILABLE_PHYSICAL_EVENT_TIME_AUTHORITY',
    synqReceivedAtAuthority: 'DELIVERY_TIME_ONLY',
  };
}

export function laggedPearsonAtSeconds(
  speedPoints: Array<{ utcMs: number; value: number }>,
  signalRows: VideoGtExportedRow[],
  lagSeconds: number,
): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const sp of speedPoints) {
    const targetMs = sp.utcMs + lagSeconds * 1000;
    const near = signalRows
      .map((r) => ({ ms: parseMs(r.providerTimestamp), v: extractNumericValue(r.rawValueJson) }))
      .filter((x) => x.ms != null && x.v != null && Math.abs(x.ms! - targetMs) < 1500);
    if (near.length === 0) continue;
    const best = near.sort((a, b) => Math.abs(a.ms! - targetMs) - Math.abs(b.ms! - targetMs))[0]!;
    xs.push(sp.value);
    ys.push(best.v!);
  }
  return pearsonCorrelation(xs, ys);
}

export function computeEventDirectionAgreement(
  speedPoints: SpeedSeriesPoint[],
  signalRows: VideoGtExportedRow[],
  lagSeconds: number,
): { agreementFraction: number | null; evaluatedPairs: number } {
  let agree = 0;
  let total = 0;
  for (let i = 1; i < speedPoints.length; i++) {
    const prev = speedPoints[i - 1]!;
    const cur = speedPoints[i]!;
    const dt = (cur.utcMs - prev.utcMs) / 1000;
    if (dt <= 0 || dt > 4) continue;
    const speedDelta = cur.value - prev.value;
    if (Math.abs(speedDelta) < 0.5) continue;

    const targetMs = cur.utcMs + lagSeconds * 1000;
    const near = signalRows
      .map((r) => ({ ms: parseMs(r.providerTimestamp), v: extractNumericValue(r.rawValueJson) }))
      .filter((x) => x.ms != null && x.v != null && Math.abs(x.ms! - targetMs) < 1500);
    if (near.length < 2) continue;
    const sorted = near.sort((a, b) => a.ms! - b.ms!);
    const sigDelta = sorted[sorted.length - 1]!.v! - sorted[0]!.v!;
    if (Math.abs(sigDelta) < 0.01) continue;
    total++;
    if (Math.sign(speedDelta) === Math.sign(sigDelta)) agree++;
  }
  return {
    agreementFraction: total > 0 ? agree / total : null,
    evaluatedPairs: total,
  };
}

export function buildPowertrainSignalCorrelation(params: {
  perClipDiscoveries: ClipDiscoveryV2Result[];
  externalGt: ExternalGtDocument;
  telemetryRows: VideoGtExportedRow[];
}): Record<string, unknown> {
  const episodes: Record<string, unknown>[] = [];
  const aggregateBySignal: Record<
    string,
    {
      lagCorrelations: number[];
      eventAgreements: number[];
      uniqueAlignmentLagCorrelations: number[];
      uniqueAlignmentEventAgreements: number[];
      ambiguousLagCorrelations: number[];
      ambiguousEventAgreements: number[];
      episodeCount: number;
      uniqueAlignmentEpisodes: number;
      ambiguousBasinEpisodes: number;
    }
  > = {};

  const signals = [
    'powertrainCombustionEngineSpeed',
    'obdThrottlePosition',
    'powertrainCombustionEngineTPS',
    'obdEngineLoad',
  ] as const;

  for (const sig of signals) {
    aggregateBySignal[sig] = {
      lagCorrelations: [],
      eventAgreements: [],
      uniqueAlignmentLagCorrelations: [],
      uniqueAlignmentEventAgreements: [],
      ambiguousLagCorrelations: [],
      ambiguousEventAgreements: [],
      episodeCount: 0,
      uniqueAlignmentEpisodes: 0,
      ambiguousBasinEpisodes: 0,
    };
  }

  for (const disc of params.perClipDiscoveries) {
    const clip = params.externalGt.clips.find((c) => c.clipId === disc.clipId);
    const basin = selectStrongBasinPerClip(disc);
    if (!clip || !basin || basin.status !== 'STRONG_CANDIDATE') continue;
    if (basin.coverage < 0.5) continue;

    const isUniqueAlignment = disc.HF_HISTORICAL.independentStatus === 'STRONG_CANDIDATE';
    const isAmbiguousBasin = disc.HF_HISTORICAL.independentStatus === 'AMBIGUOUS';

    const startMs = basin.alignedClipStartMs;
    const endMs = startMs + (clip.videoDurationSeconds ?? 60) * 1000;
    const hfSpeed = buildSpeedSeries(
      filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', 'HF_HISTORICAL'),
    ).filter((p) => p.utcMs >= startMs && p.utcMs <= endMs);

    const signalStats: Record<string, unknown> = {};
    for (const field of signals) {
      const rows = params.telemetryRows.filter(
        (r) =>
          r.providerField === field &&
          r.acquisitionSurface === 'HF_HISTORICAL' &&
          (parseMs(r.providerTimestamp) ?? 0) >= startMs &&
          (parseMs(r.providerTimestamp) ?? 0) <= endMs,
      );
      const dynamics = analyzeSignalGroup(rows.map(toMetricsRow)).dynamics;
      const lagAnalysis: Record<string, unknown> = {};
      let bestLag: number | null = null;
      let bestCorr: number | null = null;

      for (const lag of DIAGNOSTIC_LAG_SECONDS) {
        const corr = laggedPearsonAtSeconds(hfSpeed, rows, lag);
        lagAnalysis[`lag_${lag}s`] = corr;
        if (corr != null && (bestCorr == null || Math.abs(corr) > Math.abs(bestCorr))) {
          bestCorr = corr;
          bestLag = lag;
        }
      }

      const eventDir = computeEventDirectionAgreement(hfSpeed, rows, bestLag ?? 0);
      const agg = aggregateBySignal[field]!;
      agg.episodeCount++;
      if (isUniqueAlignment) agg.uniqueAlignmentEpisodes++;
      if (isAmbiguousBasin) agg.ambiguousBasinEpisodes++;
      if (bestCorr != null) {
        agg.lagCorrelations.push(bestCorr);
        if (isUniqueAlignment) agg.uniqueAlignmentLagCorrelations.push(bestCorr);
        if (isAmbiguousBasin) agg.ambiguousLagCorrelations.push(bestCorr);
      }
      if (eventDir.agreementFraction != null) {
        agg.eventAgreements.push(eventDir.agreementFraction);
        if (isUniqueAlignment) agg.uniqueAlignmentEventAgreements.push(eventDir.agreementFraction);
        if (isAmbiguousBasin) agg.ambiguousEventAgreements.push(eventDir.agreementFraction);
      }

      signalStats[field] = {
        observationCount: rows.length,
        dynamicsClassification: dynamics.classification,
        laggedCorrelation: lagAnalysis,
        bestDiagnosticLagSeconds: bestLag,
        laggedCorrelationAtBestLag: bestCorr,
        eventDirectionAgreement: eventDir.agreementFraction,
        eventDirectionPairsEvaluated: eventDir.evaluatedPairs,
        evidenceClass: 'ALIGNED_EVENT_CORRELATED_SUPPORT',
        alignmentEpisodeClass: isUniqueAlignment
          ? 'UNIQUE_ALIGNMENT_SUPPORTED'
          : isAmbiguousBasin
            ? 'AMBIGUOUS_BASIN_DIAGNOSTIC'
            : 'OTHER',
        note: 'Diagnostic lag/correlation only — not direct video GT validation',
      };
    }

    episodes.push({
      clipId: disc.clipId,
      fileName: disc.fileName,
      evidenceTier: 'TIER_B_ALIGNED_EVENT_CORRELATION',
      independentStatus: disc.HF_HISTORICAL.independentStatus,
      alignedClipStartUtc: basin.alignedClipStartUtc,
      signals: signalStats,
    });
  }

  const signalInterpretations: Record<string, SignalRatingEvidence> = {};
  const rpmAgg = aggregateBySignal.powertrainCombustionEngineSpeed!;
  const throttleAgg = aggregateBySignal.obdThrottlePosition!;
  const tpsAgg = aggregateBySignal.powertrainCombustionEngineTPS!;
  const loadAgg = aggregateBySignal.obdEngineLoad!;

  const avgEventAgreement = (vals: number[]) => (vals.length ? mean(vals) : null);
  const avgLagCorr = (vals: number[]) => (vals.length ? mean(vals.map(Math.abs)) : null);

  const formatPowertrainEvidence = (agg: (typeof aggregateBySignal)[string]) =>
    `unique-alignment (n=${agg.uniqueAlignmentEpisodes}): eventDir=${avgEventAgreement(agg.uniqueAlignmentEventAgreements)?.toFixed(2) ?? 'n/a'}, |lagCorr|=${avgLagCorr(agg.uniqueAlignmentLagCorrelations)?.toFixed(2) ?? 'n/a'}; ambiguous-diagnostic (n=${agg.ambiguousBasinEpisodes}): eventDir=${avgEventAgreement(agg.ambiguousEventAgreements)?.toFixed(2) ?? 'n/a'}, |lagCorr|=${avgLagCorr(agg.ambiguousLagCorrelations)?.toFixed(2) ?? 'n/a'}`;

  signalInterpretations.powertrainCombustionEngineSpeed = {
    RATING: 'USEFUL_WITH_GATING',
    EVIDENCE_BASIS: formatPowertrainEvidence(rpmAgg),
    LIMITATION: 'Not direct video GT; shift timing not proven; ambiguous episodes are diagnostic only',
  };
  signalInterpretations.obdThrottlePosition = {
    RATING: 'SECONDARY_DEMAND_CONTEXT',
    EVIDENCE_BASIS: formatPowertrainEvidence(throttleAgg),
    LIMITATION: 'Separate from TPS; unique-alignment evidence limited to 2 episodes',
  };
  signalInterpretations.powertrainCombustionEngineTPS = {
    RATING: 'SECONDARY_DEMAND_CONTEXT',
    EVIDENCE_BASIS: formatPowertrainEvidence(tpsAgg),
    LIMITATION: 'Separate from obdThrottlePosition; ambiguous episodes diagnostic only',
  };
  signalInterpretations.obdEngineLoad = {
    RATING: 'POWERTRAIN_DEMAND_CONTEXT_ONLY',
    EVIDENCE_BASIS: formatPowertrainEvidence(loadAgg),
    LIMITATION: 'Not vehicle mass/payload/road load; contextual only',
  };

  const uniqueAlignmentEpisodes = episodes.filter(
    (e) => e.independentStatus === 'STRONG_CANDIDATE',
  ).length;
  const ambiguousAlignmentDiagnosticEpisodes = episodes.filter(
    (e) => e.independentStatus === 'AMBIGUOUS',
  ).length;

  const perSignalAuthorityMetrics = Object.fromEntries(
    signals.map((sig) => {
      const agg = aggregateBySignal[sig]!;
      return [
        sig,
        {
          UNIQUE_ALIGNMENT_MEAN_EVENT_DIRECTION_AGREEMENT: avgEventAgreement(
            agg.uniqueAlignmentEventAgreements,
          ),
          UNIQUE_ALIGNMENT_MEAN_ABS_LAGGED_CORRELATION: avgLagCorr(agg.uniqueAlignmentLagCorrelations),
          AMBIGUOUS_DIAGNOSTIC_MEAN_EVENT_DIRECTION_AGREEMENT: avgEventAgreement(
            agg.ambiguousEventAgreements,
          ),
          AMBIGUOUS_DIAGNOSTIC_MEAN_ABS_LAGGED_CORRELATION: avgLagCorr(agg.ambiguousLagCorrelations),
        },
      ];
    }),
  );

  return {
    evidenceTier: 'TIER_B_ALIGNED_EVENT_CORRELATION',
    episodeCount: episodes.length,
    UNIQUE_ALIGNMENT_EPISODES: uniqueAlignmentEpisodes,
    AMBIGUOUS_ALIGNMENT_DIAGNOSTIC_EPISODES: ambiguousAlignmentDiagnosticEpisodes,
    episodes,
    aggregateDiagnostics: Object.fromEntries(
      signals.map((sig) => [
        sig,
        {
          ...aggregateBySignal[sig],
          meanEventDirectionAgreement: avgEventAgreement(aggregateBySignal[sig]!.eventAgreements),
          meanAbsLaggedCorrelation: avgLagCorr(aggregateBySignal[sig]!.lagCorrelations),
          UNIQUE_ALIGNMENT_MEAN_EVENT_DIRECTION_AGREEMENT: avgEventAgreement(
            aggregateBySignal[sig]!.uniqueAlignmentEventAgreements,
          ),
          UNIQUE_ALIGNMENT_MEAN_ABS_LAGGED_CORRELATION: avgLagCorr(
            aggregateBySignal[sig]!.uniqueAlignmentLagCorrelations,
          ),
          AMBIGUOUS_DIAGNOSTIC_MEAN_EVENT_DIRECTION_AGREEMENT: avgEventAgreement(
            aggregateBySignal[sig]!.ambiguousEventAgreements,
          ),
          AMBIGUOUS_DIAGNOSTIC_MEAN_ABS_LAGGED_CORRELATION: avgLagCorr(
            aggregateBySignal[sig]!.ambiguousLagCorrelations,
          ),
        },
      ]),
    ),
    perSignalAuthorityMetrics,
    signalInterpretations,
    ENGINE_LOAD_INTERPRETATION:
      'Powertrain demand context only — not vehicle mass/payload/road load',
    note: 'Correlation and lag analysis within qualified STRONG_CANDIDATE speed-aligned windows',
  };
}

export function buildGearDirectionQuality(params: {
  externalGt: ExternalGtDocument;
  telemetryRows: VideoGtExportedRow[];
}): Record<string, unknown> {
  const img2810 = params.externalGt.clips.find((c) => c.fileName === 'IMG_2810.mp4');
  const img2811 = params.externalGt.clips.find((c) => c.fileName === 'IMG_2811.mp4');

  const gearHf = filterTelemetryByFieldAndSurface(
    params.telemetryRows,
    'powertrainTransmissionActualGear',
    'HF_HISTORICAL',
  );
  const gearSlow = filterTelemetryByFieldAndSurface(
    params.telemetryRows,
    'powertrainTransmissionActualGear',
    'LATEST_SLOW',
  );
  const ratioSlow = filterTelemetryByFieldAndSurface(
    params.telemetryRows,
    'powertrainTransmissionActualGearRatio',
    'LATEST_SLOW',
  );

  const gearDynamicsHf = analyzeSignalGroup(gearHf.map(toMetricsRow)).dynamics;
  const gearDynamicsSlow = analyzeSignalGroup(gearSlow.map(toMetricsRow)).dynamics;

  return {
    evidenceTier: 'TIER_C_STATE_CONTEXT',
    GEAR_STATE_OBSERVABILITY: gearSlow.length > 0 || gearHf.length > 0 ? 'YES' : 'NO',
    GEAR_CHANGE_TIMING_OBSERVABILITY: 'NO',
    GEAR_STATE_USEFUL: gearSlow.length >= 3 ? 'YES' : 'PARTIAL',
    PRECISE_SHIFT_TIMING_USEFUL: 'NO',
    RPM_SHIFT_SIGNATURE_DETECTABILITY: 'PARTIAL',
    IMG_2810_VIDEO_SHIFT_LANDMARK: img2810
      ? {
          videoTimeSeconds: 9.55,
          value: 'S2→S3',
          telemetryPreShiftState: 'CONTEXT_ONLY',
          telemetryPostShiftState: 'CONTEXT_ONLY',
          telemetryShiftTime: 'NOT_SUPPORTED',
        }
      : null,
    IMG_2811_DIRECTION: img2811
      ? {
          videoDirectionGt: 'AVAILABLE',
          directionFromUnsignedSpeedAlone: 'NOT_IDENTIFIABLE',
          gearComplementForDirection: gearSlow.length > 0 ? 'PARTIAL' : 'NOT_IDENTIFIABLE',
        }
      : null,
    DIRECTION_RECONSTRUCTION_CAPABILITY: gearSlow.length >= 3 ? 'PARTIAL' : 'NOT_IDENTIFIABLE',
    powertrainTransmissionActualGear: {
      HF_HISTORICAL: { observationCount: gearHf.length, dynamics: gearDynamicsHf.classification },
      LATEST_SLOW: { observationCount: gearSlow.length, dynamics: gearDynamicsSlow.classification },
    },
    powertrainTransmissionActualGearRatio: {
      LATEST_SLOW: { observationCount: ratioSlow.length },
    },
    UNSIGNED_SPEED_CANNOT_INFER_DIRECTION: 'YES',
  };
}

function rateFromDynamics(
  classification: string,
  staleHoldCount: number,
  medianCadence: number | null,
): EligibilityRating {
  if (classification === 'NOT_OBSERVED') return 'D';
  if (staleHoldCount > 5 && medianCadence == null) return 'D';
  if (classification === 'DYNAMICALLY_INFORMATIVE' && (medianCadence ?? 99) <= 3) return 'A';
  if (classification === 'DYNAMICALLY_INFORMATIVE') return 'B';
  if (classification === 'STATIC_OR_CONTEXTUAL') return 'C';
  return 'D';
}

export function buildUseCaseEligibilityMatrix(params: {
  surfaceMatrix: Record<string, Record<string, Record<string, unknown>>>;
  speedValidation: Record<string, unknown>;
  derivedAccel: Record<string, unknown>;
  gearDirection: Record<string, unknown>;
  powertrainCorrelation: Record<string, unknown>;
}): Record<string, Record<string, EligibilityRating>> {
  const matrix: Record<string, Record<string, EligibilityRating>> = {};
  const alignmentFitMae =
    (params.speedValidation.HF_SPEED_ALIGNMENT_FIT_MAE_KMH as number | null) ??
    (params.speedValidation.aggregateHF as { ALIGNMENT_FIT_MAE?: number })?.ALIGNMENT_FIT_MAE ??
    99;
  const liveMatched = (params.speedValidation.aggregateLATEST_LIVE as { matchedPoints?: number })
    ?.matchedPoints ?? 0;
  const accelPolicy = (params.derivedAccel.policies as Record<string, unknown>)?.maxGap_2s as
    | { qualifiedPointFraction?: number }
    | undefined;
  const rpmInterp = (
    params.powertrainCorrelation.signalInterpretations as Record<string, SignalRatingEvidence>
  )?.powertrainCombustionEngineSpeed;

  const signalRatings: Record<string, EligibilityRating> = {
    speed_HF: alignmentFitMae <= 10 ? 'B' : 'C',
    speed_LIVE: liveMatched >= 3 ? 'C' : 'D',
    powertrainCombustionEngineSpeed:
      rpmInterp?.RATING === 'USEFUL_WITH_GATING'
        ? 'B'
        : rateFromDynamics(
            String(
              params.surfaceMatrix.powertrainCombustionEngineSpeed?.HF_HISTORICAL
                ?.dynamicsClassification ?? 'UNKNOWN',
            ),
            Number(
              (params.surfaceMatrix.powertrainCombustionEngineSpeed?.LATEST_LIVE?.STALE_HOLD as {
                count?: number;
              })?.count ?? 0,
            ),
            (
              params.surfaceMatrix.powertrainCombustionEngineSpeed?.HF_HISTORICAL
                ?.NEW_PHYSICAL_SAMPLE_CADENCE as { medianSeconds?: number }
            )?.medianSeconds ?? null,
          ),
    obdThrottlePosition: 'B',
    powertrainCombustionEngineTPS: 'B',
    obdEngineLoad: 'C',
    powertrainTransmissionActualGear: 'C',
    powertrainTransmissionActualGearRatio: 'C',
    longitudinalAccelerationFromSpeed:
      (accelPolicy?.qualifiedPointFraction ?? 0) >= 0.6 ? 'B' : 'C',
    jerkFromAcceleration: 'D',
    providerTimestamp: 'A',
    synqReceivedAt: 'D',
  };

  const useCaseSignalMap: Record<string, string[]> = {
    trip_level_driving_analysis: ['speed_HF', 'powertrainCombustionEngineSpeed', 'obdEngineLoad'],
    acceleration_episode_detection: ['speed_HF', 'longitudinalAccelerationFromSpeed', 'obdThrottlePosition'],
    braking_episode_detection: ['speed_HF', 'longitudinalAccelerationFromSpeed'],
    stop_launch_detection: ['speed_HF', 'powertrainTransmissionActualGear'],
    stable_cruise_recognition: ['speed_HF', 'speed_LIVE'],
    shift_detection: ['powertrainTransmissionActualGear', 'powertrainCombustionEngineSpeed'],
    direction_detection: ['powertrainTransmissionActualGear', 'speed_HF'],
    instantaneous_harsh_event_timing: ['speed_HF', 'jerkFromAcceleration'],
    longitudinal_acceleration_reconstruction: ['longitudinalAccelerationFromSpeed', 'speed_HF'],
    jerk_reconstruction: ['jerkFromAcceleration'],
    powertrain_stress_estimation: ['powertrainCombustionEngineSpeed', 'obdEngineLoad', 'obdThrottlePosition'],
    near_realtime_feedback: ['speed_LIVE', 'synqReceivedAt'],
    post_trip_scoring: ['speed_HF', 'powertrainCombustionEngineSpeed'],
  };

  for (const useCase of USE_CASE_IDS) {
    matrix[useCase] = {};
    const keys = useCaseSignalMap[useCase] ?? [];
    for (const sig of [...CORE_AUDIT_SIGNALS, ...DERIVED_SIGNALS, 'providerTimestamp', 'synqReceivedAt']) {
      const hfKey = sig === 'speed' ? 'speed_HF' : sig;
      const rating = keys.includes(hfKey) || keys.includes(sig)
        ? signalRatings[hfKey] ?? signalRatings[sig] ?? 'D'
        : 'D';
      matrix[useCase][sig] = rating;
    }
  }

  return matrix;
}

export function buildSignalClassifications(params: {
  surfaceMatrix: Record<string, Record<string, Record<string, unknown>>>;
  speedValidation: Record<string, unknown>;
  derivedAccel: Record<string, unknown>;
  jerkQuality: Record<string, unknown>;
  gearDirection: Record<string, unknown>;
  powertrainCorrelation: Record<string, unknown>;
}): Record<string, SignalRatingEvidence> {
  const alignmentFitMae = params.speedValidation.HF_SPEED_ALIGNMENT_FIT_MAE_KMH as number | null;
  const withinClipHoldoutMae = params.speedValidation.HF_SPEED_WITHIN_CLIP_HOLDOUT_MAE_KMH as number | null;
  const uniqueHoldoutMae = params.speedValidation.UNIQUE_ALIGNMENT_HOLDOUT_MAE_KMH as number | null;
  const uniqueHoldoutClips = params.speedValidation.UNIQUE_ALIGNMENT_HOLDOUT_CLIPS as number;
  const liveMatched = (params.speedValidation.aggregateLATEST_LIVE as { matchedPoints?: number })
    ?.matchedPoints ?? 0;
  const liveCadence = (
    params.surfaceMatrix.speed?.LATEST_LIVE?.NEW_PHYSICAL_SAMPLE_CADENCE as { medianSeconds?: number }
  )?.medianSeconds;
  const liveStale = (params.surfaceMatrix.speed?.LATEST_LIVE?.STALE_HOLD as { count?: number })?.count ?? 0;
  const accel24 = (params.derivedAccel.policies as Record<string, unknown>)?.maxGap_2s as
    | { qualifiedPointFraction?: number; implausibleAccelerationFraction?: number }
    | undefined;
  const powertrainInterp =
    (params.powertrainCorrelation.signalInterpretations as Record<string, SignalRatingEvidence>) ?? {};

  return {
    SPEED: {
      RATING: 'USEFUL_WITH_GATING',
      EVIDENCE_BASIS: `HF alignment-fit MAE=${alignmentFitMae?.toFixed(2) ?? 'n/a'} km/h; within-clip holdout MAE=${withinClipHoldoutMae?.toFixed(2) ?? 'n/a'} (generalization evidence only); unique-alignment holdout MAE=${uniqueHoldoutMae?.toFixed(2) ?? 'n/a'} across ${uniqueHoldoutClips} evaluated holdout clip${uniqueHoldoutClips === 1 ? '' : 's'}`,
      LIMITATION: 'INDEPENDENT_ABSOLUTE_ACCURACY_VALIDATED=NO; IN_SAMPLE_ALIGNMENT_FIT_NOT_INDEPENDENT_ACCURACY',
    },
    RPM: powertrainInterp.powertrainCombustionEngineSpeed ?? {
      RATING: 'USEFUL_WITH_GATING',
      EVIDENCE_BASIS: 'Tier B event-correlated support',
      LIMITATION: 'Not direct video GT',
    },
    THROTTLE: powertrainInterp.obdThrottlePosition ?? {
      RATING: 'SECONDARY_DEMAND_CONTEXT',
      EVIDENCE_BASIS: 'Tier B lag/event analysis',
      LIMITATION: 'Separate from TPS',
    },
    TPS: powertrainInterp.powertrainCombustionEngineTPS ?? {
      RATING: 'SECONDARY_DEMAND_CONTEXT',
      EVIDENCE_BASIS: 'Tier B lag/event analysis',
      LIMITATION: 'Separate from obdThrottlePosition',
    },
    ENGINE_LOAD: powertrainInterp.obdEngineLoad ?? {
      RATING: 'CONTEXT_ONLY',
      EVIDENCE_BASIS: 'Powertrain demand context',
      LIMITATION: 'Not vehicle mass/payload',
    },
    ACTUAL_GEAR: {
      RATING: 'CONTEXT_ONLY',
      EVIDENCE_BASIS: `GEAR_STATE_OBSERVABILITY=${params.gearDirection.GEAR_STATE_OBSERVABILITY}`,
      LIMITATION: 'GEAR_CHANGE_TIMING_OBSERVABILITY=NO',
    },
    GEAR_RATIO: {
      RATING: 'CONTEXT_ONLY',
      EVIDENCE_BASIS: 'State context on LATEST_SLOW',
      LIMITATION: 'Slow cadence; not timing authority',
    },
    DERIVED_ACCELERATION: {
      RATING:
        (accel24?.qualifiedPointFraction ?? 0) >= 0.6 ? 'USEFUL_WITH_GATING' : 'WEAK',
      EVIDENCE_BASIS: `qualifiedPointFraction@2s=${accel24?.qualifiedPointFraction?.toFixed(2) ?? 'n/a'}; implausibleFraction=${accel24?.implausibleAccelerationFraction?.toFixed(2) ?? 'n/a'}`,
      LIMITATION: 'Derived from speed cadence; not direct GT',
    },
    DERIVED_JERK: {
      RATING: String(params.jerkQuality.DERIVED_JERK_CLASSIFICATION) === 'NOT_RELIABLE' ? 'NOT_RELIABLE' : 'WEAK',
      EVIDENCE_BASIS: `classification=${params.jerkQuality.DERIVED_JERK_CLASSIFICATION}`,
      LIMITATION: 'Episode context only; high Δt sensitivity',
    },
    PROVIDER_TIMESTAMP: {
      RATING: 'BEST_AVAILABLE_PHYSICAL_EVENT_TIME_AUTHORITY',
      EVIDENCE_BASIS: 'Best available physical-event timeline in RD003 capture',
      LIMITATION: 'Not independently proven raw ECU sample time',
    },
    SYNQ_RECEIVED_AT: {
      RATING: 'NOT_RELIABLE',
      EVIDENCE_BASIS: 'Delivery/ingress timing only; INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS=0',
      LIMITATION: 'Must not anchor physical driving events',
    },
    LATEST_LIVE_SPEED: {
      RATING: 'CONTEXT_WITH_FRESHNESS_GATING',
      EVIDENCE_BASIS: `directVideoMatchedPoints=${liveMatched}; medianCadence≈${liveCadence?.toFixed(1) ?? 'n/a'}s; staleHolds=${liveStale}`,
      LIMITATION: 'LATEST_LIVE_DIRECT_VIDEO_VALIDATION=INSUFFICIENT_EVIDENCE; surface name does not imply freshness',
    },
  };
}

export function classifySignalUsability(
  field: string,
  surface: AcquisitionSurface,
  entry: Record<string, unknown>,
  speedAlignmentFitMae?: number | null,
): SignalUsabilityClass {
  if (entry.status === 'NOT_OBSERVED') return 'NOT_RELIABLE';
  const staleCount = (entry.STALE_HOLD as { count?: number })?.count ?? 0;
  const dynamics = String(entry.dynamicsClassification ?? '');
  const medianCadence = (entry.NEW_PHYSICAL_SAMPLE_CADENCE as { medianSeconds?: number })?.medianSeconds ?? null;

  if (field === 'speed' && surface === 'HF_HISTORICAL') {
    if (speedAlignmentFitMae != null && speedAlignmentFitMae <= 10) return 'USEFUL_WITH_GATING';
    return 'USEFUL_WITH_GATING';
  }
  if (field === 'speed' && surface === 'LATEST_LIVE') {
    return 'CONTEXT_ONLY';
  }
  if (field === 'obdEngineLoad') return 'CONTEXT_ONLY';
  if (
    field === 'powertrainTransmissionActualGear' ||
    field === 'powertrainTransmissionActualGearRatio'
  ) {
    return 'CONTEXT_ONLY';
  }
  if (field === 'obdThrottlePosition' || field === 'powertrainCombustionEngineTPS') {
    return dynamics === 'DYNAMICALLY_INFORMATIVE' ? 'USEFUL_WITH_GATING' : 'CONTEXT_ONLY';
  }
  if (field === 'powertrainCombustionEngineSpeed') {
    return dynamics === 'DYNAMICALLY_INFORMATIVE' && (medianCadence ?? 99) <= 5
      ? 'USEFUL_WITH_GATING'
      : 'CONTEXT_ONLY';
  }
  return 'WEAK';
}

export function buildSignalAuthorityModel(params: {
  surfaceMatrix: Record<string, Record<string, Record<string, unknown>>>;
  speedValidation: Record<string, unknown>;
}): Record<string, unknown> {
  const alignmentFitMae = params.speedValidation.HF_SPEED_ALIGNMENT_FIT_MAE_KMH as number | null;
  return {
    PRIMARY_KINEMATIC_AUTHORITY: ['speed (HF_HISTORICAL, providerTimestamp-aligned)'],
    SECONDARY_DYNAMIC_CONFIRMATION: [
      'powertrainCombustionEngineSpeed (HF_HISTORICAL, event-correlated)',
    ],
    POWERTRAIN_CONTEXT_SIGNALS: [
      'obdThrottlePosition',
      'powertrainCombustionEngineTPS',
      'obdEngineLoad',
    ],
    STATE_CONTEXT_SIGNALS: [
      'powertrainTransmissionActualGear',
      'powertrainTransmissionActualGearRatio',
    ],
    DELIVERY_ONLY_TIMESTAMPS: ['synqReceivedAt', 'requestStartedAt (ingress boundary)'],
    UNSUITABLE_DIRECT_AUTHORITIES: [
      'synqReceivedAt as physical event time',
      'LATEST_LIVE without stale-hold gating',
      'obdEngineLoad as vehicle mass/payload',
      'unsigned speed alone for direction',
      'jerk without cadence qualification',
      'alignment-fit MAE as independent speed accuracy',
    ],
    proposedConfidenceFactors: [
      'sampleCadenceMedianSeconds',
      'providerSampleAgeP90Seconds',
      'staleHoldDurationSeconds',
      'acquisitionSurface',
      'supportingSignalAgreementCount',
      'alignmentBasinCoverage',
      'interpolationGapSeconds',
      'missingnessRate',
      'holdoutValidationMae',
      'negativeControlArtificialDynamics',
    ],
    HF_SPEED_ALIGNMENT_FIT_MAE_KMH: alignmentFitMae,
    IN_SAMPLE_ALIGNMENT_FIT_NOT_INDEPENDENT_ACCURACY: 'YES',
    note: 'Proposed architecture only — not implemented in production Driving Score',
  };
}

export function buildSignalQualitySummary(params: {
  surfaceMatrix: Record<string, Record<string, Record<string, unknown>>>;
  speedValidation: Record<string, unknown>;
  derivedAccel: Record<string, unknown>;
  jerkQuality: Record<string, unknown>;
  gearDirection: Record<string, unknown>;
  powertrainCorrelation: Record<string, unknown>;
  authorityModel: Record<string, unknown>;
  discoverySummary: Record<string, unknown>;
  negativeControls: Record<string, unknown>[];
}): Record<string, unknown> {
  const alignmentFitMae = params.speedValidation.HF_SPEED_ALIGNMENT_FIT_MAE_KMH as number | null;
  const withinClipHoldoutMae = params.speedValidation.HF_SPEED_WITHIN_CLIP_HOLDOUT_MAE_KMH as number | null;
  const hfCadence = (
    params.surfaceMatrix.speed?.HF_HISTORICAL?.NEW_PHYSICAL_SAMPLE_CADENCE as {
      medianSeconds?: number;
    }
  )?.medianSeconds;
  const liveCadence = (
    params.surfaceMatrix.speed?.LATEST_LIVE?.NEW_PHYSICAL_SAMPLE_CADENCE as {
      medianSeconds?: number;
    }
  )?.medianSeconds;
  const classifications = buildSignalClassifications({
    surfaceMatrix: params.surfaceMatrix,
    speedValidation: params.speedValidation,
    derivedAccel: params.derivedAccel,
    jerkQuality: params.jerkQuality,
    gearDirection: params.gearDirection,
    powertrainCorrelation: params.powertrainCorrelation,
  });

  const humanSummary: Record<string, string> = {
    SPEED: classifications.SPEED.RATING,
    RPM: classifications.RPM.RATING,
    THROTTLE: classifications.THROTTLE.RATING,
    TPS: classifications.TPS.RATING,
    ENGINE_LOAD: classifications.ENGINE_LOAD.RATING,
    ACTUAL_GEAR: classifications.ACTUAL_GEAR.RATING,
    GEAR_RATIO: classifications.GEAR_RATIO.RATING,
    DERIVED_ACCELERATION: classifications.DERIVED_ACCELERATION.RATING,
    DERIVED_JERK: classifications.DERIVED_JERK.RATING,
    PROVIDER_TIMESTAMP: classifications.PROVIDER_TIMESTAMP.RATING,
    SYNQ_RECEIVED_AT: classifications.SYNQ_RECEIVED_AT.RATING,
  };

  const nc2804 = params.negativeControls.find((n) => n.fileName === 'IMG_2804.mp4');
  const nc2809 = params.negativeControls.find((n) => n.fileName === 'IMG_2809.mp4');

  return {
    evidenceId: SIGNAL_QUALITY_EVIDENCE_ID,
    closeoutRevision: SIGNAL_QUALITY_CLOSEOUT_REVISION,
    analysisMode: SIGNAL_QUALITY_MODE,
    evidenceClass: 'SIGNAL_QUALITY+DRIVING_INTELLIGENCE_FOUNDATION',
    GROUND_TRUTH_VALIDATED: 'NO',
    INDEPENDENT_ABSOLUTE_ACCURACY_VALIDATED: 'NO',
    INDEPENDENT_ABSOLUTE_SPEED_ACCURACY_VALIDATED: 'NO',
    DRIVING_SCORE_CHANGED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    whatWeKnow: [
      'HF speed contains recoverable driving dynamics',
      'HF physical cadence is approximately 2 s median in RD003',
      'providerTimestamp is the best available event-time authority',
      'gear state is observable; precise gear-change timing is not',
      'LATEST_LIVE direct video evidence is insufficient',
    ],
    whatRd003SupportsButDoesNotYetProve: [
      'approximate speed accuracy',
      'throttle/TPS/RPM usefulness across arbitrary trips',
      'negative-control artificial dynamics',
      'reliable reconstructed acceleration thresholds',
    ],
    whatRd004ShouldValidate: [
      'absolute speed accuracy',
      'temporal event accuracy',
      'acceleration reconstruction accuracy',
      'negative-control false-event rate',
      'RPM/throttle/TPS event confirmation',
      'provider timestamp offset/drift',
    ],
    whatWeMustNotClaim: [
      'Independent absolute DIMO speed accuracy from RD003 alone',
      'Exact jerk/acceleration accuracy without suitable GT',
      'LATEST_LIVE freshness by surface name',
      'Exact gear-change timing from current cadence',
      'Negative-control artificial dynamics as authoritative proof under ambiguous alignment',
    ],
    humanSummary,
    signalClassifications: classifications,
    HF_SPEED_VIDEO_VALIDATION_SUPPORTED:
      (params.speedValidation.qualifiedStrongBasinClips as number) > 0 ? 'YES' : 'NO',
    HF_SPEED_ALIGNMENT_FIT_MAE_KMH: alignmentFitMae,
    HF_SPEED_WITHIN_CLIP_HOLDOUT_MAE_KMH: withinClipHoldoutMae,
    HF_SPEED_INDEPENDENT_ABSOLUTE_ACCURACY_MAE_KMH: null,
    WITHIN_CLIP_HOLDOUT_IMPROVES_GENERALIZATION_EVIDENCE: 'YES',
    IN_SAMPLE_ALIGNMENT_FIT_NOT_INDEPENDENT_ACCURACY: 'YES',
    UNIQUE_ALIGNMENT_SUPPORTED_CLIPS: params.speedValidation.UNIQUE_ALIGNMENT_SUPPORTED_CLIPS,
    AMBIGUOUS_CLIPS_WITH_STRONG_SPEED_BASIN:
      params.speedValidation.AMBIGUOUS_CLIPS_WITH_STRONG_SPEED_BASIN,
    UNIQUE_ALIGNMENT_HOLDOUT_CLIPS: params.speedValidation.UNIQUE_ALIGNMENT_HOLDOUT_CLIPS,
    UNIQUE_ALIGNMENT_HOLDOUT_MAE_KMH: params.speedValidation.UNIQUE_ALIGNMENT_HOLDOUT_MAE_KMH,
    AMBIGUOUS_ALIGNMENT_HOLDOUT_CLIPS: params.speedValidation.AMBIGUOUS_ALIGNMENT_HOLDOUT_CLIPS,
    AMBIGUOUS_ALIGNMENT_HOLDOUT_MAE_KMH: params.speedValidation.AMBIGUOUS_ALIGNMENT_HOLDOUT_MAE_KMH,
    POWERTRAIN_UNIQUE_ALIGNMENT_EPISODES: params.powertrainCorrelation.UNIQUE_ALIGNMENT_EPISODES,
    POWERTRAIN_AMBIGUOUS_DIAGNOSTIC_EPISODES:
      params.powertrainCorrelation.AMBIGUOUS_ALIGNMENT_DIAGNOSTIC_EPISODES,
    NEGATIVE_CONTROL_UNIQUE_ALIGNMENT_VALIDATED:
      params.speedValidation.NEGATIVE_CONTROL_UNIQUE_ALIGNMENT_VALIDATED ?? 'NO',
    HF_SPEED_TEMPORAL_RESOLUTION:
      hfCadence != null ? `~${hfCadence.toFixed(2)}s median new physical sample` : null,
    LATEST_LIVE_DIRECT_VIDEO_VALIDATION: 'INSUFFICIENT_EVIDENCE',
    LATEST_LIVE_GENERAL_DATA_UTILITY: 'CONTEXT_WITH_FRESHNESS_GATING',
    LATEST_LIVE_OBSERVED_MEDIAN_CADENCE_SECONDS: liveCadence,
    PROVIDER_TIME_PHYSICAL_EVENT_USEFULNESS: 'BEST_AVAILABLE_PHYSICAL_EVENT_TIME_AUTHORITY',
    INGRESS_TIME_PHYSICAL_EVENT_USEFULNESS: 'NOT_RELIABLE',
    DERIVED_ACCELERATION_CLASSIFICATION: classifications.DERIVED_ACCELERATION.RATING,
    DERIVED_ACCELERATION_PROVISIONAL_MAX_GAP: 'ANALYSIS_ONLY — no production threshold selected',
    DERIVED_JERK_CLASSIFICATION: params.jerkQuality.DERIVED_JERK_CLASSIFICATION,
    RPM_CLASSIFICATION: classifications.RPM.RATING,
    THROTTLE_CLASSIFICATION: classifications.THROTTLE.RATING,
    TPS_CLASSIFICATION: classifications.TPS.RATING,
    ENGINE_LOAD_CLASSIFICATION: classifications.ENGINE_LOAD.RATING,
    GEAR_STATE_CLASSIFICATION: classifications.ACTUAL_GEAR.RATING,
    GEAR_TIMING_CLASSIFICATION: params.gearDirection.PRECISE_SHIFT_TIMING_USEFUL === 'NO' ? 'NOT_SUPPORTED' : 'PARTIAL',
    NEGATIVE_CONTROL_IMG_2804: nc2804?.NEGATIVE_CONTROL_ARTIFICIAL_DYNAMICS ?? 'INSUFFICIENT_EVIDENCE',
    NEGATIVE_CONTROL_IMG_2809: nc2809?.NEGATIVE_CONTROL_ARTIFICIAL_DYNAMICS ?? 'INSUFFICIENT_EVIDENCE',
    NEGATIVE_CONTROL_IMG_2804_AUTHORITY: nc2804?.NEGATIVE_CONTROL_AUTHORITY ?? null,
    NEGATIVE_CONTROL_IMG_2809_AUTHORITY: nc2809?.NEGATIVE_CONTROL_AUTHORITY ?? null,
    DIRECTION_RECONSTRUCTION_CAPABILITY: params.gearDirection.DIRECTION_RECONSTRUCTION_CAPABILITY,
    OFFLINE_TRIP_RECONSTRUCTION_READINESS: 'READY_WITH_GATING',
    NEAR_REALTIME_FEEDBACK_READINESS: 'NOT_READY',
    POST_TRIP_DRIVING_SCORE_READINESS: 'FOUNDATION_ONLY_NOT_PRODUCTION',
    ...params.authorityModel,
    SIGNALS_SAFE_FOR_FUTURE_DRIVING_SCORE: ['speed (HF_HISTORICAL, gated, confidence-scored)'],
    SIGNALS_REQUIRING_CONFIDENCE_GATING: [
      'powertrainCombustionEngineSpeed',
      'obdThrottlePosition',
      'powertrainCombustionEngineTPS',
      'derived longitudinal acceleration',
      'LATEST_LIVE speed (freshness-gated only)',
    ],
    SIGNALS_NOT_SAFE_AS_DIRECT_SCORE_INPUT: [
      'synqReceivedAt',
      'obdEngineLoad as mass proxy',
      'jerk (raw)',
      'gear timing without cadence proof',
      'unsigned speed for direction',
      'alignment-fit MAE as accuracy claim',
    ],
    PRIOR_ALIGNMENT_STATE: {
      HF_SPEED_ALIGNMENT_V2_CONCLUSION: params.discoverySummary.HF_SPEED_ALIGNMENT_V2_CONCLUSION,
      JOINT_PATH_FOUND: params.discoverySummary.JOINT_PATH_FOUND,
      INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS:
        params.discoverySummary.INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS,
    },
    READY_FOR_DI_EV_0034F_DRIVING_INTELLIGENCE_DESIGN: 'YES',
  };
}

export function runRd003SignalQualityInterpretation(params: {
  telemetryRows: VideoGtExportedRow[];
  externalGt: ExternalGtDocument;
}): {
  signalSurfaceQualityMatrix: Record<string, unknown>;
  speedVideoValidation: Record<string, unknown>;
  cadenceAndStaleness: Record<string, unknown>;
  derivedAccelerationQuality: Record<string, unknown>;
  jerkQuality: Record<string, unknown>;
  powertrainSignalCorrelation: Record<string, unknown>;
  gearDirectionQuality: Record<string, unknown>;
  useCaseEligibilityMatrix: Record<string, unknown>;
  signalQualitySummary: Record<string, unknown>;
} {
  const discovery = runGlobalFingerprintDiscoveryV2({
    telemetryRows: params.telemetryRows,
    externalGt: params.externalGt,
  });

  const signalSurfaceQualityMatrix = buildSignalSurfaceQualityMatrix(params.telemetryRows);
  const speedVideoValidation = buildSpeedVideoValidation({
    externalGt: params.externalGt,
    perClipDiscoveries: discovery.perClipDiscoveries,
    telemetryRows: params.telemetryRows,
  });
  const cadenceAndStaleness = buildCadenceAndStaleness(params.telemetryRows);
  const derivedAccelerationQuality = buildDerivedAccelerationQuality(
    params.telemetryRows,
    speedVideoValidation.negativeControls as Record<string, unknown>[],
  );
  const jerkQuality = buildJerkQuality(derivedAccelerationQuality);
  const powertrainSignalCorrelation = buildPowertrainSignalCorrelation({
    perClipDiscoveries: discovery.perClipDiscoveries,
    externalGt: params.externalGt,
    telemetryRows: params.telemetryRows,
  });
  const gearDirectionQuality = buildGearDirectionQuality({
    externalGt: params.externalGt,
    telemetryRows: params.telemetryRows,
  });
  const useCaseEligibilityMatrix = buildUseCaseEligibilityMatrix({
    surfaceMatrix: signalSurfaceQualityMatrix as Record<string, Record<string, Record<string, unknown>>>,
    speedValidation: speedVideoValidation,
    derivedAccel: derivedAccelerationQuality,
    gearDirection: gearDirectionQuality,
    powertrainCorrelation: powertrainSignalCorrelation,
  });
  const authorityModel = buildSignalAuthorityModel({
    surfaceMatrix: signalSurfaceQualityMatrix as Record<string, Record<string, Record<string, unknown>>>,
    speedValidation: speedVideoValidation,
  });
  const signalQualitySummary = buildSignalQualitySummary({
    surfaceMatrix: signalSurfaceQualityMatrix as Record<string, Record<string, Record<string, unknown>>>,
    speedValidation: speedVideoValidation,
    derivedAccel: derivedAccelerationQuality,
    jerkQuality,
    gearDirection: gearDirectionQuality,
    powertrainCorrelation: powertrainSignalCorrelation,
    authorityModel,
    discoverySummary: discovery.discoverySummary,
    negativeControls: speedVideoValidation.negativeControls as Record<string, unknown>[],
  });

  return {
    signalSurfaceQualityMatrix,
    speedVideoValidation,
    cadenceAndStaleness,
    derivedAccelerationQuality,
    jerkQuality,
    powertrainSignalCorrelation,
    gearDirectionQuality,
    useCaseEligibilityMatrix,
    signalQualitySummary,
  };
}

export function signalQualityOutputSha256(outputs: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(stableStringify(outputs)).digest('hex');
}
