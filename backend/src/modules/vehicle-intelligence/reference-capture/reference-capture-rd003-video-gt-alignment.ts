/**
 * RD003 External Video/Telemetry Alignment Workbench (DI-EV-0034A).
 *
 * Read-only: consumes immutable DI-EV-0033 telemetry + externally supplied video GT.
 * Does NOT fabricate video observations or mutate canonical telemetry.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import { extractNumericValue } from './reference-capture-signal-metrics';
import {
  REFERENCE_DRIVE_ID,
  SESSION_ID,
  sha256Hex,
  type VideoGtExportedRow,
} from './reference-capture-rd003-video-gt-export';

export const ALIGNMENT_SCHEMA_VERSION = '2026-09-03-rd003-video-gt-alignment-v1.1';
export const EVIDENCE_ID = 'DI-EV-0034A';

export const CANONICAL_TELEMETRY_JSONL_SHA256 =
  '69209a6d9e488d51c3aaf3b55dee5584ce622dc072a191b81e7061597cdda87a';

export const SESSION_START = '2026-09-02T18:59:15.695Z';
export const SESSION_STOP = '2026-09-02T19:36:22.970Z';

export const DERIVED_COMPARISON_SCHEMA_VERSION = '2026-09-03-derived-comparison-v1.1';
export const DERIVED_INTERPOLATION_METHOD = 'LINEAR_BOUNDED';

export const STATIC_MINUTE_DISPLAY_RESOLUTION_SECONDS = 60;
export const MIN_ELIGIBLE_CLIPS_FOR_CLOCK_MODEL = 2;
export const MIN_ALIGNMENT_ELIGIBLE_GT_POINTS = 2;

export const SURFACE_INTERPOLATION_GAP_SECONDS: Record<AcquisitionSurface, number> = {
  HF_HISTORICAL: 3,
  LATEST_LIVE: 2,
  LATEST_SLOW: 10,
};

export const ACQUISITION_SURFACES = ['HF_HISTORICAL', 'LATEST_LIVE', 'LATEST_SLOW'] as const;
export type AcquisitionSurface = (typeof ACQUISITION_SURFACES)[number];

export const SPEED_SURFACES: AcquisitionSurface[] = ['HF_HISTORICAL', 'LATEST_LIVE', 'LATEST_SLOW'];

export const ALIGNMENT_SIGNALS = [
  'speed',
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
  'powertrainCombustionEngineTPS',
  'obdEngineLoad',
  'powertrainTransmissionActualGear',
  'powertrainTransmissionActualGearRatio',
] as const;

export const ALIGNMENT_STATUSES = [
  'VALIDATED',
  'STRONG_CANDIDATE',
  'AMBIGUOUS',
  'INSUFFICIENT_GROUND_TRUTH',
  'INSUFFICIENT_CADENCE',
  'NOT_IDENTIFIABLE',
  'REJECTED',
  'PENDING_EXTERNAL_GT',
] as const;

export type AlignmentStatus = (typeof ALIGNMENT_STATUSES)[number];

export const CLOCK_MODEL_INELIGIBLE_STATUSES: AlignmentStatus[] = [
  'AMBIGUOUS',
  'NOT_IDENTIFIABLE',
  'INSUFFICIENT_GROUND_TRUTH',
  'INSUFFICIENT_CADENCE',
  'REJECTED',
  'PENDING_EXTERNAL_GT',
];

export const CLOCK_MODEL_OUTCOMES = [
  'CONSTANT_OFFSET',
  'OFFSET_WITH_QUANTIZATION',
  'SURFACE_DEPENDENT_OFFSET',
  'NON_CONSTANT',
  'UNRESOLVED',
  'PENDING_EXTERNAL_GT',
] as const;

export type VideoGtObservationType =
  | 'SPEED'
  | 'RPM'
  | 'GEAR_DISPLAY'
  | 'STOP'
  | 'FORWARD_MOTION'
  | 'REVERSE_MOTION'
  | 'ACCELERATION_ONSET'
  | 'ACCELERATION_END'
  | 'DECELERATION_ONSET'
  | 'DECELERATION_END'
  | 'SHIFT_TRANSITION'
  | 'CLOCK_MINUTE_TRANSITION'
  | 'CRUISE_STABLE'
  | 'DIRECTION_CHANGE';

export type CandidateAbsoluteTime = {
  candidateStartUtc?: string | null;
  candidateStartUtcFrom?: string | null;
  candidateStartUtcTo?: string | null;
  uncertaintySeconds?: number | null;
  derivation?: string | null;
  status: string;
};

export type ExternalGtClip = {
  clipId: string;
  fileName: string;
  videoDurationSeconds: number | null;
  videoDurationUncertainty: number | null;
  evidenceStatus: string;
  behavioralSummary?: string | null;
  negativeControl?: boolean;
  videoClock?: {
    displayedLocalTime?: string | null;
    displayedMinuteTransitions?: Array<{
      videoTimeSeconds: number | null;
      uncertaintySeconds: number | null;
      fromMinute?: string | null;
      toMinute?: string | null;
    }>;
    timezoneInterpretation?: string | null;
    timezoneStatus?: string | null;
    clockResolutionSeconds?: number | null;
    confidence?: string | null;
  };
  candidateAbsoluteTime?: CandidateAbsoluteTime;
  observations: ExternalGtObservation[];
};

export type ExternalGtObservation = {
  observationId: string;
  videoTimeSeconds: number | null;
  videoTimeUncertaintySeconds: number | null;
  observationType: VideoGtObservationType | string;
  value: number | string | null;
  unit: string | null;
  valueUncertainty: number | null;
  confidence: string | null;
  evidenceClass: string | null;
  sourceMethod: string | null;
  notes: string | null;
};

export type ExternalGtDocument = {
  schemaVersion: string;
  evidenceId: string;
  referenceDriveId: string;
  sessionId: string;
  clips: ExternalGtClip[];
};

export type StaleHoldRecord = {
  providerField: string;
  acquisitionSurface: string;
  physicalSampleFingerprint: string | null;
  providerTimestamp: string;
  staleHoldProviderTimestamp: string;
  staleHoldAcquisitionCount: number;
  staleHoldDurationSeconds: number;
  firstSynqReceivedAt: string;
  lastSynqReceivedAt: string;
};

export type TelemetrySourceRef = {
  acquisitionOrdinal: number;
  providerTimestamp: string | null;
  synqReceivedAt: string;
  physicalSampleFingerprint: string | null;
};

export type DerivedComparisonPoint = {
  videoTimeSeconds: number;
  absoluteUtcMs: number;
  telemetryValue: number | null;
  interpolationUsed: boolean;
  gapSeconds: number | null;
  interpolationFraction: number | null;
  status: 'MATCHED' | 'INSUFFICIENT_CADENCE' | 'NO_NEIGHBORS';
  beforeSource: TelemetrySourceRef | null;
  afterSource: TelemetrySourceRef | null;
};

export type SpeedSeriesPoint = {
  utcMs: number;
  value: number;
  row: VideoGtExportedRow;
};

export type SurfaceSpeedAlignment = {
  status: AlignmentStatus | 'NOT_OBSERVED';
  bestCandidate: {
    candidateStartResidualSeconds: number | null;
    alignedClipStartUtc: string | null;
    maeKmh: number | null;
    rmseKmh: number | null;
    maxAbsErrorKmh: number | null;
  };
  metrics: Record<string, number | string | null>;
  cadenceFreshnessContext: Record<string, unknown>;
  derivedComparisonLayer: {
    schemaVersion: string;
    method: string;
    interpolationMethod: string;
    maxInterpolationGapSeconds: number;
    sourceField: string;
    sourceSurface: AcquisitionSurface;
    points: DerivedComparisonPoint[];
  } | null;
};

export type ClipAlignmentResult = {
  clipId: string;
  fileName: string;
  evidenceLayer: 'CANDIDATE_ALIGNMENT';
  alignmentStatus: AlignmentStatus;
  SPEED_ALIGNMENT_SURFACE_PRESELECTED: 'NO';
  speedAlignmentBySurface: Record<string, SurfaceSpeedAlignment | { status: 'NOT_OBSERVED' }>;
  preferredSpeedAlignmentSurface: AcquisitionSurface | null;
  offsetSemantics: {
    CANDIDATE_START_PRIOR_UTC: string | null;
    CANDIDATE_START_PRIOR_UTC_FROM: string | null;
    CANDIDATE_START_PRIOR_UTC_TO: string | null;
    CANDIDATE_START_PRIOR_SEARCH_ANCHOR_UTC: string | null;
    CANDIDATE_START_PRIOR_SEARCH_ANCHOR_DERIVATION: string | null;
    CANDIDATE_START_RESIDUAL_SECONDS: number | null;
    ALIGNED_CLIP_START_UTC: string | null;
    VIDEO_CLOCK_TO_PROVIDER_TIME_OFFSET_SECONDS: number | string | null;
  };
  clockSemantics: {
    VIDEO_CLOCK_DISPLAY_RESOLUTION_SECONDS: number;
    MINUTE_TRANSITION_VIDEO_TIME_UNCERTAINTY_SECONDS: number | null;
    VEHICLE_CLOCK_TO_UTC_ACCURACY: string;
  };
  stages: {
    clockPrior: {
      status: string;
      candidateStartUtc: string | null;
      candidateStartUtcFrom: string | null;
      candidateStartUtcTo: string | null;
      uncertaintySeconds: number | null;
      note: string;
    };
    multiSignalConfirmation: {
      status: AlignmentStatus;
      signalsEvaluated: string[];
    };
  };
  gtCounts: {
    RAW_EXTERNAL_GT_COUNT: number;
    ALIGNMENT_ELIGIBLE_GT_COUNT: number;
    MATCHED_GT_COUNT: number | null;
  };
  metrics: Record<string, number | string | null>;
  gearTiming: {
    GEAR_STATE_OBSERVED: string;
    GEAR_CHANGE_TIMING_VALIDATED: string;
    nearestProviderSpacingSeconds: number | null;
    localGapAroundShiftSeconds: number | null;
    note: string;
  };
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function isAlignmentEligibleGroundTruth(obs: ExternalGtObservation): boolean {
  return (
    obs.observationType === 'SPEED' &&
    obs.videoTimeSeconds != null &&
    obs.value != null &&
    obs.confidence === 'VALIDATED' &&
    obs.evidenceClass === 'DIRECT_VISUAL'
  );
}

export function countAlignmentEligibleSpeedObservations(clip: ExternalGtClip): number {
  return clip.observations.filter(isAlignmentEligibleGroundTruth).length;
}

export function countRawExternalGtObservations(clip: ExternalGtClip): number {
  return clip.observations.length;
}

export function hasUsableSpeedGroundTruth(clips: ExternalGtClip[]): boolean {
  return clips.some((c) => countAlignmentEligibleSpeedObservations(c) >= MIN_ALIGNMENT_ELIGIBLE_GT_POINTS);
}

export function resolveCandidateTimeWindow(clip: ExternalGtClip): {
  fromMs: number | null;
  toMs: number | null;
  priorUtc: string | null;
  priorFromUtc: string | null;
  priorToUtc: string | null;
  searchAnchorMs: number | null;
  searchAnchorDerivation: string | null;
  residualSearchFromSeconds: number;
  residualSearchToSeconds: number;
} {
  const cat = clip.candidateAbsoluteTime;
  const fromMs = parseMs(cat?.candidateStartUtcFrom ?? null);
  const toMs = parseMs(cat?.candidateStartUtcTo ?? null);
  const pointMs = parseMs(cat?.candidateStartUtc ?? null);

  if (fromMs != null && toMs != null) {
    const searchAnchorMs = fromMs + (toMs - fromMs) / 2;
    return {
      fromMs,
      toMs,
      priorUtc: null,
      priorFromUtc: cat?.candidateStartUtcFrom ?? null,
      priorToUtc: cat?.candidateStartUtcTo ?? null,
      searchAnchorMs,
      searchAnchorDerivation: 'DERIVED_MIDPOINT_OF_CANDIDATE_RANGE_FOR_SEARCH_ONLY',
      residualSearchFromSeconds: 0,
      residualSearchToSeconds: (toMs - fromMs) / 1000,
    };
  }

  if (pointMs != null) {
    const uncertainty = cat?.uncertaintySeconds ?? 30;
    return {
      fromMs: pointMs - uncertainty * 1000,
      toMs: pointMs + uncertainty * 1000,
      priorUtc: cat?.candidateStartUtc ?? null,
      priorFromUtc: null,
      priorToUtc: null,
      searchAnchorMs: pointMs,
      searchAnchorDerivation: 'EXPLICIT_CANDIDATE_START_UTC',
      residualSearchFromSeconds: -uncertainty,
      residualSearchToSeconds: uncertainty,
    };
  }

  const uncertainty = cat?.uncertaintySeconds ?? 60;
  return {
    fromMs: null,
    toMs: null,
    priorUtc: null,
    priorFromUtc: null,
    priorToUtc: null,
    searchAnchorMs: null,
    searchAnchorDerivation: null,
    residualSearchFromSeconds: -uncertainty,
    residualSearchToSeconds: uncertainty,
  };
}

export function extractClockSemantics(clip: ExternalGtClip): ClipAlignmentResult['clockSemantics'] {
  const transitions = clip.videoClock?.displayedMinuteTransitions ?? [];
  const transitionUncertainties = transitions
    .map((t) => t.uncertaintySeconds)
    .filter((v): v is number => v != null);
  return {
    VIDEO_CLOCK_DISPLAY_RESOLUTION_SECONDS:
      clip.videoClock?.clockResolutionSeconds ?? STATIC_MINUTE_DISPLAY_RESOLUTION_SECONDS,
    MINUTE_TRANSITION_VIDEO_TIME_UNCERTAINTY_SECONDS:
      transitionUncertainties.length > 0 ? Math.min(...transitionUncertainties) : null,
    VEHICLE_CLOCK_TO_UTC_ACCURACY: 'UNKNOWN',
  };
}

export function assertCanonicalTelemetrySha256(content: string | Buffer): void {
  const sha = sha256Hex(content);
  if (sha !== CANONICAL_TELEMETRY_JSONL_SHA256) {
    throw new Error(
      `Canonical telemetry SHA mismatch: expected ${CANONICAL_TELEMETRY_JSONL_SHA256}, got ${sha}`,
    );
  }
}

export function loadCanonicalTelemetryJsonl(filePath: string): VideoGtExportedRow[] {
  const content = fs.readFileSync(filePath, 'utf8');
  assertCanonicalTelemetrySha256(content);
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as VideoGtExportedRow);
}

export function loadExternalGtDocument(filePath: string): ExternalGtDocument {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ExternalGtDocument;
}

export function computeProviderDeliveryMetrics(row: VideoGtExportedRow): {
  providerSampleAgeSeconds: number | null;
  requestStartToIngressSeconds: number | null;
  requestDurationSeconds: number | null;
  hfWindowAgeSeconds: number | null;
  anomalyFlags: string[];
} {
  const providerMs = parseMs(row.providerTimestamp);
  const synqMs = parseMs(row.synqReceivedAt);
  const reqStartMs = parseMs(row.requestStartedAt);
  const reqEndMs = parseMs(row.requestCompletedAt);
  const prov = row.provenanceJson;
  const hfWindowToMs = parseMs(prov.hfWindowTo as string | undefined);
  const anomalyFlags: string[] = [];

  let providerSampleAgeSeconds: number | null = null;
  if (providerMs != null && synqMs != null) {
    providerSampleAgeSeconds = (synqMs - providerMs) / 1000;
    if (providerSampleAgeSeconds < 0) anomalyFlags.push('NEGATIVE_PROVIDER_SAMPLE_AGE');
  }

  let requestStartToIngressSeconds: number | null = null;
  if (reqStartMs != null && synqMs != null) {
    requestStartToIngressSeconds = (synqMs - reqStartMs) / 1000;
    if (requestStartToIngressSeconds < 0) anomalyFlags.push('NEGATIVE_REQUEST_TO_INGRESS');
  }

  let requestDurationSeconds: number | null = null;
  if (reqStartMs != null && reqEndMs != null) {
    requestDurationSeconds = (reqEndMs - reqStartMs) / 1000;
    if (requestDurationSeconds < 0) anomalyFlags.push('NEGATIVE_REQUEST_DURATION');
  }

  let hfWindowAgeSeconds: number | null = null;
  if (hfWindowToMs != null && synqMs != null) {
    hfWindowAgeSeconds = (synqMs - hfWindowToMs) / 1000;
  }

  return {
    providerSampleAgeSeconds,
    requestStartToIngressSeconds,
    requestDurationSeconds,
    hfWindowAgeSeconds,
    anomalyFlags,
  };
}

export function detectStaleHolds(rows: VideoGtExportedRow[]): StaleHoldRecord[] {
  const groups = new Map<string, VideoGtExportedRow[]>();
  for (const row of rows) {
    const key = [
      row.providerField,
      row.acquisitionSurface,
      row.physicalSampleFingerprint ?? '',
      row.providerTimestamp ?? '',
    ].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const holds: StaleHoldRecord[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => (parseMs(a.synqReceivedAt) ?? 0) - (parseMs(b.synqReceivedAt) ?? 0),
    );
    const first = sorted[0]!;
    const last = sorted.at(-1)!;
    const firstMs = parseMs(first.synqReceivedAt);
    const lastMs = parseMs(last.synqReceivedAt);
    if (firstMs == null || lastMs == null || lastMs <= firstMs) continue;
    holds.push({
      providerField: first.providerField,
      acquisitionSurface: first.acquisitionSurface,
      physicalSampleFingerprint: first.physicalSampleFingerprint,
      providerTimestamp: first.providerTimestamp ?? '',
      staleHoldProviderTimestamp: first.providerTimestamp ?? '',
      staleHoldAcquisitionCount: sorted.length,
      staleHoldDurationSeconds: (lastMs - firstMs) / 1000,
      firstSynqReceivedAt: first.synqReceivedAt,
      lastSynqReceivedAt: last.synqReceivedAt,
    });
  }
  return holds.sort((a, b) =>
    `${a.providerField}|${a.acquisitionSurface}`.localeCompare(`${b.providerField}|${b.acquisitionSurface}`),
  );
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function buildSignalSurfaceQuality(
  rows: VideoGtExportedRow[],
): Record<string, Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const field of ALIGNMENT_SIGNALS) {
    out[field] = {};
    for (const surface of ACQUISITION_SURFACES) {
      const subset = rows.filter((r) => r.providerField === field && r.acquisitionSurface === surface);
      if (subset.length === 0) {
        out[field][surface] = { observationCount: 0, status: 'NOT_OBSERVED' };
        continue;
      }
      const ages = subset
        .map((r) => computeProviderDeliveryMetrics(r).providerSampleAgeSeconds)
        .filter((v): v is number => v != null);
      const ingress = subset
        .map((r) => computeProviderDeliveryMetrics(r).requestStartToIngressSeconds)
        .filter((v): v is number => v != null);
      out[field][surface] = {
        observationCount: subset.length,
        providerSampleAgeSeconds: {
          min: ages.length ? Math.min(...ages) : null,
          max: ages.length ? Math.max(...ages) : null,
          median: ages.length ? percentile(ages, 0.5) : null,
        },
        requestStartToIngressSeconds: {
          min: ingress.length ? Math.min(...ingress) : null,
          max: ingress.length ? Math.max(...ingress) : null,
          median: ingress.length ? percentile(ingress, 0.5) : null,
        },
        configuredMaxInterpolationGapSeconds: SURFACE_INTERPOLATION_GAP_SECONDS[surface],
        LATEST_LIVE_EQUALS_FRESH_PHYSICAL_SAMPLE: 'NO',
        freshnessEvaluatedBySurfaceName: 'NO',
      };
    }
  }
  return out;
}

export function filterTelemetryByFieldAndSurface(
  rows: VideoGtExportedRow[],
  field: string,
  surface: AcquisitionSurface,
): VideoGtExportedRow[] {
  return rows.filter((r) => r.providerField === field && r.acquisitionSurface === surface);
}

export function buildSpeedSeries(rows: VideoGtExportedRow[]): SpeedSeriesPoint[] {
  return rows
    .map((r) => {
      const value = extractNumericValue(r.rawValueJson);
      const utcMs = parseMs(r.providerTimestamp);
      if (value == null || utcMs == null) return null;
      return { utcMs, value, row: r };
    })
    .filter((v): v is SpeedSeriesPoint => v != null)
    .sort((a, b) => a.utcMs - b.utcMs);
}

function rowToSourceRef(row: VideoGtExportedRow): TelemetrySourceRef {
  return {
    acquisitionOrdinal: row.acquisitionOrdinal,
    providerTimestamp: row.providerTimestamp,
    synqReceivedAt: row.synqReceivedAt,
    physicalSampleFingerprint: row.physicalSampleFingerprint,
  };
}

export function deriveTelemetryAtUtc(
  series: SpeedSeriesPoint[],
  targetUtcMs: number,
  maxGapSeconds: number,
): DerivedComparisonPoint {
  if (series.length === 0) {
    return {
      videoTimeSeconds: 0,
      absoluteUtcMs: targetUtcMs,
      telemetryValue: null,
      interpolationUsed: false,
      gapSeconds: null,
      interpolationFraction: null,
      status: 'NO_NEIGHBORS',
      beforeSource: null,
      afterSource: null,
    };
  }
  let before: SpeedSeriesPoint | null = null;
  let after: SpeedSeriesPoint | null = null;
  for (const pt of series) {
    if (pt.utcMs <= targetUtcMs) before = pt;
    if (pt.utcMs >= targetUtcMs) {
      after = pt;
      break;
    }
  }
  if (before && before.utcMs === targetUtcMs) {
    return {
      videoTimeSeconds: 0,
      absoluteUtcMs: targetUtcMs,
      telemetryValue: before.value,
      interpolationUsed: false,
      gapSeconds: 0,
      interpolationFraction: 0,
      status: 'MATCHED',
      beforeSource: rowToSourceRef(before.row),
      afterSource: rowToSourceRef(before.row),
    };
  }
  if (!before || !after) {
    return {
      videoTimeSeconds: 0,
      absoluteUtcMs: targetUtcMs,
      telemetryValue: null,
      interpolationUsed: false,
      gapSeconds: null,
      interpolationFraction: null,
      status: 'INSUFFICIENT_CADENCE',
      beforeSource: before ? rowToSourceRef(before.row) : null,
      afterSource: after ? rowToSourceRef(after.row) : null,
    };
  }
  const gapSeconds = (after.utcMs - before.utcMs) / 1000;
  if (gapSeconds > maxGapSeconds) {
    return {
      videoTimeSeconds: 0,
      absoluteUtcMs: targetUtcMs,
      telemetryValue: null,
      interpolationUsed: false,
      gapSeconds,
      interpolationFraction: null,
      status: 'INSUFFICIENT_CADENCE',
      beforeSource: rowToSourceRef(before.row),
      afterSource: rowToSourceRef(after.row),
    };
  }
  const ratio = (targetUtcMs - before.utcMs) / (after.utcMs - before.utcMs);
  const value = before.value + ratio * (after.value - before.value);
  return {
    videoTimeSeconds: 0,
    absoluteUtcMs: targetUtcMs,
    telemetryValue: value,
    interpolationUsed: true,
    gapSeconds,
    interpolationFraction: ratio,
    status: 'MATCHED',
    beforeSource: rowToSourceRef(before.row),
    afterSource: rowToSourceRef(after.row),
  };
}

export type SpeedMatchMetrics = {
  mae: number;
  rmse: number;
  maxAbsError: number;
  matched: number;
  total: number;
  errors: number[];
};

export function scoreSpeedResidual(params: {
  eligibleObservations: ExternalGtObservation[];
  speedSeries: SpeedSeriesPoint[];
  searchAnchorMs: number;
  residualSeconds: number;
  maxGapSeconds: number;
}): SpeedMatchMetrics {
  if (params.eligibleObservations.length === 0) {
    return {
      mae: Number.POSITIVE_INFINITY,
      rmse: Number.POSITIVE_INFINITY,
      maxAbsError: Number.POSITIVE_INFINITY,
      matched: 0,
      total: 0,
      errors: [],
    };
  }

  const errors: number[] = [];
  for (const obs of params.eligibleObservations) {
    const absMs =
      params.searchAnchorMs + (obs.videoTimeSeconds! + params.residualSeconds) * 1000;
    const derived = deriveTelemetryAtUtc(params.speedSeries, absMs, params.maxGapSeconds);
    if (derived.status !== 'MATCHED' || derived.telemetryValue == null) continue;
    const gtVal = typeof obs.value === 'number' ? obs.value : Number(obs.value);
    if (!Number.isFinite(gtVal)) continue;
    errors.push(Math.abs(derived.telemetryValue - gtVal));
  }

  if (errors.length === 0) {
    return {
      mae: Number.POSITIVE_INFINITY,
      rmse: Number.POSITIVE_INFINITY,
      maxAbsError: Number.POSITIVE_INFINITY,
      matched: 0,
      total: params.eligibleObservations.length,
      errors: [],
    };
  }

  const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((a, b) => a + b * b, 0) / errors.length);
  const maxAbsError = Math.max(...errors);
  return {
    mae,
    rmse,
    maxAbsError,
    matched: errors.length,
    total: params.eligibleObservations.length,
    errors,
  };
}

export const AMBIGUITY_MAE_DELTA_KMH = 1.0;

export function searchSpeedResidualCandidates(params: {
  eligibleObservations: ExternalGtObservation[];
  speedSeries: SpeedSeriesPoint[];
  searchAnchorMs: number;
  searchFromResidualSeconds: number;
  searchToResidualSeconds: number;
  maxGapSeconds: number;
  stepSeconds?: number;
}): {
  candidates: Array<SpeedMatchMetrics & { residualSeconds: number }>;
  best: (SpeedMatchMetrics & { residualSeconds: number }) | null;
  ambiguous: boolean;
  status: AlignmentStatus;
} {
  if (params.eligibleObservations.length < MIN_ALIGNMENT_ELIGIBLE_GT_POINTS) {
    return { candidates: [], best: null, ambiguous: false, status: 'INSUFFICIENT_GROUND_TRUTH' };
  }

  const step = params.stepSeconds ?? 0.5;
  const candidates: Array<SpeedMatchMetrics & { residualSeconds: number }> = [];
  for (
    let residual = params.searchFromResidualSeconds;
    residual <= params.searchToResidualSeconds + 1e-9;
    residual += step
  ) {
    const score = scoreSpeedResidual({
      eligibleObservations: params.eligibleObservations,
      speedSeries: params.speedSeries,
      searchAnchorMs: params.searchAnchorMs,
      residualSeconds: residual,
      maxGapSeconds: params.maxGapSeconds,
    });
    if (Number.isFinite(score.mae)) {
      candidates.push({ residualSeconds: residual, ...score });
    }
  }
  candidates.sort((a, b) => a.mae - b.mae || a.residualSeconds - b.residualSeconds);
  if (candidates.length === 0) {
    return { candidates: [], best: null, ambiguous: false, status: 'INSUFFICIENT_GROUND_TRUTH' };
  }
  const best = candidates[0]!;
  const second = candidates[1];
  const ambiguous = second != null && Math.abs(second.mae - best.mae) <= AMBIGUITY_MAE_DELTA_KMH;
  let status: AlignmentStatus = 'STRONG_CANDIDATE';
  if (ambiguous) status = 'AMBIGUOUS';
  if (best.mae > 15) status = 'NOT_IDENTIFIABLE';
  return { candidates, best, ambiguous, status };
}

export function evaluateGearShiftTiming(params: {
  clip: ExternalGtClip;
  telemetryRows: VideoGtExportedRow[];
  alignedClipStartMs: number | null;
  residualSeconds: number;
}): ClipAlignmentResult['gearTiming'] {
  const gearRows = filterTelemetryByFieldAndSurface(
    params.telemetryRows,
    'powertrainTransmissionActualGear',
    'LATEST_SLOW',
  );
  const shiftObs = params.clip.observations.find((o) => o.observationType === 'SHIFT_TRANSITION');
  const gearStateObserved = gearRows.length > 0 ? 'YES' : 'NOT_OBSERVED';

  if (!shiftObs || shiftObs.videoTimeSeconds == null || params.alignedClipStartMs == null) {
    return {
      GEAR_STATE_OBSERVED: gearStateObserved,
      GEAR_CHANGE_TIMING_VALIDATED: 'NO',
      nearestProviderSpacingSeconds: null,
      localGapAroundShiftSeconds: null,
      note: 'Shift timing requires aligned shift observation and resolvable ActualGear cadence',
    };
  }

  const shiftAbsMs =
    params.alignedClipStartMs + (shiftObs.videoTimeSeconds + params.residualSeconds) * 1000;
  const providerTimes = gearRows
    .map((r) => parseMs(r.providerTimestamp))
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);

  if (providerTimes.length < 2) {
    return {
      GEAR_STATE_OBSERVED: gearStateObserved,
      GEAR_CHANGE_TIMING_VALIDATED: 'NO',
      nearestProviderSpacingSeconds: null,
      localGapAroundShiftSeconds: null,
      note: 'Insufficient ActualGear providerTimestamp spacing for shift timing — row count is not cadence proof',
    };
  }

  const spacings: number[] = [];
  for (let i = 1; i < providerTimes.length; i++) {
    spacings.push((providerTimes[i]! - providerTimes[i - 1]!) / 1000);
  }
  const nearestSpacing = Math.min(...spacings);

  let before: number | null = null;
  let after: number | null = null;
  for (const t of providerTimes) {
    if (t <= shiftAbsMs) before = t;
    if (t >= shiftAbsMs) {
      after = t;
      break;
    }
  }
  const localGap =
    before != null && after != null ? (after - before) / 1000 : null;

  const maxGearGap = SURFACE_INTERPOLATION_GAP_SECONDS.LATEST_SLOW;
  let timingValidated: string;
  if (localGap == null) {
    timingValidated = 'NOT_IDENTIFIABLE';
  } else if (localGap > maxGearGap) {
    timingValidated = 'NOT_IDENTIFIABLE';
  } else {
    timingValidated = 'NO';
  }

  return {
    GEAR_STATE_OBSERVED: gearStateObserved,
    GEAR_CHANGE_TIMING_VALIDATED: timingValidated,
    nearestProviderSpacingSeconds: nearestSpacing,
    localGapAroundShiftSeconds: localGap,
    note: 'ActualGear cadence evaluated by providerTimestamp spacing around aligned shift — row count is not cadence proof',
  };
}

function alignClipOnSurface(params: {
  clip: ExternalGtClip;
  telemetryRows: VideoGtExportedRow[];
  surface: AcquisitionSurface;
  eligibleObservations: ExternalGtObservation[];
  timeWindow: ReturnType<typeof resolveCandidateTimeWindow>;
}): SurfaceSpeedAlignment | { status: 'NOT_OBSERVED' } {
  const speedRows = filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', params.surface);
  if (speedRows.length === 0) return { status: 'NOT_OBSERVED' };

  const speedSeries = buildSpeedSeries(speedRows);
  const maxGap = SURFACE_INTERPOLATION_GAP_SECONDS[params.surface];

  if (params.eligibleObservations.length < MIN_ALIGNMENT_ELIGIBLE_GT_POINTS) {
    return {
      status: 'INSUFFICIENT_GROUND_TRUTH',
      bestCandidate: {
        candidateStartResidualSeconds: null,
        alignedClipStartUtc: null,
        maeKmh: null,
        rmseKmh: null,
        maxAbsErrorKmh: null,
      },
      metrics: {
        NUMBER_OF_GT_POINTS: params.eligibleObservations.length,
        ALIGNMENT_ELIGIBLE_GT_COUNT: params.eligibleObservations.length,
        MATCHED_GT_COUNT: null,
        COVERAGE_RATIO: null,
      },
      cadenceFreshnessContext: {
        observationCount: speedRows.length,
        configuredMaxInterpolationGapSeconds: maxGap,
        medianProviderSampleAgeSeconds: percentile(
          speedRows
            .map((r) => computeProviderDeliveryMetrics(r).providerSampleAgeSeconds)
            .filter((v): v is number => v != null),
          0.5,
        ),
      },
      derivedComparisonLayer: null,
    };
  }

  if (params.timeWindow.searchAnchorMs == null) {
    return {
      status: 'INSUFFICIENT_GROUND_TRUTH',
      bestCandidate: {
        candidateStartResidualSeconds: null,
        alignedClipStartUtc: null,
        maeKmh: null,
        rmseKmh: null,
        maxAbsErrorKmh: null,
      },
      metrics: {
        NUMBER_OF_GT_POINTS: params.eligibleObservations.length,
        ALIGNMENT_ELIGIBLE_GT_COUNT: params.eligibleObservations.length,
        MATCHED_GT_COUNT: null,
      },
      cadenceFreshnessContext: { configuredMaxInterpolationGapSeconds: maxGap },
      derivedComparisonLayer: null,
    };
  }

  const search = searchSpeedResidualCandidates({
    eligibleObservations: params.eligibleObservations,
    speedSeries,
    searchAnchorMs: params.timeWindow.searchAnchorMs,
    searchFromResidualSeconds: params.timeWindow.residualSearchFromSeconds,
    searchToResidualSeconds: params.timeWindow.residualSearchToSeconds,
    maxGapSeconds: maxGap,
    stepSeconds: 0.5,
  });

  const residual = search.best?.residualSeconds ?? 0;
  const alignedMs = params.timeWindow.searchAnchorMs + residual * 1000;

  return {
    status: search.status,
    bestCandidate: {
      candidateStartResidualSeconds: search.best?.residualSeconds ?? null,
      alignedClipStartUtc: search.best ? toIso(alignedMs) : null,
      maeKmh: search.best?.mae ?? null,
      rmseKmh: search.best?.rmse ?? null,
      maxAbsErrorKmh: search.best?.maxAbsError ?? null,
    },
    metrics: {
      NUMBER_OF_GT_POINTS: params.eligibleObservations.length,
      ALIGNMENT_ELIGIBLE_GT_COUNT: params.eligibleObservations.length,
      MATCHED_GT_COUNT: search.best?.matched ?? null,
      COVERAGE_RATIO:
        search.best && search.best.total > 0 ? search.best.matched / search.best.total : null,
      SPEED_MAE_KMH: search.best?.mae ?? null,
      SPEED_RMSE_KMH: search.best?.rmse ?? null,
      SPEED_MAX_ABS_ERROR_KMH: search.best?.maxAbsError ?? null,
    },
    cadenceFreshnessContext: {
      observationCount: speedRows.length,
      configuredMaxInterpolationGapSeconds: maxGap,
      medianProviderSampleAgeSeconds: percentile(
        speedRows
          .map((r) => computeProviderDeliveryMetrics(r).providerSampleAgeSeconds)
          .filter((v): v is number => v != null),
        0.5,
      ),
    },
    derivedComparisonLayer:
      search.best == null
        ? null
        : {
            schemaVersion: DERIVED_COMPARISON_SCHEMA_VERSION,
            method: 'DERIVED_COMPARISON_LAYER',
            interpolationMethod: DERIVED_INTERPOLATION_METHOD,
            maxInterpolationGapSeconds: maxGap,
            sourceField: 'speed',
            sourceSurface: params.surface,
            points: params.eligibleObservations.map((obs) => {
              const absMs =
                params.timeWindow.searchAnchorMs! +
                (obs.videoTimeSeconds! + (search.best?.residualSeconds ?? 0)) * 1000;
              const pt = deriveTelemetryAtUtc(speedSeries, absMs, maxGap);
              return { ...pt, videoTimeSeconds: obs.videoTimeSeconds! };
            }),
          },
  };
}

function selectPreferredSpeedSurface(
  bySurface: Record<string, SurfaceSpeedAlignment | { status: 'NOT_OBSERVED' }>,
): AcquisitionSurface | null {
  const ranked: Array<{ surface: AcquisitionSurface; mae: number; matched: number }> = [];
  for (const surface of SPEED_SURFACES) {
    const entry = bySurface[surface];
    if (!entry || entry.status === 'NOT_OBSERVED') continue;
    if (entry.status !== 'STRONG_CANDIDATE' && entry.status !== 'VALIDATED') continue;
    const mae = entry.bestCandidate.maeKmh;
    const matched = entry.metrics.MATCHED_GT_COUNT;
    if (mae == null || matched == null || typeof matched !== 'number') continue;
    ranked.push({ surface, mae, matched });
  }
  if (ranked.length === 0) return null;
  ranked.sort((a, b) => a.mae - b.mae || b.matched - a.matched);
  return ranked[0]!.surface;
}

export function alignClip(params: {
  clip: ExternalGtClip;
  telemetryRows: VideoGtExportedRow[];
}): ClipAlignmentResult {
  const timeWindow = resolveCandidateTimeWindow(params.clip);
  const clockPrior = {
    status: params.clip.candidateAbsoluteTime?.status ?? 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    candidateStartUtc: timeWindow.priorUtc,
    candidateStartUtcFrom: timeWindow.priorFromUtc,
    candidateStartUtcTo: timeWindow.priorToUtc,
    uncertaintySeconds: params.clip.candidateAbsoluteTime?.uncertaintySeconds ?? null,
    note: 'Visible vehicle clock establishes candidate region only — not sole alignment authority',
  };

  const eligibleObservations = params.clip.observations.filter(isAlignmentEligibleGroundTruth);
  const rawCount = countRawExternalGtObservations(params.clip);

  const speedAlignmentBySurface: Record<string, SurfaceSpeedAlignment | { status: 'NOT_OBSERVED' }> =
    {};
  for (const surface of SPEED_SURFACES) {
    const speedExists = filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', surface).length > 0;
    speedAlignmentBySurface[surface] = speedExists
      ? alignClipOnSurface({
          clip: params.clip,
          telemetryRows: params.telemetryRows,
          surface,
          eligibleObservations,
          timeWindow,
        })
      : { status: 'NOT_OBSERVED' };
  }

  const preferredSurface = selectPreferredSpeedSurface(speedAlignmentBySurface);
  const preferred =
    preferredSurface && speedAlignmentBySurface[preferredSurface] &&
    'bestCandidate' in speedAlignmentBySurface[preferredSurface]!
      ? (speedAlignmentBySurface[preferredSurface] as SurfaceSpeedAlignment)
      : null;

  let alignmentStatus: AlignmentStatus = 'PENDING_EXTERNAL_GT';
  if (eligibleObservations.length >= MIN_ALIGNMENT_ELIGIBLE_GT_POINTS && preferred) {
    alignmentStatus = preferred.status as AlignmentStatus;
  } else if (eligibleObservations.length > 0) {
    alignmentStatus = 'INSUFFICIENT_GROUND_TRUTH';
  }

  const residual = preferred?.bestCandidate.candidateStartResidualSeconds ?? null;
  const alignedStartUtc = preferred?.bestCandidate.alignedClipStartUtc ?? null;
  const alignedStartMs = parseMs(alignedStartUtc);

  return {
    clipId: params.clip.clipId,
    fileName: params.clip.fileName,
    evidenceLayer: 'CANDIDATE_ALIGNMENT',
    alignmentStatus,
    SPEED_ALIGNMENT_SURFACE_PRESELECTED: 'NO',
    speedAlignmentBySurface,
    preferredSpeedAlignmentSurface: preferredSurface,
    offsetSemantics: {
      CANDIDATE_START_PRIOR_UTC: timeWindow.priorUtc,
      CANDIDATE_START_PRIOR_UTC_FROM: timeWindow.priorFromUtc,
      CANDIDATE_START_PRIOR_UTC_TO: timeWindow.priorToUtc,
      CANDIDATE_START_PRIOR_SEARCH_ANCHOR_UTC: timeWindow.searchAnchorMs
        ? toIso(timeWindow.searchAnchorMs)
        : null,
      CANDIDATE_START_PRIOR_SEARCH_ANCHOR_DERIVATION: timeWindow.searchAnchorDerivation,
      CANDIDATE_START_RESIDUAL_SECONDS: residual,
      ALIGNED_CLIP_START_UTC: alignedStartUtc,
      VIDEO_CLOCK_TO_PROVIDER_TIME_OFFSET_SECONDS: 'NOT_IDENTIFIABLE',
    },
    clockSemantics: extractClockSemantics(params.clip),
    stages: {
      clockPrior,
      multiSignalConfirmation: {
        status: alignmentStatus,
        signalsEvaluated: preferred ? ['speed'] : [],
      },
    },
    gtCounts: {
      RAW_EXTERNAL_GT_COUNT: rawCount,
      ALIGNMENT_ELIGIBLE_GT_COUNT: eligibleObservations.length,
      MATCHED_GT_COUNT:
        typeof preferred?.metrics.MATCHED_GT_COUNT === 'number'
          ? preferred.metrics.MATCHED_GT_COUNT
          : null,
    },
    metrics: {
      ...(preferred?.metrics ?? {}),
      EPISODE_DETECTABILITY: params.clip.negativeControl ? 'NEGATIVE_CONTROL' : 'EVALUATED',
    },
    gearTiming: evaluateGearShiftTiming({
      clip: params.clip,
      telemetryRows: params.telemetryRows,
      alignedClipStartMs: alignedStartMs,
      residualSeconds: residual ?? 0,
    }),
  };
}

export function isClockModelEligible(alignment: ClipAlignmentResult): {
  eligible: boolean;
  reason: string | null;
} {
  if (CLOCK_MODEL_INELIGIBLE_STATUSES.includes(alignment.alignmentStatus)) {
    return { eligible: false, reason: alignment.alignmentStatus };
  }
  if (alignment.alignmentStatus !== 'STRONG_CANDIDATE' && alignment.alignmentStatus !== 'VALIDATED') {
    return { eligible: false, reason: alignment.alignmentStatus };
  }
  if (alignment.offsetSemantics.CANDIDATE_START_RESIDUAL_SECONDS == null) {
    return { eligible: false, reason: 'NO_RESIDUAL_OFFSET' };
  }
  return { eligible: true, reason: null };
}

export function buildCrossClipClockModel(
  clipAlignments: ClipAlignmentResult[],
): Record<string, unknown> {
  const entries = clipAlignments.map((c) => {
    const gate = isClockModelEligible(c);
    return {
      clipId: c.clipId,
      alignmentStatus: c.alignmentStatus,
      candidateStartResidualSeconds: c.offsetSemantics.CANDIDATE_START_RESIDUAL_SECONDS,
      alignedClipStartUtc: c.offsetSemantics.ALIGNED_CLIP_START_UTC,
      preferredSurface: c.preferredSpeedAlignmentSurface,
      CLOCK_MODEL_ELIGIBLE: gate.eligible ? 'YES' : 'NO',
      CLOCK_MODEL_EXCLUSION_REASON: gate.reason,
      VIDEO_CLOCK_TO_PROVIDER_TIME_OFFSET_SECONDS:
        c.offsetSemantics.VIDEO_CLOCK_TO_PROVIDER_TIME_OFFSET_SECONDS,
    };
  });

  const eligibleResiduals = entries
    .filter((e) => e.CLOCK_MODEL_ELIGIBLE === 'YES')
    .map((e) => e.candidateStartResidualSeconds)
    .filter((v): v is number => typeof v === 'number');

  if (eligibleResiduals.length < MIN_ELIGIBLE_CLIPS_FOR_CLOCK_MODEL) {
    return {
      evidenceLayer: 'DERIVED_SIGNAL_QUALITY',
      modelOutcome: eligibleResiduals.length === 0 ? 'PENDING_EXTERNAL_GT' : 'UNRESOLVED',
      note: 'Cross-clip model requires sufficiently supported per-clip residuals — not heterogeneous absolute clock offsets',
      eligibleClipCount: eligibleResiduals.length,
      clipEntries: entries,
      VEHICLE_CLOCK_TO_UTC_ACCURACY: 'UNKNOWN',
    };
  }

  const min = Math.min(...eligibleResiduals);
  const max = Math.max(...eligibleResiduals);
  const spread = max - min;
  let modelOutcome: (typeof CLOCK_MODEL_OUTCOMES)[number] = 'CONSTANT_OFFSET';
  if (spread > 5) modelOutcome = 'NON_CONSTANT';
  else if (spread > 1) modelOutcome = 'OFFSET_WITH_QUANTIZATION';

  return {
    evidenceLayer: 'DERIVED_SIGNAL_QUALITY',
    modelOutcome,
    residualSpreadSeconds: spread,
    minResidualSeconds: min,
    maxResidualSeconds: max,
    eligibleClipCount: eligibleResiduals.length,
    clipEntries: entries,
    VEHICLE_CLOCK_TO_UTC_ACCURACY: 'UNKNOWN',
    note: 'Residuals are adjustments relative to per-clip candidate priors — not absolute VIDEO_CLOCK_TO_PROVIDER_TIME offsets',
  };
}

export function runAlignmentWorkbench(params: {
  telemetryRows: VideoGtExportedRow[];
  externalGt: ExternalGtDocument;
}): {
  clipAlignments: ClipAlignmentResult[];
  crossClipClockModel: Record<string, unknown>;
  signalSurfaceQuality: Record<string, Record<string, Record<string, unknown>>>;
  staleHolds: StaleHoldRecord[];
  alignmentSummary: Record<string, unknown>;
} {
  const staleHolds = detectStaleHolds(params.telemetryRows);
  const signalSurfaceQuality = buildSignalSurfaceQuality(params.telemetryRows);
  const clipAlignments = params.externalGt.clips.map((clip) =>
    alignClip({ clip, telemetryRows: params.telemetryRows }),
  );
  const crossClipClockModel = buildCrossClipClockModel(clipAlignments);

  return {
    clipAlignments,
    crossClipClockModel,
    signalSurfaceQuality,
    staleHolds,
    alignmentSummary: {
      evidenceId: EVIDENCE_ID,
      schemaVersion: ALIGNMENT_SCHEMA_VERSION,
      referenceDriveId: REFERENCE_DRIVE_ID,
      sessionId: SESSION_ID,
      canonicalTelemetryJsonlSha256: CANONICAL_TELEMETRY_JSONL_SHA256,
      telemetryRowCount: params.telemetryRows.length,
      clipCount: params.externalGt.clips.length,
      WORKBENCH_READY: 'YES',
      SPEED_ALIGNMENT_SURFACE_PRESELECTED: 'NO',
      EXTERNAL_GT_VALUES_COMPLETE: hasUsableSpeedGroundTruth(params.externalGt.clips) ? 'PARTIAL' : 'NO',
      VIDEO_ALIGNMENT_STATUS: 'AWAITING_EXTERNAL_GT_INGESTION',
      GROUND_TRUTH_VALIDATED: 'NO',
      VIDEO_CLOCK_USED_AS_SOLE_ALIGNMENT_AUTHORITY: 'NO',
      ACTUAL_GEAR_USED_AS_PRECISE_SHIFT_AUTHORITY: 'NO',
      SIGNED_SPEED_FABRICATED_FROM_UNSIGNED_SPEED: 'NO',
      ALIGNMENT_ELIGIBLE_GT_GATE_IMPLEMENTED: 'YES',
      REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
      DRIVING_SCORE_CHANGED: 'NO',
      multiClockModel: {
        CLOCK_A: 'VIDEO_INSTRUMENT_CLOCK',
        CLOCK_B: 'PROVIDER_TIMESTAMP',
        CLOCK_C: 'SYNQ_RECEIVED_AT',
        CLOCK_D: 'REQUEST_STARTED_AT_REQUEST_COMPLETED_AT',
        CLOCK_E: 'HF_WINDOW_FROM_HF_WINDOW_TO_HF_ACTUAL_QUERY_TO',
        VIDEO_TO_TELEMETRY_CLOCK_MODEL_STATUS: 'PENDING_MULTI_CLOCK_CORRELATION',
      },
      outputAuthority: {
        RAW_EXTERNAL_GT: 'rd003-video-ground-truth-observations.json',
        CANDIDATE_ALIGNMENT: 'clip-alignments.json',
        DERIVED_SIGNAL_QUALITY: 'signal-surface-quality.json, cross-clip-clock-model.json',
        VALIDATED_ALIGNMENT: 'NONE',
      },
    },
  };
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

export function alignmentOutputSha256(outputs: {
  clipAlignments: ClipAlignmentResult[];
  crossClipClockModel: Record<string, unknown>;
  signalSurfaceQuality: Record<string, unknown>;
  alignmentSummary: Record<string, unknown>;
}): string {
  const payload = stableStringify({
    clipAlignments: outputs.clipAlignments,
    crossClipClockModel: outputs.crossClipClockModel,
    signalSurfaceQuality: outputs.signalSurfaceQuality,
    alignmentSummary: outputs.alignmentSummary,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function makeTelemetryRow(
  partial: Partial<VideoGtExportedRow> & Pick<VideoGtExportedRow, 'providerField' | 'acquisitionSurface' | 'rawValueJson'>,
): VideoGtExportedRow {
  return {
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    acquisitionOrdinal: 1,
    canonicalKey: null,
    rawIdentity: null,
    temporalClass: null,
    providerTimestamp: null,
    synqReceivedAt: '',
    requestStartedAt: null,
    requestCompletedAt: null,
    createdAt: '',
    sequenceNumber: null,
    physicalSampleFingerprint: null,
    provenanceJson: {},
    ...partial,
  };
}

// Backward-compatible aliases for tests
export const countValidatedSpeedObservations = countAlignmentEligibleSpeedObservations;

export function scoreSpeedOffset(params: {
  gtObservations: ExternalGtObservation[];
  speedSeries: Array<{ utcMs: number; value: number }>;
  clipStartUtcMs: number;
  offsetSeconds: number;
}): { mae: number; matched: number; total: number } {
  const eligible = params.gtObservations.filter(isAlignmentEligibleGroundTruth);
  const series: SpeedSeriesPoint[] = params.speedSeries.map((p, i) => ({
    utcMs: p.utcMs,
    value: p.value,
    row: makeTelemetryRow({
      providerField: 'speed',
      acquisitionSurface: 'LATEST_LIVE',
      providerTimestamp: new Date(p.utcMs).toISOString(),
      synqReceivedAt: new Date(p.utcMs).toISOString(),
      rawValueJson: p.value,
      acquisitionOrdinal: i + 1,
    }),
  }));
  const result = scoreSpeedResidual({
    eligibleObservations: eligible,
    speedSeries: series,
    searchAnchorMs: params.clipStartUtcMs,
    residualSeconds: params.offsetSeconds,
    maxGapSeconds: SURFACE_INTERPOLATION_GAP_SECONDS.LATEST_LIVE,
  });
  return { mae: result.mae, matched: result.matched, total: result.total };
}

export function searchSpeedOffsetCandidates(params: {
  gtObservations: ExternalGtObservation[];
  speedSeries: Array<{ utcMs: number; value: number }>;
  clipStartUtcMs: number;
  searchFromOffsetSeconds: number;
  searchToOffsetSeconds: number;
  stepSeconds?: number;
}): {
  candidates: Array<{ offsetSeconds: number; mae: number; matched: number; total: number }>;
  best: { offsetSeconds: number; mae: number } | null;
  ambiguous: boolean;
  status: AlignmentStatus;
} {
  const eligible = params.gtObservations.filter(isAlignmentEligibleGroundTruth);
  const series: SpeedSeriesPoint[] = params.speedSeries.map((p, i) => ({
    utcMs: p.utcMs,
    value: p.value,
    row: makeTelemetryRow({
      providerField: 'speed',
      acquisitionSurface: 'LATEST_LIVE',
      providerTimestamp: new Date(p.utcMs).toISOString(),
      synqReceivedAt: new Date(p.utcMs).toISOString(),
      rawValueJson: p.value,
      acquisitionOrdinal: i + 1,
    }),
  }));
  const search = searchSpeedResidualCandidates({
    eligibleObservations: eligible,
    speedSeries: series,
    searchAnchorMs: params.clipStartUtcMs,
    searchFromResidualSeconds: params.searchFromOffsetSeconds,
    searchToResidualSeconds: params.searchToOffsetSeconds,
    maxGapSeconds: SURFACE_INTERPOLATION_GAP_SECONDS.LATEST_LIVE,
    stepSeconds: params.stepSeconds,
  });
  return {
    candidates: search.candidates.map((c) => ({
      offsetSeconds: c.residualSeconds,
      mae: c.mae,
      matched: c.matched,
      total: c.total,
    })),
    best: search.best
      ? { offsetSeconds: search.best.residualSeconds, mae: search.best.mae }
      : null,
    ambiguous: search.ambiguous,
    status: search.status,
  };
}
