/**
 * RD003 External Video/Telemetry Alignment Workbench (DI-EV-0034A).
 *
 * Read-only: consumes immutable DI-EV-0033 telemetry + externally supplied video GT.
 * Does NOT fabricate video observations or mutate canonical telemetry.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import {
  extractNumericValue,
} from './reference-capture-signal-metrics';
import {
  REFERENCE_DRIVE_ID,
  SESSION_ID,
  sha256Hex,
  type VideoGtExportedRow,
} from './reference-capture-rd003-video-gt-export';

export const ALIGNMENT_SCHEMA_VERSION = '2026-09-03-rd003-video-gt-alignment-v1';
export const EVIDENCE_ID = 'DI-EV-0034A';

export const CANONICAL_TELEMETRY_JSONL_SHA256 =
  '69209a6d9e488d51c3aaf3b55dee5584ce622dc072a191b81e7061597cdda87a';

export const SESSION_START = '2026-09-02T18:59:15.695Z';
export const SESSION_STOP = '2026-09-02T19:36:22.970Z';

export const DERIVED_COMPARISON_SCHEMA_VERSION = '2026-09-03-derived-comparison-v1';
export const DERIVED_INTERPOLATION_METHOD = 'LINEAR_BOUNDED';
export const DERIVED_MAX_INTERPOLATION_GAP_SECONDS = 5;

export const ACQUISITION_SURFACES = ['HF_HISTORICAL', 'LATEST_LIVE', 'LATEST_SLOW'] as const;
export type AcquisitionSurface = (typeof ACQUISITION_SURFACES)[number];

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
  candidateAbsoluteTime?: {
    candidateStartUtc: string | null;
    uncertaintySeconds: number | null;
    derivation?: string | null;
    status: string;
  };
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

export type DerivedComparisonPoint = {
  videoTimeSeconds: number;
  absoluteUtcMs: number;
  telemetryValue: number | null;
  interpolationUsed: boolean;
  gapSeconds: number | null;
  status: 'MATCHED' | 'INSUFFICIENT_CADENCE' | 'NO_NEIGHBORS';
};

export type ClipAlignmentResult = {
  clipId: string;
  fileName: string;
  evidenceLayer: 'CANDIDATE_ALIGNMENT';
  alignmentStatus: AlignmentStatus;
  stages: {
    clockPrior: {
      status: string;
      candidateStartUtc: string | null;
      uncertaintySeconds: number | null;
      note: string;
    };
    speedFingerprint: {
      status: AlignmentStatus;
      bestOffsetSeconds: number | null;
      offsetUncertaintySeconds: number | null;
      competingOffsets: Array<{ offsetSeconds: number; score: number }>;
      ambiguityRuleTriggered: boolean;
    };
    multiSignalConfirmation: {
      status: AlignmentStatus;
      signalsEvaluated: string[];
    };
  };
  metrics: Record<string, number | string | null>;
  derivedComparisonLayer: {
    schemaVersion: string;
    method: string;
    interpolationMethod: string;
    maxInterpolationGapSeconds: number;
    sourceField: string;
    sourceSurface: string | null;
    points: DerivedComparisonPoint[];
  } | null;
  gearTiming: {
    GEAR_STATE_OBSERVED: string;
    GEAR_CHANGE_TIMING_VALIDATED: string;
    note: string;
  };
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
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

export function countValidatedSpeedObservations(clip: ExternalGtClip): number {
  return clip.observations.filter(
    (o) =>
      o.observationType === 'SPEED' &&
      o.value != null &&
      o.videoTimeSeconds != null &&
      (o.confidence === 'VALIDATED' || o.evidenceClass === 'DIRECT_VISUAL'),
  ).length;
}

export function hasUsableSpeedGroundTruth(clips: ExternalGtClip[]): boolean {
  return clips.some((c) => countValidatedSpeedObservations(c) >= 2);
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
    const sorted = [...group].sort((a, b) => (parseMs(a.synqReceivedAt) ?? 0) - (parseMs(b.synqReceivedAt) ?? 0));
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
        LATEST_LIVE_EQUALS_FRESH_PHYSICAL_SAMPLE: 'NO',
        freshnessEvaluatedBySurfaceName: 'NO',
      };
    }
  }
  return out;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function filterTelemetryByFieldAndSurface(
  rows: VideoGtExportedRow[],
  field: string,
  surface: AcquisitionSurface,
): VideoGtExportedRow[] {
  return rows.filter((r) => r.providerField === field && r.acquisitionSurface === surface);
}

export function buildSpeedSeries(
  rows: VideoGtExportedRow[],
): Array<{ utcMs: number; value: number; providerTimestamp: string; synqReceivedAt: string }> {
  return rows
    .map((r) => {
      const value = extractNumericValue(r.rawValueJson);
      const utcMs = parseMs(r.providerTimestamp);
      if (value == null || utcMs == null) return null;
      return {
        utcMs,
        value,
        providerTimestamp: r.providerTimestamp!,
        synqReceivedAt: r.synqReceivedAt,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v != null)
    .sort((a, b) => a.utcMs - b.utcMs);
}

export function deriveTelemetryAtUtc(
  series: Array<{ utcMs: number; value: number }>,
  targetUtcMs: number,
  maxGapSeconds: number = DERIVED_MAX_INTERPOLATION_GAP_SECONDS,
): DerivedComparisonPoint {
  if (series.length === 0) {
    return {
      videoTimeSeconds: 0,
      absoluteUtcMs: targetUtcMs,
      telemetryValue: null,
      interpolationUsed: false,
      gapSeconds: null,
      status: 'NO_NEIGHBORS',
    };
  }
  let before: (typeof series)[number] | null = null;
  let after: (typeof series)[number] | null = null;
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
      status: 'MATCHED',
    };
  }
  if (!before || !after) {
    return {
      videoTimeSeconds: 0,
      absoluteUtcMs: targetUtcMs,
      telemetryValue: null,
      interpolationUsed: false,
      gapSeconds: null,
      status: 'INSUFFICIENT_CADENCE',
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
      status: 'INSUFFICIENT_CADENCE',
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
    status: 'MATCHED',
  };
}

export function scoreSpeedOffset(params: {
  gtObservations: ExternalGtObservation[];
  speedSeries: Array<{ utcMs: number; value: number }>;
  clipStartUtcMs: number;
  offsetSeconds: number;
}): { mae: number; matched: number; total: number } {
  const speedObs = params.gtObservations.filter(
    (o) => o.observationType === 'SPEED' && o.value != null && o.videoTimeSeconds != null,
  );
  if (speedObs.length === 0) return { mae: Number.POSITIVE_INFINITY, matched: 0, total: 0 };

  let sumAbs = 0;
  let matched = 0;
  for (const obs of speedObs) {
    const absMs =
      params.clipStartUtcMs + (obs.videoTimeSeconds! + params.offsetSeconds) * 1000;
    const derived = deriveTelemetryAtUtc(params.speedSeries, absMs);
    if (derived.status !== 'MATCHED' || derived.telemetryValue == null) continue;
    const gtVal = typeof obs.value === 'number' ? obs.value : Number(obs.value);
    if (!Number.isFinite(gtVal)) continue;
    sumAbs += Math.abs(derived.telemetryValue - gtVal);
    matched += 1;
  }
  if (matched === 0) return { mae: Number.POSITIVE_INFINITY, matched: 0, total: speedObs.length };
  return { mae: sumAbs / matched, matched, total: speedObs.length };
}

export const AMBIGUITY_MAE_DELTA_KMH = 1.0;

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
  const step = params.stepSeconds ?? 0.5;
  const candidates: Array<{ offsetSeconds: number; mae: number; matched: number; total: number }> =
    [];
  for (let offset = params.searchFromOffsetSeconds; offset <= params.searchToOffsetSeconds; offset += step) {
    const score = scoreSpeedOffset({
      gtObservations: params.gtObservations,
      speedSeries: params.speedSeries,
      clipStartUtcMs: params.clipStartUtcMs,
      offsetSeconds: offset,
    });
    if (Number.isFinite(score.mae)) {
      candidates.push({ offsetSeconds: offset, ...score });
    }
  }
  candidates.sort((a, b) => a.mae - b.mae || a.offsetSeconds - b.offsetSeconds);
  if (candidates.length === 0) {
    return { candidates: [], best: null, ambiguous: false, status: 'INSUFFICIENT_GROUND_TRUTH' };
  }
  const best = candidates[0]!;
  const second = candidates[1];
  const ambiguous =
    second != null && Math.abs(second.mae - best.mae) <= AMBIGUITY_MAE_DELTA_KMH;
  let status: AlignmentStatus = 'STRONG_CANDIDATE';
  if (ambiguous) status = 'AMBIGUOUS';
  if (best.mae > 15) status = 'NOT_IDENTIFIABLE';
  return {
    candidates,
    best: { offsetSeconds: best.offsetSeconds, mae: best.mae },
    ambiguous,
    status,
  };
}

export function stageClockPrior(clip: ExternalGtClip): ClipAlignmentResult['stages']['clockPrior'] {
  const cat = clip.candidateAbsoluteTime;
  return {
    status: cat?.status ?? 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
    candidateStartUtc: cat?.candidateStartUtc ?? null,
    uncertaintySeconds: cat?.uncertaintySeconds ?? null,
    note: 'Visible vehicle clock establishes broad candidate region only — not sole alignment authority',
  };
}

export function alignClip(params: {
  clip: ExternalGtClip;
  telemetryRows: VideoGtExportedRow[];
  speedSurface?: AcquisitionSurface;
}): ClipAlignmentResult {
  const speedSurface = params.speedSurface ?? 'LATEST_LIVE';
  const speedRows = filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', speedSurface);
  const speedSeries = buildSpeedSeries(speedRows);
  const clockPrior = stageClockPrior(params.clip);

  const validatedSpeedCount = countValidatedSpeedObservations(params.clip);
  const usableObs = params.clip.observations.filter(
    (o) => o.observationType === 'SPEED' && o.value != null && o.videoTimeSeconds != null,
  );

  if (validatedSpeedCount < 2 && usableObs.length < 2) {
    return {
      clipId: params.clip.clipId,
      fileName: params.clip.fileName,
      evidenceLayer: 'CANDIDATE_ALIGNMENT',
      alignmentStatus: 'PENDING_EXTERNAL_GT',
      stages: {
        clockPrior,
        speedFingerprint: {
          status: 'INSUFFICIENT_GROUND_TRUTH',
          bestOffsetSeconds: null,
          offsetUncertaintySeconds: null,
          competingOffsets: [],
          ambiguityRuleTriggered: false,
        },
        multiSignalConfirmation: {
          status: 'INSUFFICIENT_GROUND_TRUTH',
          signalsEvaluated: [],
        },
      },
      metrics: {
        CLOCK_OFFSET_SECONDS: null,
        NUMBER_OF_GT_POINTS: validatedSpeedCount,
        COVERAGE_RATIO: null,
        SPEED_MAE_KMH: null,
      },
      derivedComparisonLayer: null,
      gearTiming: {
        GEAR_STATE_OBSERVED: 'NOT_EVALUATED',
        GEAR_CHANGE_TIMING_VALIDATED: 'NO',
        note: 'ActualGear cadence/freshness must support timing validation separately from video gear display',
      },
    };
  }

  const clipStartMs = parseMs(clockPrior.candidateStartUtc);
  if (clipStartMs == null) {
    return {
      clipId: params.clip.clipId,
      fileName: params.clip.fileName,
      evidenceLayer: 'CANDIDATE_ALIGNMENT',
      alignmentStatus: 'INSUFFICIENT_GROUND_TRUTH',
      stages: {
        clockPrior,
        speedFingerprint: {
          status: 'INSUFFICIENT_GROUND_TRUTH',
          bestOffsetSeconds: null,
          offsetUncertaintySeconds: null,
          competingOffsets: [],
          ambiguityRuleTriggered: false,
        },
        multiSignalConfirmation: { status: 'INSUFFICIENT_GROUND_TRUTH', signalsEvaluated: [] },
      },
      metrics: { CLOCK_OFFSET_SECONDS: null, NUMBER_OF_GT_POINTS: usableObs.length },
      derivedComparisonLayer: null,
      gearTiming: {
        GEAR_STATE_OBSERVED: 'NOT_EVALUATED',
        GEAR_CHANGE_TIMING_VALIDATED: 'NO',
        note: 'Requires validated external GT and supported telemetry cadence',
      },
    };
  }

  const uncertainty = clockPrior.uncertaintySeconds ?? 30;
  const search = searchSpeedOffsetCandidates({
    gtObservations: params.clip.observations,
    speedSeries,
    clipStartUtcMs: clipStartMs,
    searchFromOffsetSeconds: -uncertainty,
    searchToOffsetSeconds: uncertainty,
    stepSeconds: 0.5,
  });

  const hasShiftObs = params.clip.observations.some((o) => o.observationType === 'SHIFT_TRANSITION');
  const gearRows = filterTelemetryByFieldAndSurface(
    params.telemetryRows,
    'powertrainTransmissionActualGear',
    'LATEST_SLOW',
  );

  return {
    clipId: params.clip.clipId,
    fileName: params.clip.fileName,
    evidenceLayer: 'CANDIDATE_ALIGNMENT',
    alignmentStatus: search.status,
    stages: {
      clockPrior,
      speedFingerprint: {
        status: search.status,
        bestOffsetSeconds: search.best?.offsetSeconds ?? null,
        offsetUncertaintySeconds: uncertainty,
        competingOffsets: search.candidates.slice(0, 5).map((c) => ({
          offsetSeconds: c.offsetSeconds,
          score: c.mae,
        })),
        ambiguityRuleTriggered: search.ambiguous,
      },
      multiSignalConfirmation: {
        status: search.status === 'STRONG_CANDIDATE' ? 'STRONG_CANDIDATE' : search.status,
        signalsEvaluated: ['speed'],
      },
    },
    metrics: {
      CLOCK_OFFSET_SECONDS: search.best?.offsetSeconds ?? null,
      CLOCK_OFFSET_UNCERTAINTY_SECONDS: uncertainty,
      NUMBER_OF_GT_POINTS: usableObs.length,
      NUMBER_OF_MATCHED_POINTS: search.candidates[0]?.matched ?? null,
      COVERAGE_RATIO:
        search.candidates[0] && search.candidates[0].total > 0
          ? search.candidates[0].matched / search.candidates[0].total
          : null,
      SPEED_MAE_KMH: search.best?.mae ?? null,
      EPISODE_DETECTABILITY: params.clip.negativeControl ? 'NEGATIVE_CONTROL' : 'EVALUATED',
    },
    derivedComparisonLayer: {
      schemaVersion: DERIVED_COMPARISON_SCHEMA_VERSION,
      method: 'DERIVED_COMPARISON_LAYER',
      interpolationMethod: DERIVED_INTERPOLATION_METHOD,
      maxInterpolationGapSeconds: DERIVED_MAX_INTERPOLATION_GAP_SECONDS,
      sourceField: 'speed',
      sourceSurface: speedSurface,
      points: usableObs.map((obs) => {
        const absMs =
          clipStartMs + (obs.videoTimeSeconds! + (search.best?.offsetSeconds ?? 0)) * 1000;
        const pt = deriveTelemetryAtUtc(speedSeries, absMs);
        return { ...pt, videoTimeSeconds: obs.videoTimeSeconds! };
      }),
    },
    gearTiming: {
      GEAR_STATE_OBSERVED: gearRows.length > 0 ? 'YES' : 'NOT_OBSERVED',
      GEAR_CHANGE_TIMING_VALIDATED:
        hasShiftObs && gearRows.length < 5 ? 'NO' : hasShiftObs ? 'NOT_IDENTIFIABLE' : 'NO',
      note: 'Video gear display (e.g. IMG_2810 S2→S3) does not validate DIMO ActualGear shift timing without cadence proof',
    },
  };
}

export function buildCrossClipClockModel(
  clipAlignments: ClipAlignmentResult[],
): Record<string, unknown> {
  const offsets = clipAlignments
    .map((c) => c.metrics.CLOCK_OFFSET_SECONDS)
    .filter((v): v is number => typeof v === 'number');
  if (offsets.length < 2) {
    return {
      evidenceLayer: 'DERIVED_SIGNAL_QUALITY',
      modelOutcome: 'PENDING_EXTERNAL_GT',
      note: 'Insufficient validated per-clip offsets for cross-clip model',
      clipOffsets: clipAlignments.map((c) => ({
        clipId: c.clipId,
        offsetSeconds: c.metrics.CLOCK_OFFSET_SECONDS,
        status: c.alignmentStatus,
      })),
    };
  }
  const min = Math.min(...offsets);
  const max = Math.max(...offsets);
  const spread = max - min;
  let modelOutcome: (typeof CLOCK_MODEL_OUTCOMES)[number] = 'CONSTANT_OFFSET';
  if (spread > 5) modelOutcome = 'NON_CONSTANT';
  else if (spread > 1) modelOutcome = 'OFFSET_WITH_QUANTIZATION';
  return {
    evidenceLayer: 'DERIVED_SIGNAL_QUALITY',
    modelOutcome,
    offsetSpreadSeconds: spread,
    minOffsetSeconds: min,
    maxOffsetSeconds: max,
    clipOffsets: clipAlignments.map((c) => ({
      clipId: c.clipId,
      offsetSeconds: c.metrics.CLOCK_OFFSET_SECONDS,
      status: c.alignmentStatus,
    })),
    clockDisplayQuantizationUncertaintySeconds: 60,
    note: 'Instrument-cluster clock resolves to minute display; transitions are stronger anchors than static minute',
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

  const hasValidated = clipAlignments.some((c) => c.alignmentStatus === 'VALIDATED');
  const hasPending = clipAlignments.some((c) => c.alignmentStatus === 'PENDING_EXTERNAL_GT');

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
      EXTERNAL_GT_VALUES_COMPLETE: hasUsableSpeedGroundTruth(params.externalGt.clips) ? 'PARTIAL' : 'NO',
      VIDEO_ALIGNMENT_STATUS: hasPending
        ? 'AWAITING_EXTERNAL_GT_INGESTION'
        : hasValidated
          ? 'CANDIDATE_ALIGNMENTS_AVAILABLE'
          : 'AWAITING_EXTERNAL_GT_INGESTION',
      GROUND_TRUTH_VALIDATED: 'NO',
      VIDEO_CLOCK_USED_AS_SOLE_ALIGNMENT_AUTHORITY: 'NO',
      ACTUAL_GEAR_USED_AS_PRECISE_SHIFT_AUTHORITY: 'NO',
      SIGNED_SPEED_FABRICATED_FROM_UNSIGNED_SPEED: 'NO',
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
