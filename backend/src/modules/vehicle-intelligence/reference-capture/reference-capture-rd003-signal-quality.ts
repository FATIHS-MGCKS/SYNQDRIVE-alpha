/**
 * DI-EV-0034E — RD003 Signal Quality Interpretation + Driving Intelligence Usability Matrix.
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
  stableStringify,
  SURFACE_INTERPOLATION_GAP_SECONDS,
  type AcquisitionSurface,
  type ExternalGtClip,
  type ExternalGtDocument,
  type SpeedSeriesPoint,
} from './reference-capture-rd003-video-gt-alignment';
import {
  dedupePhysicalSamples,
  runGlobalFingerprintDiscoveryV2,
  type BasinV2Result,
  type ClipDiscoveryV2Result,
} from './reference-capture-rd003-video-gt-global-discovery-v2';

export const SIGNAL_QUALITY_EVIDENCE_ID = 'DI-EV-0034E';
export const SIGNAL_QUALITY_MODE = 'RD003_SIGNAL_QUALITY_INTERPRETATION';

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

  return {
    OBSERVATION_COUNT: subset.length,
    UNIQUE_PHYSICAL_SAMPLE_COUNT: physicalCadence.UNIQUE_PHYSICAL_SAMPLE_COUNT,
    SESSION_COVERAGE: 'FULL_SESSION',
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
    LATEST_LIVE_EQUALS_FRESH_PHYSICAL_SAMPLE: 'NO',
    freshnessEvaluatedBySurfaceName: 'YES',
    PHYSICAL_EVENT_TIME_AUTHORITY: 'providerTimestamp',
    DELIVERY_TIME: 'synqReceivedAt',
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
  const hfErrors: number[] = [];
  const liveErrors: number[] = [];
  const negativeControls: Record<string, unknown>[] = [];

  for (const disc of params.perClipDiscoveries) {
    const clip = params.externalGt.clips.find((c) => c.clipId === disc.clipId);
    if (!clip) continue;
    const basin = selectStrongBasinPerClip(disc);
    if (!basin || basin.status !== 'STRONG_CANDIDATE') continue;

    const hfSeries = buildSpeedSeries(
      filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', 'HF_HISTORICAL'),
    );
    const liveSeries = buildSpeedSeries(
      filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', 'LATEST_LIVE'),
    );

    const hf = scoreSpeedAtGtPoints({ clip, basin, speedSeries: hfSeries, surface: 'HF_HISTORICAL' });
    const live = scoreSpeedAtGtPoints({ clip, basin, speedSeries: liveSeries, surface: 'LATEST_LIVE' });

    hfErrors.push(...hf.absErrors);
    liveErrors.push(...live.absErrors);

    const episode: Record<string, unknown> = {
      clipId: disc.clipId,
      fileName: disc.fileName,
      evidenceTier: 'TIER_A_DIRECT_VIDEO_VALIDATION',
      independentStatus: disc.HF_HISTORICAL.independentStatus,
      basinStatus: basin.status,
      alignedClipStartUtc: basin.alignedClipStartUtc,
      basinMAE: basin.MAE,
      HF_HISTORICAL: {
        matchedGtCount: hf.matched,
        eligibleGtCount: hf.total,
        MAE: mean(hf.absErrors),
        RMSE: rmse(hf.absErrors.map((e, i) => hf.telemValues[i]! - hf.gtValues[i]!)),
        maxAbsError: hf.absErrors.length ? Math.max(...hf.absErrors) : null,
        shapeCorrelation: pearsonCorrelation(hf.gtValues, hf.telemValues),
      },
      LATEST_LIVE: {
        matchedGtCount: live.matched,
        eligibleGtCount: live.total,
        MAE: mean(live.absErrors),
        RMSE: rmse(live.absErrors.map((e, i) => live.telemValues[i]! - live.gtValues[i]!)),
        maxAbsError: live.absErrors.length ? Math.max(...live.absErrors) : null,
        shapeCorrelation: pearsonCorrelation(live.gtValues, live.telemValues),
      },
    };

    if (clip.negativeControl) {
      const cruiseObs = clip.observations.filter(
        (o) =>
          o.observationType === 'CRUISE_STABLE' ||
          (o.observationType === 'SPEED' && o.videoTimeSeconds != null && o.videoTimeSeconds <= 25),
      );
      const cruiseErrors = hf.absErrors;
      const cruiseNoise = cruiseErrors.length ? stddev(cruiseErrors) : null;
      negativeControls.push({
        clipId: clip.clipId,
        fileName: clip.fileName,
        negativeControl: true,
        cruiseObservationCount: cruiseObs.length,
        hfSpeedErrorStdDevKmh: cruiseNoise,
        artificialMotionRisk:
          cruiseNoise != null && cruiseNoise > 3 ? 'ELEVATED' : 'LOW',
        note: 'Negative control — stable cruise should not show large artificial speed dynamics',
      });
    }

    clipResults.push(episode);
  }

  return {
    evidenceTier: 'TIER_A_DIRECT_VIDEO_VALIDATION',
    evidenceClass: 'DIRECT_VIDEO_VALIDATION',
    GROUND_TRUTH_VALIDATED: 'NO',
    qualifiedStrongBasinClips: clipResults.length,
    aggregateHF: {
      MAE: mean(hfErrors),
      RMSE: rmse(hfErrors),
      maxAbsError: hfErrors.length ? Math.max(...hfErrors) : null,
      matchedPoints: hfErrors.length,
    },
    aggregateLATEST_LIVE: {
      MAE: mean(liveErrors),
      RMSE: rmse(liveErrors),
      maxAbsError: liveErrors.length ? Math.max(...liveErrors) : null,
      matchedPoints: liveErrors.length,
    },
    perClip: clipResults,
    negativeControls,
    note: 'Uses per-clip STRONG_CANDIDATE HF basins only — not a validated nine-clip absolute chronology',
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
    const jerk = deriveJerkFromAcceleration(accel);
    const reliableJerk = jerk.filter((p) => p.reliable);
    policies[`maxGap_${maxGap}s`] = {
      maxGapSeconds: maxGap,
      totalAccelerationPoints: accel.length,
      reliableAccelerationPoints: reliable.length,
      reliableAccelerationFraction: accel.length ? reliable.length / accel.length : 0,
      accelerationNoiseStdMps2: stddev(reliable.map((p) => p.accelerationMps2)),
      totalJerkPoints: jerk.length,
      reliableJerkPoints: reliableJerk.length,
      reliableJerkFraction: jerk.length ? reliableJerk.length / jerk.length : 0,
      jerkNoiseStdMps3: stddev(reliableJerk.map((p) => p.jerkMps3)),
    };
  }

  return {
    evidenceClass: 'DERIVED_KINEMATIC_ANALYSIS',
    sourceSignal: 'speed',
    sourceSurface: 'HF_HISTORICAL',
    physicalDeltaTAuthority: 'providerTimestamp',
    staleHoldExcluded: 'YES',
    policies,
    note: 'Provisional gap policies — no production threshold selected',
  };
}

export function buildJerkQuality(derivedAccel: Record<string, unknown>): Record<string, unknown> {
  const policies = derivedAccel.policies as Record<string, Record<string, unknown>>;
  const policy24 = policies?.maxGap_2s ?? policies?.['maxGap_2s'];
  const reliableFrac = (policy24?.reliableJerkFraction as number) ?? 0;
  return {
    evidenceClass: 'DERIVED_KINEMATIC_ANALYSIS',
    JERK_DIRECT_USE:
      reliableFrac >= 0.5 ? 'EPISODE_CONTEXT_ONLY' : 'NOT_RELIABLE',
    JERK_EPISODE_CONTEXT_ONLY: reliableFrac >= 0.25 ? 'YES' : 'NO',
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
    providerTimestampAuthority: 'PHYSICAL_EVENT_CANDIDATE',
    synqReceivedAtAuthority: 'DELIVERY_ONLY',
  };
}

export function buildPowertrainSignalCorrelation(params: {
  perClipDiscoveries: ClipDiscoveryV2Result[];
  externalGt: ExternalGtDocument;
  telemetryRows: VideoGtExportedRow[];
}): Record<string, unknown> {
  const episodes: Record<string, unknown>[] = [];
  const signals = [
    'powertrainCombustionEngineSpeed',
    'obdThrottlePosition',
    'powertrainCombustionEngineTPS',
    'obdEngineLoad',
  ] as const;

  for (const disc of params.perClipDiscoveries) {
    const clip = params.externalGt.clips.find((c) => c.clipId === disc.clipId);
    const basin = selectStrongBasinPerClip(disc);
    if (!clip || !basin || basin.status !== 'STRONG_CANDIDATE') continue;
    if (basin.coverage < 0.5) continue;

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
      const speedVals: number[] = [];
      const sigVals: number[] = [];
      for (const sp of hfSpeed) {
        const near = rows
          .map((r) => ({ ms: parseMs(r.providerTimestamp), v: extractNumericValue(r.rawValueJson) }))
          .filter((x) => x.ms != null && x.v != null && Math.abs(x.ms! - sp.utcMs) < 1500);
        if (near.length === 0) continue;
        const best = near.sort((a, b) => Math.abs(a.ms! - sp.utcMs) - Math.abs(b.ms! - sp.utcMs))[0]!;
        speedVals.push(sp.value);
        sigVals.push(best.v!);
      }
      signalStats[field] = {
        observationCount: rows.length,
        dynamicsClassification: dynamics.classification,
        speedCorrelation: pearsonCorrelation(speedVals, sigVals),
        evidenceClass: 'ALIGNED_EVENT_CORRELATED_SUPPORT',
        note: 'Not direct video GT validation',
      };
    }

    episodes.push({
      clipId: disc.clipId,
      fileName: disc.fileName,
      evidenceTier: 'TIER_B_ALIGNED_EVENT_CORRELATION',
      alignedClipStartUtc: basin.alignedClipStartUtc,
      signals: signalStats,
    });
  }

  return {
    evidenceTier: 'TIER_B_ALIGNED_EVENT_CORRELATION',
    episodeCount: episodes.length,
    episodes,
    ENGINE_LOAD_INTERPRETATION:
      'Powertrain demand context only — not vehicle mass/payload/road load',
    note: 'Correlation within qualified STRONG_CANDIDATE speed-aligned windows',
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
}): Record<string, Record<string, EligibilityRating>> {
  const matrix: Record<string, Record<string, EligibilityRating>> = {};
  const speedHf = params.surfaceMatrix.speed?.HF_HISTORICAL ?? {};
  const speedLive = params.surfaceMatrix.speed?.LATEST_LIVE ?? {};
  const hfMae = (params.speedValidation.aggregateHF as { MAE?: number })?.MAE ?? 99;
  const accelPolicy = (params.derivedAccel.policies as Record<string, unknown>)?.maxGap_2s as
    | { reliableAccelerationFraction?: number }
    | undefined;

  const signalRatings: Record<string, EligibilityRating> = {
    speed_HF: hfMae <= 8 ? 'A' : hfMae <= 15 ? 'B' : 'C',
    speed_LIVE: (speedLive.STALE_HOLD as { count?: number })?.count ? 'B' : 'C',
    powertrainCombustionEngineSpeed:
      rateFromDynamics(
        String(params.surfaceMatrix.powertrainCombustionEngineSpeed?.HF_HISTORICAL?.dynamicsClassification ?? 'UNKNOWN'),
        Number((params.surfaceMatrix.powertrainCombustionEngineSpeed?.LATEST_LIVE?.STALE_HOLD as { count?: number })?.count ?? 0),
        (params.surfaceMatrix.powertrainCombustionEngineSpeed?.HF_HISTORICAL?.NEW_PHYSICAL_SAMPLE_CADENCE as { medianSeconds?: number })?.medianSeconds ?? null,
      ),
    obdThrottlePosition: 'B',
    powertrainCombustionEngineTPS: 'B',
    obdEngineLoad: 'C',
    powertrainTransmissionActualGear: 'C',
    powertrainTransmissionActualGearRatio: 'C',
    longitudinalAccelerationFromSpeed:
      (accelPolicy?.reliableAccelerationFraction ?? 0) >= 0.7 ? 'B' : 'C',
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

export function classifySignalUsability(
  field: string,
  surface: AcquisitionSurface,
  entry: Record<string, unknown>,
  speedMae?: number | null,
): SignalUsabilityClass {
  if (entry.status === 'NOT_OBSERVED') return 'NOT_RELIABLE';
  const staleCount = (entry.STALE_HOLD as { count?: number })?.count ?? 0;
  const dynamics = String(entry.dynamicsClassification ?? '');
  const medianCadence = (entry.NEW_PHYSICAL_SAMPLE_CADENCE as { medianSeconds?: number })?.medianSeconds ?? null;

  if (field === 'speed' && surface === 'HF_HISTORICAL') {
    if (speedMae != null && speedMae <= 8) return 'STRONG';
    if (speedMae != null && speedMae <= 15) return 'USEFUL_WITH_GATING';
    return 'USEFUL_WITH_GATING';
  }
  if (field === 'speed' && surface === 'LATEST_LIVE') {
    return staleCount > 0 ? 'USEFUL_WITH_GATING' : 'CONTEXT_ONLY';
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
  const hfMae = (params.speedValidation.aggregateHF as { MAE?: number | null })?.MAE ?? null;
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
    ],
    HF_SPEED_TYPICAL_ERROR_KMH: hfMae,
    note: 'Proposed architecture only — not implemented in production Driving Score',
  };
}

export function buildSignalQualitySummary(params: {
  surfaceMatrix: Record<string, Record<string, Record<string, unknown>>>;
  speedValidation: Record<string, unknown>;
  derivedAccel: Record<string, unknown>;
  jerkQuality: Record<string, unknown>;
  gearDirection: Record<string, unknown>;
  authorityModel: Record<string, unknown>;
  discoverySummary: Record<string, unknown>;
}): Record<string, unknown> {
  const hfMae = (params.speedValidation.aggregateHF as { MAE?: number | null })?.MAE ?? null;
  const hfCadence = (
    params.surfaceMatrix.speed?.HF_HISTORICAL?.NEW_PHYSICAL_SAMPLE_CADENCE as {
      medianSeconds?: number;
    }
  )?.medianSeconds;
  const accel24 = (params.derivedAccel.policies as Record<string, unknown>)?.maxGap_2s as
    | { reliableAccelerationFraction?: number }
    | undefined;
  const accelReliable = (accel24?.reliableAccelerationFraction ?? 0) >= 0.65;

  const humanSummary: Record<string, SignalUsabilityClass> = {
    SPEED: classifySignalUsability('speed', 'HF_HISTORICAL', params.surfaceMatrix.speed?.HF_HISTORICAL ?? {}, hfMae),
    RPM: classifySignalUsability(
      'powertrainCombustionEngineSpeed',
      'HF_HISTORICAL',
      params.surfaceMatrix.powertrainCombustionEngineSpeed?.HF_HISTORICAL ?? {},
    ),
    THROTTLE: classifySignalUsability(
      'obdThrottlePosition',
      'HF_HISTORICAL',
      params.surfaceMatrix.obdThrottlePosition?.HF_HISTORICAL ?? {},
    ),
    TPS: classifySignalUsability(
      'powertrainCombustionEngineTPS',
      'HF_HISTORICAL',
      params.surfaceMatrix.powertrainCombustionEngineTPS?.HF_HISTORICAL ?? {},
    ),
    ENGINE_LOAD: 'CONTEXT_ONLY',
    ACTUAL_GEAR: 'CONTEXT_ONLY',
    GEAR_RATIO: 'CONTEXT_ONLY',
    DERIVED_ACCELERATION: accelReliable ? 'USEFUL_WITH_GATING' : 'WEAK',
    DERIVED_JERK: String(params.jerkQuality.JERK_DIRECT_USE) === 'NOT_RELIABLE' ? 'NOT_RELIABLE' : 'WEAK',
    PROVIDER_TIMESTAMP: 'STRONG',
    SYNQ_RECEIVED_AT: 'NOT_RELIABLE',
  };

  return {
    evidenceId: SIGNAL_QUALITY_EVIDENCE_ID,
    analysisMode: SIGNAL_QUALITY_MODE,
    evidenceClass: 'SIGNAL_QUALITY+DRIVING_INTELLIGENCE_FOUNDATION',
    GROUND_TRUTH_VALIDATED: 'NO',
    DRIVING_SCORE_CHANGED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    humanSummary,
    HF_SPEED_VIDEO_VALIDATION_SUPPORTED:
      (params.speedValidation.qualifiedStrongBasinClips as number) > 0 ? 'YES' : 'NO',
    HF_SPEED_TYPICAL_ERROR_KMH: hfMae,
    HF_SPEED_TEMPORAL_RESOLUTION: hfCadence != null ? `~${hfCadence.toFixed(2)}s median new physical sample` : null,
    LATEST_LIVE_SPEED_USEFULNESS: 'USEFUL_WITH_GATING',
    PROVIDER_TIME_PHYSICAL_EVENT_USEFULNESS: 'STRONG',
    INGRESS_TIME_PHYSICAL_EVENT_USEFULNESS: 'NOT_RELIABLE',
    DERIVED_ACCELERATION_RELIABILITY: accelReliable ? 'USEFUL_WITH_GATING' : 'WEAK',
    DERIVED_ACCELERATION_RECOMMENDED_MAX_GAP: 'ANALYSIS_ONLY_2.0s_provisional',
    DERIVED_JERK_RELIABILITY: params.jerkQuality.JERK_DIRECT_USE,
    RPM_DYNAMIC_EPISODE_USEFULNESS: 'USEFUL_WITH_GATING',
    RPM_SHIFT_SIGNATURE_USEFULNESS: params.gearDirection.RPM_SHIFT_SIGNATURE_DETECTABILITY,
    OBD_THROTTLE_USEFULNESS: 'SECONDARY_DEMAND_CONTEXT',
    POWERTRAIN_TPS_USEFULNESS: 'SECONDARY_DEMAND_CONTEXT',
    ENGINE_LOAD_USEFULNESS: 'POWERTRAIN_DEMAND_CONTEXT_ONLY',
    GEAR_STATE_USEFULNESS: params.gearDirection.GEAR_STATE_USEFUL,
    GEAR_CHANGE_TIMING_USEFULNESS: params.gearDirection.PRECISE_SHIFT_TIMING_USEFUL,
    DIRECTION_RECONSTRUCTION_CAPABILITY: params.gearDirection.DIRECTION_RECONSTRUCTION_CAPABILITY,
    OFFLINE_TRIP_RECONSTRUCTION_READINESS: 'READY_WITH_GATING',
    NEAR_REALTIME_FEEDBACK_READINESS: 'NOT_READY',
    POST_TRIP_DRIVING_SCORE_READINESS: 'FOUNDATION_ONLY_NOT_PRODUCTION',
    ...params.authorityModel,
    SIGNALS_SAFE_FOR_FUTURE_DRIVING_SCORE: ['speed (HF_HISTORICAL, gated)'],
    SIGNALS_REQUIRING_CONFIDENCE_GATING: [
      'powertrainCombustionEngineSpeed',
      'obdThrottlePosition',
      'powertrainCombustionEngineTPS',
      'derived longitudinal acceleration',
      'LATEST_LIVE speed',
    ],
    SIGNALS_NOT_SAFE_AS_DIRECT_SCORE_INPUT: [
      'synqReceivedAt',
      'obdEngineLoad as mass proxy',
      'jerk (raw)',
      'gear timing without cadence proof',
      'unsigned speed for direction',
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
  const derivedAccelerationQuality = buildDerivedAccelerationQuality(params.telemetryRows);
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
    authorityModel,
    discoverySummary: discovery.discoverySummary,
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
