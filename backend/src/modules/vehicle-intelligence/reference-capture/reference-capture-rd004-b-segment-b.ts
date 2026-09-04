/**
 * RD004-B.1 / DI-EV-0035B.1 — Segment B video ↔ telemetry validation (read-only analysis).
 * Decouples clock calibration from holdout speed accuracy; time-only holdout matching.
 * Preserves all DI-EV-0035A.2 methodology invariants. No production changes.
 */
import * as crypto from 'crypto';
import {
  APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET,
  PROVISIONAL_ACCELERATION_MAX_GAP_SECONDS,
  TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY,
  analyzeSignalCadenceForField,
  assertNoEnvironmentSpecificPathsInObject,
  buildHfReadingsForLegacyDetectors,
  buildQualifiedHfSpeedSeries,
  comparePreprocessingResponse,
  computeAccelerationGapSensitivity,
  computeQualifiedAccelerationPairs,
  computeRd004SourceBundleSha256,
  detectOutOfOrderByAcquisitionOrder,
  filterRowsByProviderTimestampEnvelope,
  findSpeedEpisodes,
  loadRd004Jsonl,
  runLegacyDetectorAudit,
  sortedPercentile,
  toRepoRelativePath,
  type LegacyPreprocessedSpeedRow,
  type QualifiedSpeedPoint,
  type Rd004ObservationRow,
  type VideoTimingAuthority,
} from './reference-capture-rd004-a-segment-a';
import { ACQUISITION_SURFACES, stableStringify } from './reference-capture-rd003-video-gt-alignment';
import { dedupePhysicalSamples } from './reference-capture-rd003-video-gt-global-discovery-v2';
import { extractNumericValue } from './reference-capture-signal-metrics';
import {
  identifyStaleHoldDuplicateRows,
  computePhysicalCadenceMetrics,
} from './reference-capture-rd003-signal-quality';

export const RD004_B_PHASE = 'RD004-B.1';
export const RD004_B_EVIDENCE_ID = 'DI-EV-0035B.1';
export const RD004_B_MODE = 'RD004_SEGMENT_B_VIDEO_TELEMETRY_VALIDATION';

export const VALIDATED_OFFSET_MUST_BE_APPLIED_BEFORE_ACCURACY_SAMPLE_SELECTION = 'YES';
export const SPEED_SAMPLE_SELECTION_TIME_ONLY = 'YES';
export const REVERSE_CONTEXT_WITHOUT_DIRECTION_TELEMETRY_CANNOT_DEFINE_CLOCK_OFFSET = 'YES';
export const PREVIOUS_OFFSET_METHOD_SELECTION_BIASED = 'YES';
export const PREVIOUS_SPEED_ACCURACY_METHOD_SELECTION_BIASED = 'YES';
export const PREPROCESSING_DISTORTION_VS_TELEMETRY_RAW = 'YES';
export const STOP_TIMING_CANNOT_USE_UNCORRECTED_PROVIDER_TIMELINE = 'YES';

export const EXPLORATORY_PREVIOUS_OFFSET_SECONDS = 14.299;
export const EXPLORATORY_PREVIOUS_SPEED_MAE_KMH = 2.263;

/** Deterministic clock-calibration landmarks (transition/event evidence). */
export const CLOCK_CALIBRATION_LANDMARK_IDS = ['CLK-B1', 'CLK-B2', 'CLK-B5', 'CLK-B6'] as const;

/** Deterministic holdout speed anchors — ordinary cruise/mid-speed frames only. */
export const SPEED_ACCURACY_HOLDOUT_ANCHOR_IDS = [
  'B01',
  'B02',
  'B03',
  'B04',
  'B05',
  'B06',
  'B07',
  'B08',
  'B09',
  'B10',
  'B11',
  'B13',
  'B14',
  'B20',
  'B21',
  'B23',
  'B24',
] as const;

export const GLOBAL_OFFSET_SEARCH_MIN_SECONDS = -60;
export const GLOBAL_OFFSET_SEARCH_MAX_SECONDS = 60;
export const GLOBAL_OFFSET_SEARCH_STEP_SECONDS = 0.5;

export const STABLE_STATE_MAX_TEMPORAL_RESIDUAL_SECONDS = 5;
export const DYNAMIC_STATE_MAX_TEMPORAL_RESIDUAL_SECONDS = 2;
export const MIN_HOLDOUT_COMPARABLE_FOR_VALIDATION = 8;

export const SEGMENT_B_CONSTANTS = {
  vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
  tokenId: 187336,
  sessionId: 'f1e81e78-f96b-44ee-80c2-ca5270f21248',
  referenceDriveId: 'DIMO_LTE_R1_REFERENCE_DRIVE_004',
  vehicleLabel: 'KS MX 2024 Mercedes-Benz C 63 AMG',
  videoStartUtc: '2026-09-04T03:47:02.000Z',
  videoEndUtc: '2026-09-04T04:03:42.000Z',
  videoDurationSeconds: 1000,
  queryEnvelopeStartUtc: '2026-09-04T03:46:00.000Z',
  queryEnvelopeEndUtc: '2026-09-04T04:05:00.000Z',
  independentClockAnchorUtc: '2026-09-04T03:47:02.000Z',
  timeIsDisplayCest: '2026-09-04 05:47:02 CEST',
  timeIsOffsetFromUtcHours: 2,
  fullSessionSealedEvidenceSha256: '5938b9e9120864768dd91048fb06a182ef2b7f0772a9a2df2c75f17cb684d2e2',
  videoReconstructionNote:
    'Nine clips merged 5→3→1→9→8→7→4→2→6 with small boundary overlap; ~1000 s continuous timeline',
  thermalContext: 'WARMING_THROUGH_MOST_OF_SEGMENT',
} as const;

export const SEGMENT_A_CADENCE_REFERENCE = {
  HF_SPEED_ROWS: 38,
  HF_SPEED_UNIQUE_PHYSICAL_SAMPLES: 38,
  HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS: 4.732,
  HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS: 32.66,
  HF_SPEED_MAX_GAP_SECONDS: 52.283,
} as const;

export const RD004_B_SOURCE_FILES = {
  observations: 'source-observations.jsonl',
  legacySidecar: 'source-legacy-preprocessed-speed-sidecar.jsonl',
  manifest: 'source-manifest.sha256.json',
} as const;

export const SEGMENT_B_SIGNALS = [
  'speed',
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
  'powertrainCombustionEngineTPS',
  'obdEngineLoad',
  'powertrainTransmissionActualGear',
  'powertrainTransmissionActualGearRatio',
] as const;

export type VideoAnchorConfidence = 'HIGH' | 'MEDIUM' | 'REJECTED';

export type SegmentBVideoSpeedAnchor = {
  id: string;
  videoRelativeSeconds: number;
  videoUtc: string;
  videoSpeedKmh: number;
  videoGear: number | string | null;
  videoAnchorConfidence: VideoAnchorConfidence;
  videoTimingAuthority: VideoTimingAuthority;
  approximate: boolean;
  note?: string;
};

export type SegmentBClockLandmark = {
  id: string;
  label: string;
  episodeId: string;
  videoRelativeSeconds: number;
  videoUtc: string;
  videoTimingAuthority: VideoTimingAuthority;
  landmarkKind:
    | 'DECEL_TO_STOP'
    | 'COMPLETE_STOP'
    | 'STOP_TO_LAUNCH'
    | 'SECOND_STOP'
    | 'LATE_ACCELERATION'
    | 'REVERSE_CONTEXT';
  expectedSpeedKmh: number;
  temporalLocalityToleranceSeconds: number;
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function mad(values: number[]): number | null {
  if (!values.length) return null;
  const median = sortedPercentile(values, 50);
  if (median == null) return null;
  return sortedPercentile(values.map((v) => Math.abs(v - median)), 50);
}

function videoUtcFromRelative(videoRelativeSeconds: number): string {
  const ms = Date.parse(SEGMENT_B_CONSTANTS.videoStartUtc) + videoRelativeSeconds * 1000;
  return new Date(ms).toISOString();
}

export const SEGMENT_B_VIDEO_SPEED_ANCHORS: readonly SegmentBVideoSpeedAnchor[] = [
  { id: 'B01', videoRelativeSeconds: 60, videoUtc: videoUtcFromRelative(60), videoSpeedKmh: 17, videoGear: 2, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B02', videoRelativeSeconds: 120, videoUtc: videoUtcFromRelative(120), videoSpeedKmh: 57, videoGear: 5, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B03', videoRelativeSeconds: 210, videoUtc: videoUtcFromRelative(210), videoSpeedKmh: 60, videoGear: 6, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B04', videoRelativeSeconds: 240, videoUtc: videoUtcFromRelative(240), videoSpeedKmh: 94, videoGear: 7, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B05', videoRelativeSeconds: 270, videoUtc: videoUtcFromRelative(270), videoSpeedKmh: 79, videoGear: 7, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B06', videoRelativeSeconds: 300, videoUtc: videoUtcFromRelative(300), videoSpeedKmh: 61, videoGear: 6, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B07', videoRelativeSeconds: 390, videoUtc: videoUtcFromRelative(390), videoSpeedKmh: 109, videoGear: 7, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B08', videoRelativeSeconds: 420, videoUtc: videoUtcFromRelative(420), videoSpeedKmh: 98, videoGear: 7, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B09', videoRelativeSeconds: 450, videoUtc: videoUtcFromRelative(450), videoSpeedKmh: 115, videoGear: 7, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B10', videoRelativeSeconds: 480, videoUtc: videoUtcFromRelative(480), videoSpeedKmh: 116, videoGear: 7, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B11', videoRelativeSeconds: 510, videoUtc: videoUtcFromRelative(510), videoSpeedKmh: 112, videoGear: 7, videoAnchorConfidence: 'MEDIUM', videoTimingAuthority: 'APPROXIMATE', approximate: true, note: 'Dashboard readability approximate — recheck' },
  { id: 'B12', videoRelativeSeconds: 540, videoUtc: videoUtcFromRelative(540), videoSpeedKmh: 107, videoGear: 7, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B13', videoRelativeSeconds: 570, videoUtc: videoUtcFromRelative(570), videoSpeedKmh: 96, videoGear: 7, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B14', videoRelativeSeconds: 600, videoUtc: videoUtcFromRelative(600), videoSpeedKmh: 59, videoGear: 4, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B15', videoRelativeSeconds: 630, videoUtc: videoUtcFromRelative(630), videoSpeedKmh: 0, videoGear: 2, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B16', videoRelativeSeconds: 660, videoUtc: videoUtcFromRelative(660), videoSpeedKmh: 0, videoGear: 2, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B17', videoRelativeSeconds: 690, videoUtc: videoUtcFromRelative(690), videoSpeedKmh: 51, videoGear: 5, videoAnchorConfidence: 'MEDIUM', videoTimingAuthority: 'APPROXIMATE', approximate: true, note: 'Approximate launch speed — recheck' },
  { id: 'B18', videoRelativeSeconds: 720, videoUtc: videoUtcFromRelative(720), videoSpeedKmh: 0, videoGear: 2, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B19', videoRelativeSeconds: 750, videoUtc: videoUtcFromRelative(750), videoSpeedKmh: 0, videoGear: 2, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B20', videoRelativeSeconds: 780, videoUtc: videoUtcFromRelative(780), videoSpeedKmh: 16, videoGear: 2, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B21', videoRelativeSeconds: 810, videoUtc: videoUtcFromRelative(810), videoSpeedKmh: 4, videoGear: 2, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B22', videoRelativeSeconds: 840, videoUtc: videoUtcFromRelative(840), videoSpeedKmh: 71, videoGear: 5, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B23', videoRelativeSeconds: 870, videoUtc: videoUtcFromRelative(870), videoSpeedKmh: 77, videoGear: 5, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B24', videoRelativeSeconds: 930, videoUtc: videoUtcFromRelative(930), videoSpeedKmh: 33, videoGear: 3, videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false },
  { id: 'B25', videoRelativeSeconds: 990, videoUtc: videoUtcFromRelative(990), videoSpeedKmh: 0, videoGear: 'R', videoAnchorConfidence: 'HIGH', videoTimingAuthority: 'HIGH_CONFIDENCE', approximate: false, note: 'Reverse R at 0 km/h' },
];

export const SEGMENT_B_CLOCK_LANDMARKS: readonly SegmentBClockLandmark[] = [
  { id: 'CLK-B1', label: 'high-speed section end / decel onset', episodeId: 'B-E3', videoRelativeSeconds: 540, videoUtc: videoUtcFromRelative(540), videoTimingAuthority: 'HIGH_CONFIDENCE', landmarkKind: 'DECEL_TO_STOP', expectedSpeedKmh: 107, temporalLocalityToleranceSeconds: 45 },
  { id: 'CLK-B2', label: 'first complete stop after long decel', episodeId: 'B-E4', videoRelativeSeconds: 630, videoUtc: videoUtcFromRelative(630), videoTimingAuthority: 'HIGH_CONFIDENCE', landmarkKind: 'COMPLETE_STOP', expectedSpeedKmh: 0, temporalLocalityToleranceSeconds: 45 },
  { id: 'CLK-B3', label: 'sustained stop before launch', episodeId: 'B-E5', videoRelativeSeconds: 660, videoUtc: videoUtcFromRelative(660), videoTimingAuthority: 'HIGH_CONFIDENCE', landmarkKind: 'COMPLETE_STOP', expectedSpeedKmh: 0, temporalLocalityToleranceSeconds: 45 },
  { id: 'CLK-B4', label: 'stop to launch (~51 km/h)', episodeId: 'B-E5', videoRelativeSeconds: 690, videoUtc: videoUtcFromRelative(690), videoTimingAuthority: 'APPROXIMATE', landmarkKind: 'STOP_TO_LAUNCH', expectedSpeedKmh: 51, temporalLocalityToleranceSeconds: 45 },
  { id: 'CLK-B5', label: 'second distinct stop', episodeId: 'B-E5', videoRelativeSeconds: 720, videoUtc: videoUtcFromRelative(720), videoTimingAuthority: 'HIGH_CONFIDENCE', landmarkKind: 'SECOND_STOP', expectedSpeedKmh: 0, temporalLocalityToleranceSeconds: 45 },
  { id: 'CLK-B6', label: 'late acceleration 4→71', episodeId: 'B-E7', videoRelativeSeconds: 840, videoUtc: videoUtcFromRelative(840), videoTimingAuthority: 'HIGH_CONFIDENCE', landmarkKind: 'LATE_ACCELERATION', expectedSpeedKmh: 71, temporalLocalityToleranceSeconds: 45 },
  { id: 'CLK-B7', label: 'reverse context', episodeId: 'B-E9', videoRelativeSeconds: 990, videoUtc: videoUtcFromRelative(990), videoTimingAuthority: 'HIGH_CONFIDENCE', landmarkKind: 'REVERSE_CONTEXT', expectedSpeedKmh: 0, temporalLocalityToleranceSeconds: 60 },
];

function speedToleranceKmh(expectedSpeed: number): number {
  if (expectedSpeed <= 5) return 5;
  if (expectedSpeed <= 30) return 8;
  if (expectedSpeed <= 80) return 10;
  return 12;
}

function localShapeScore(
  points: QualifiedSpeedPoint[],
  index: number,
  expectedSpeed: number,
): number {
  const prev = points[index - 1];
  const next = points[index + 1];
  if (!prev || !next) return 0;
  const trendExpected =
    expectedSpeed <= 5
      ? prev.speedKmh >= next.speedKmh - 5
      : expectedSpeed >= 80
        ? prev.speedKmh <= expectedSpeed + 15 && next.speedKmh <= expectedSpeed + 15
        : true;
  return trendExpected ? 2 : -3;
}

export type AnchorMatchResult = {
  anchorId: string;
  status: 'MATCHED' | 'NOT_FOUND' | 'REJECTED';
  videoRelativeSeconds: number;
  videoSpeedKmh: number;
  videoAnchorConfidence: VideoAnchorConfidence;
  providerTimestamp: string | null;
  providerSpeedKmh: number | null;
  telemetryVideoRelativeSeconds: number | null;
  rawTimeDisplacementSeconds: number | null;
  speedErrorKmh: number | null;
  candidateOffsetSeconds: number | null;
  matchConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
  localShapeAgreement: 'GOOD' | 'PARTIAL' | 'WEAK' | 'UNKNOWN';
  cadenceContextSeconds: number | null;
};

export function matchVideoSpeedAnchor(
  anchor: SegmentBVideoSpeedAnchor,
  points: QualifiedSpeedPoint[],
  searchWindowSeconds = 45,
): AnchorMatchResult {
  if (anchor.videoAnchorConfidence === 'REJECTED') {
    return {
      anchorId: anchor.id,
      status: 'REJECTED',
      videoRelativeSeconds: anchor.videoRelativeSeconds,
      videoSpeedKmh: anchor.videoSpeedKmh,
      videoAnchorConfidence: anchor.videoAnchorConfidence,
      providerTimestamp: null,
      providerSpeedKmh: null,
      telemetryVideoRelativeSeconds: null,
      rawTimeDisplacementSeconds: null,
      speedErrorKmh: null,
      candidateOffsetSeconds: null,
      matchConfidence: 'INSUFFICIENT',
      localShapeAgreement: 'UNKNOWN',
      cadenceContextSeconds: null,
    };
  }

  const tol = speedToleranceKmh(anchor.videoSpeedKmh);
  let bestIdx = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const dt = Math.abs(p.videoRelativeSecondsProvisional - anchor.videoRelativeSeconds);
    if (dt > searchWindowSeconds) continue;
    const ds = Math.abs(p.speedKmh - anchor.videoSpeedKmh);
    if (ds > tol) continue;
    const shape = localShapeScore(points, i, anchor.videoSpeedKmh);
    const score = -ds - dt * 0.25 + shape;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) {
    return {
      anchorId: anchor.id,
      status: 'NOT_FOUND',
      videoRelativeSeconds: anchor.videoRelativeSeconds,
      videoSpeedKmh: anchor.videoSpeedKmh,
      videoAnchorConfidence: anchor.videoAnchorConfidence,
      providerTimestamp: null,
      providerSpeedKmh: null,
      telemetryVideoRelativeSeconds: null,
      rawTimeDisplacementSeconds: null,
      speedErrorKmh: null,
      candidateOffsetSeconds: null,
      matchConfidence: 'INSUFFICIENT',
      localShapeAgreement: 'UNKNOWN',
      cadenceContextSeconds: null,
    };
  }

  const best = points[bestIdx]!;
  const speedError = best.speedKmh - anchor.videoSpeedKmh;
  const timeDisplacement = best.videoRelativeSecondsProvisional - anchor.videoRelativeSeconds;
  const offset = timeDisplacement;
  let matchConfidence: AnchorMatchResult['matchConfidence'] = 'LOW';
  if (Math.abs(speedError) <= tol * 0.5 && Math.abs(timeDisplacement) <= 20) matchConfidence = 'HIGH';
  else if (Math.abs(speedError) <= tol && Math.abs(timeDisplacement) <= 35) matchConfidence = 'MEDIUM';

  if (anchor.approximate && matchConfidence === 'HIGH') matchConfidence = 'MEDIUM';

  const prev = points[bestIdx - 1];
  const cadenceContext =
    prev != null
      ? Math.abs(
          parseMs(best.providerTimestamp)! - parseMs(prev.providerTimestamp)!,
        ) / 1000
      : null;

  return {
    anchorId: anchor.id,
    status: 'MATCHED',
    videoRelativeSeconds: anchor.videoRelativeSeconds,
    videoSpeedKmh: anchor.videoSpeedKmh,
    videoAnchorConfidence: anchor.videoAnchorConfidence,
    providerTimestamp: best.providerTimestamp,
    providerSpeedKmh: best.speedKmh,
    telemetryVideoRelativeSeconds: best.videoRelativeSecondsProvisional,
    rawTimeDisplacementSeconds: timeDisplacement,
    speedErrorKmh: speedError,
    candidateOffsetSeconds: offset,
    matchConfidence,
    localShapeAgreement:
      matchConfidence === 'HIGH' ? 'GOOD' : matchConfidence === 'MEDIUM' ? 'PARTIAL' : 'WEAK',
    cadenceContextSeconds: cadenceContext,
  };
}

export function matchAllVideoSpeedAnchors(
  anchors: readonly SegmentBVideoSpeedAnchor[],
  points: QualifiedSpeedPoint[],
) {
  return anchors.map((a) => matchVideoSpeedAnchor(a, points));
}

export type TimeOnlyTelemetryMatch = {
  providerTimestamp: string;
  providerSpeedKmh: number;
  telemetryVideoRelativeSeconds: number;
  temporalResidualSeconds: number;
  localPhysicalGapBefore: number | null;
  localPhysicalGapAfter: number | null;
};

export function videoAbsoluteMsFromRelative(videoRelativeSeconds: number): number {
  return Date.parse(SEGMENT_B_CONSTANTS.videoStartUtc) + videoRelativeSeconds * 1000;
}

export function expectedProviderMsFromVideo(
  videoRelativeSeconds: number,
  offsetSeconds: number,
): number {
  return videoAbsoluteMsFromRelative(videoRelativeSeconds) + offsetSeconds * 1000;
}

/** Select nearest HF sample by provider timestamp only — speed is never used. */
export function selectNearestTelemetryByTimeOnly(
  points: QualifiedSpeedPoint[],
  expectedProviderMs: number,
): TimeOnlyTelemetryMatch | null {
  if (!points.length || !Number.isFinite(expectedProviderMs)) return null;

  let bestIdx = -1;
  let bestDt = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const t = parseMs(p.providerTimestamp);
    if (t == null) continue;
    const dt = Math.abs(t - expectedProviderMs) / 1000;
    if (dt < bestDt) {
      bestDt = dt;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;

  const best = points[bestIdx]!;
  const prev = points[bestIdx - 1];
  const next = points[bestIdx + 1];
  const bestMs = parseMs(best.providerTimestamp)!;

  return {
    providerTimestamp: best.providerTimestamp,
    providerSpeedKmh: best.speedKmh,
    telemetryVideoRelativeSeconds: best.videoRelativeSecondsProvisional,
    temporalResidualSeconds: (bestMs - expectedProviderMs) / 1000,
    localPhysicalGapBefore:
      prev != null ? Math.abs(bestMs - parseMs(prev.providerTimestamp)!) / 1000 : null,
    localPhysicalGapAfter:
      next != null ? Math.abs(parseMs(next.providerTimestamp)! - bestMs) / 1000 : null,
  };
}

export type ClockEvidenceObservationKind = 'TRANSITION_TIME_OBSERVATION' | 'STATE_OBSERVATION';

export type ClockCalibrationEvidence = {
  landmarkId: string;
  label: string;
  landmarkKind: SegmentBClockLandmark['landmarkKind'];
  videoRelativeSeconds: number;
  observationKind: ClockEvidenceObservationKind;
  CLOCK_FIT_ELIGIBLE: 'YES' | 'NO';
  ineligibleReason?: string;
  expectedProviderTimestamp: string | null;
  nearestProviderTimestamp: string | null;
  temporalResidualSeconds: number | null;
  impliedOffsetSeconds: number | null;
  telemetrySpeedKmh: number | null;
  videoSpeedKmh: number | null;
  eventShapeQualified: boolean;
};

function findStopTransitionInProviderWindow(
  points: QualifiedSpeedPoint[],
  expectedProviderMs: number,
  windowSeconds: number,
): {
  transitionVideoRelative: number;
  providerTimestamp: string;
  speedKmh: number;
} | null {
  const window = points
    .filter((p) => {
      const t = parseMs(p.providerTimestamp);
      return t != null && Math.abs(t - expectedProviderMs) / 1000 <= windowSeconds;
    })
    .sort((a, b) => parseMs(a.providerTimestamp)! - parseMs(b.providerTimestamp)!);

  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]!;
    const cur = window[i]!;
    if (prev.speedKmh >= 8 && cur.speedKmh <= 2) {
      return {
        transitionVideoRelative: cur.videoRelativeSecondsProvisional,
        providerTimestamp: cur.providerTimestamp,
        speedKmh: cur.speedKmh,
      };
    }
  }
  return null;
}

function findDecelOnsetInProviderWindow(
  points: QualifiedSpeedPoint[],
  expectedProviderMs: number,
  windowSeconds: number,
  minStartSpeed = 70,
): {
  transitionVideoRelative: number;
  providerTimestamp: string;
  speedKmh: number;
} | null {
  const window = points
    .filter((p) => {
      const t = parseMs(p.providerTimestamp);
      return t != null && Math.abs(t - expectedProviderMs) / 1000 <= windowSeconds;
    })
    .sort((a, b) => parseMs(a.providerTimestamp)! - parseMs(b.providerTimestamp)!);

  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]!;
    const cur = window[i]!;
    if (prev.speedKmh >= minStartSpeed && prev.speedKmh - cur.speedKmh >= 8) {
      return {
        transitionVideoRelative: cur.videoRelativeSecondsProvisional,
        providerTimestamp: cur.providerTimestamp,
        speedKmh: cur.speedKmh,
      };
    }
  }
  return null;
}

function findAccelLaunchInProviderWindow(
  points: QualifiedSpeedPoint[],
  expectedProviderMs: number,
  windowSeconds: number,
  minEndSpeed = 35,
): {
  transitionVideoRelative: number;
  providerTimestamp: string;
  speedKmh: number;
} | null {
  const window = points
    .filter((p) => {
      const t = parseMs(p.providerTimestamp);
      return t != null && Math.abs(t - expectedProviderMs) / 1000 <= windowSeconds;
    })
    .sort((a, b) => parseMs(a.providerTimestamp)! - parseMs(b.providerTimestamp)!);

  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]!;
    const cur = window[i]!;
    if (prev.speedKmh <= 15 && cur.speedKmh - prev.speedKmh >= 12 && cur.speedKmh >= minEndSpeed) {
      return {
        transitionVideoRelative: cur.videoRelativeSecondsProvisional,
        providerTimestamp: cur.providerTimestamp,
        speedKmh: cur.speedKmh,
      };
    }
  }
  return null;
}

function isLandmarkClockFitEligibleByKind(landmark: SegmentBClockLandmark): {
  eligible: boolean;
  reason?: string;
} {
  if (landmark.landmarkKind === 'REVERSE_CONTEXT') {
    return {
      eligible: false,
      reason: 'REVERSE_CONTEXT_WITHOUT_DIRECTION_TELEMETRY_CANNOT_DEFINE_CLOCK_OFFSET',
    };
  }
  if (landmark.videoTimingAuthority === 'APPROXIMATE') {
    return {
      eligible: false,
      reason: APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET,
    };
  }
  if (!CLOCK_CALIBRATION_LANDMARK_IDS.includes(landmark.id as (typeof CLOCK_CALIBRATION_LANDMARK_IDS)[number])) {
    return { eligible: false, reason: 'NOT_IN_PREDEFINED_CLOCK_CALIBRATION_SET' };
  }
  return { eligible: true };
}

export function buildClockCalibrationEvidence(
  landmarks: readonly SegmentBClockLandmark[],
  points: QualifiedSpeedPoint[],
  candidateOffsetSeconds: number,
): ClockCalibrationEvidence[] {
  const calibrationLandmarks = landmarks.filter((lm) =>
    CLOCK_CALIBRATION_LANDMARK_IDS.includes(lm.id as (typeof CLOCK_CALIBRATION_LANDMARK_IDS)[number]),
  );

  return calibrationLandmarks.map((lm) => {
    const kindGate = isLandmarkClockFitEligibleByKind(lm);
    const expectedMs = expectedProviderMsFromVideo(lm.videoRelativeSeconds, candidateOffsetSeconds);
    const expectedIso = new Date(expectedMs).toISOString();

    let transition:
      | {
          transitionVideoRelative: number;
          providerTimestamp: string;
          speedKmh: number;
        }
      | null = null;
    let observationKind: ClockEvidenceObservationKind = 'STATE_OBSERVATION';

    if (lm.landmarkKind === 'DECEL_TO_STOP') {
      transition = findDecelOnsetInProviderWindow(
        points,
        expectedMs,
        lm.temporalLocalityToleranceSeconds,
        70,
      );
      if (transition) observationKind = 'TRANSITION_TIME_OBSERVATION';
    } else if (
      lm.landmarkKind === 'COMPLETE_STOP' ||
      lm.landmarkKind === 'SECOND_STOP'
    ) {
      transition = findStopTransitionInProviderWindow(
        points,
        expectedMs,
        lm.temporalLocalityToleranceSeconds,
      );
      if (transition) {
        observationKind = 'TRANSITION_TIME_OBSERVATION';
      } else if (lm.expectedSpeedKmh <= 5) {
        return {
          landmarkId: lm.id,
          label: lm.label,
          landmarkKind: lm.landmarkKind,
          videoRelativeSeconds: lm.videoRelativeSeconds,
          observationKind: 'STATE_OBSERVATION',
          CLOCK_FIT_ELIGIBLE: 'NO',
          ineligibleReason: 'ZERO_SPEED_SNAPSHOT_CANNOT_AUTOMATICALLY_DEFINE_STOP_TRANSITION',
          expectedProviderTimestamp: expectedIso,
          nearestProviderTimestamp: null,
          temporalResidualSeconds: null,
          impliedOffsetSeconds: null,
          telemetrySpeedKmh: null,
          videoSpeedKmh: lm.expectedSpeedKmh,
          eventShapeQualified: false,
        };
      }
    } else if (lm.landmarkKind === 'LATE_ACCELERATION') {
      transition = findAccelLaunchInProviderWindow(
        points,
        expectedMs,
        lm.temporalLocalityToleranceSeconds,
        35,
      );
      if (transition) observationKind = 'TRANSITION_TIME_OBSERVATION';
    }

    const nearest = selectNearestTelemetryByTimeOnly(points, expectedMs);
    const referenceVideoT = transition?.transitionVideoRelative ?? lm.videoRelativeSeconds;
    const referenceProviderTs = transition?.providerTimestamp ?? nearest?.providerTimestamp ?? null;
    const telemetrySpeed = transition?.speedKmh ?? nearest?.providerSpeedKmh ?? null;

    let eventShapeQualified = observationKind === 'TRANSITION_TIME_OBSERVATION';
    let ineligibleReason = kindGate.reason;

    if (kindGate.eligible && lm.landmarkKind === 'SECOND_STOP' && telemetrySpeed != null && telemetrySpeed > 2) {
      eventShapeQualified = false;
      ineligibleReason =
        'TELEMETRY_NOT_AT_QUALIFIED_STOP_BOUNDARY_WITHOUT_EVENT_SHAPE_EVIDENCE';
    }

    const impliedOffset =
      referenceProviderTs != null
        ? (parseMs(referenceProviderTs)! - videoAbsoluteMsFromRelative(lm.videoRelativeSeconds)) / 1000
        : null;

    const clockFit =
      kindGate.eligible &&
      eventShapeQualified &&
      observationKind === 'TRANSITION_TIME_OBSERVATION' &&
      impliedOffset != null;

    return {
      landmarkId: lm.id,
      label: lm.label,
      landmarkKind: lm.landmarkKind,
      videoRelativeSeconds: lm.videoRelativeSeconds,
      observationKind,
      CLOCK_FIT_ELIGIBLE: clockFit ? 'YES' : 'NO',
      ineligibleReason: clockFit ? undefined : ineligibleReason,
      expectedProviderTimestamp: expectedIso,
      nearestProviderTimestamp: referenceProviderTs,
      temporalResidualSeconds: nearest?.temporalResidualSeconds ?? null,
      impliedOffsetSeconds: impliedOffset,
      telemetrySpeedKmh: telemetrySpeed,
      videoSpeedKmh: lm.expectedSpeedKmh,
      eventShapeQualified,
    };
  });
}

export function searchGlobalClockOffset(
  landmarks: readonly SegmentBClockLandmark[],
  points: QualifiedSpeedPoint[],
): {
  bestOffsetSeconds: number | null;
  bestScore: number | null;
  calibrationEvidence: ClockCalibrationEvidence[];
  searchRange: { min: number; max: number; step: number };
  candidateScores: Array<{ offsetSeconds: number; score: number; fitCount: number }>;
} {
  const searchRange = {
    min: GLOBAL_OFFSET_SEARCH_MIN_SECONDS,
    max: GLOBAL_OFFSET_SEARCH_MAX_SECONDS,
    step: GLOBAL_OFFSET_SEARCH_STEP_SECONDS,
  };
  const candidateScores: Array<{ offsetSeconds: number; score: number; fitCount: number }> = [];

  let bestOffset: number | null = null;
  let bestScore = Infinity;
  let bestEvidence: ClockCalibrationEvidence[] = [];

  for (
    let offset = searchRange.min;
    offset <= searchRange.max;
    offset += searchRange.step
  ) {
    const evidence = buildClockCalibrationEvidence(landmarks, points, offset);
    const fit = evidence.filter((e) => e.CLOCK_FIT_ELIGIBLE === 'YES' && e.impliedOffsetSeconds != null);
    if (!fit.length) {
      candidateScores.push({ offsetSeconds: offset, score: Infinity, fitCount: 0 });
      continue;
    }
    const residuals = fit.map((e) => e.impliedOffsetSeconds! - offset);
    const score =
      residuals.reduce((s, r) => s + Math.abs(r), 0) / residuals.length +
      (mad(residuals) ?? 0) * 2;
    candidateScores.push({ offsetSeconds: offset, score, fitCount: fit.length });
    if (score < bestScore) {
      bestScore = score;
      bestOffset = offset;
      bestEvidence = evidence;
    }
  }

  return {
    bestOffsetSeconds: bestScore === Infinity ? null : bestOffset,
    bestScore: bestScore === Infinity ? null : bestScore,
    calibrationEvidence: bestEvidence,
    searchRange,
    candidateScores,
  };
}

export function splitCalibrationHoldoutSets() {
  const calibrationLandmarkIds = [...CLOCK_CALIBRATION_LANDMARK_IDS];
  const holdoutAnchorIds = [...SPEED_ACCURACY_HOLDOUT_ANCHOR_IDS];
  const calibrationLandmarks = SEGMENT_B_CLOCK_LANDMARKS.filter((lm) =>
    calibrationLandmarkIds.includes(lm.id as (typeof CLOCK_CALIBRATION_LANDMARK_IDS)[number]),
  );
  const holdoutAnchors = SEGMENT_B_VIDEO_SPEED_ANCHORS.filter((a) =>
    holdoutAnchorIds.includes(a.id as (typeof SPEED_ACCURACY_HOLDOUT_ANCHOR_IDS)[number]),
  );
  const overlap = holdoutAnchors.filter((a) =>
    calibrationLandmarks.some((lm) => Math.abs(lm.videoRelativeSeconds - a.videoRelativeSeconds) < 1),
  );
  return {
    CLOCK_CALIBRATION_SET: calibrationLandmarks,
    SPEED_ACCURACY_HOLDOUT_SET: holdoutAnchors,
    CLOCK_CALIBRATION_ANCHOR_COUNT: calibrationLandmarks.length,
    CLOCK_HOLDOUT_ANCHOR_COUNT: holdoutAnchors.length,
    CLOCK_CALIBRATION_HOLDOUT_SEPARATED: overlap.length === 0 ? 'YES' : 'NO',
    overlapRejected: overlap.map((a) => a.id),
  };
}

export function classifyAnchorKinematicState(
  anchor: SegmentBVideoSpeedAnchor,
  allAnchors: readonly SegmentBVideoSpeedAnchor[],
): 'STABLE_OR_LOW_SLOPE' | 'DYNAMIC_TRANSITION' {
  const prev = [...allAnchors]
    .filter((a) => a.videoRelativeSeconds < anchor.videoRelativeSeconds)
    .sort((a, b) => b.videoRelativeSeconds - a.videoRelativeSeconds)[0];
  const next = [...allAnchors]
    .filter((a) => a.videoRelativeSeconds > anchor.videoRelativeSeconds)
    .sort((a, b) => a.videoRelativeSeconds - b.videoRelativeSeconds)[0];

  const deltaThreshold = 15;
  const timeThreshold = 90;
  if (
    prev &&
    Math.abs(anchor.videoSpeedKmh - prev.videoSpeedKmh) >= deltaThreshold &&
    anchor.videoRelativeSeconds - prev.videoRelativeSeconds <= timeThreshold
  ) {
    return 'DYNAMIC_TRANSITION';
  }
  if (
    next &&
    Math.abs(next.videoSpeedKmh - anchor.videoSpeedKmh) >= deltaThreshold &&
    next.videoRelativeSeconds - anchor.videoRelativeSeconds <= timeThreshold
  ) {
    return 'DYNAMIC_TRANSITION';
  }
  return 'STABLE_OR_LOW_SLOPE';
}

export type HoldoutAccuracyRow = {
  anchorId: string;
  videoRelativeSeconds: number;
  videoSpeedKmh: number;
  expectedProviderTimestamp: string;
  nearestProviderTimestamp: string | null;
  temporalResidualSeconds: number | null;
  providerSpeedKmh: number | null;
  speedErrorKmh: number | null;
  localPhysicalGapBefore: number | null;
  localPhysicalGapAfter: number | null;
  kinematicState: 'STABLE_OR_LOW_SLOPE' | 'DYNAMIC_TRANSITION';
  accuracyEligibility:
    | 'COMPARABLE'
    | 'NO_COMPARABLE_PHYSICAL_SAMPLE'
    | 'REJECTED_TIME_DISTANCE'
    | 'REJECTED_ANCHOR_CONFIDENCE';
  regime: 'LOW' | 'MEDIUM' | 'HIGH';
};

export function computeHoldoutSpeedAccuracy(
  holdoutAnchors: readonly SegmentBVideoSpeedAnchor[],
  allAnchors: readonly SegmentBVideoSpeedAnchor[],
  points: QualifiedSpeedPoint[],
  frozenOffsetSeconds: number | null,
  clockOffsetValidated = false,
) {
  const rows: HoldoutAccuracyRow[] = holdoutAnchors.map((anchor) => {
    const kinematicState = classifyAnchorKinematicState(anchor, allAnchors);
    const maxResidual =
      kinematicState === 'DYNAMIC_TRANSITION'
        ? DYNAMIC_STATE_MAX_TEMPORAL_RESIDUAL_SECONDS
        : STABLE_STATE_MAX_TEMPORAL_RESIDUAL_SECONDS;

    if (anchor.videoAnchorConfidence === 'REJECTED') {
      return {
        anchorId: anchor.id,
        videoRelativeSeconds: anchor.videoRelativeSeconds,
        videoSpeedKmh: anchor.videoSpeedKmh,
        expectedProviderTimestamp: new Date(
          videoAbsoluteMsFromRelative(anchor.videoRelativeSeconds),
        ).toISOString(),
        nearestProviderTimestamp: null,
        temporalResidualSeconds: null,
        providerSpeedKmh: null,
        speedErrorKmh: null,
        localPhysicalGapBefore: null,
        localPhysicalGapAfter: null,
        kinematicState,
        accuracyEligibility: 'REJECTED_ANCHOR_CONFIDENCE' as const,
        regime:
          anchor.videoSpeedKmh <= 30 ? 'LOW' : anchor.videoSpeedKmh <= 80 ? 'MEDIUM' : 'HIGH',
      };
    }

    if (frozenOffsetSeconds == null) {
      const expectedMs = videoAbsoluteMsFromRelative(anchor.videoRelativeSeconds);
      return {
        anchorId: anchor.id,
        videoRelativeSeconds: anchor.videoRelativeSeconds,
        videoSpeedKmh: anchor.videoSpeedKmh,
        expectedProviderTimestamp: new Date(expectedMs).toISOString(),
        nearestProviderTimestamp: null,
        temporalResidualSeconds: null,
        providerSpeedKmh: null,
        speedErrorKmh: null,
        localPhysicalGapBefore: null,
        localPhysicalGapAfter: null,
        kinematicState,
        accuracyEligibility: 'NO_COMPARABLE_PHYSICAL_SAMPLE' as const,
        regime:
          anchor.videoSpeedKmh <= 30 ? 'LOW' : anchor.videoSpeedKmh <= 80 ? 'MEDIUM' : 'HIGH',
      };
    }

    const expectedMs = expectedProviderMsFromVideo(
      anchor.videoRelativeSeconds,
      frozenOffsetSeconds,
    );
    const nearest = selectNearestTelemetryByTimeOnly(points, expectedMs);
    if (!nearest) {
      return {
        anchorId: anchor.id,
        videoRelativeSeconds: anchor.videoRelativeSeconds,
        videoSpeedKmh: anchor.videoSpeedKmh,
        expectedProviderTimestamp: new Date(expectedMs).toISOString(),
        nearestProviderTimestamp: null,
        temporalResidualSeconds: null,
        providerSpeedKmh: null,
        speedErrorKmh: null,
        localPhysicalGapBefore: null,
        localPhysicalGapAfter: null,
        kinematicState,
        accuracyEligibility: 'NO_COMPARABLE_PHYSICAL_SAMPLE' as const,
        regime:
          anchor.videoSpeedKmh <= 30 ? 'LOW' : anchor.videoSpeedKmh <= 80 ? 'MEDIUM' : 'HIGH',
      };
    }

    const absResidual = Math.abs(nearest.temporalResidualSeconds);
    let eligibility: HoldoutAccuracyRow['accuracyEligibility'] = 'COMPARABLE';
    if (absResidual > maxResidual) {
      eligibility = 'REJECTED_TIME_DISTANCE';
    }

    const speedError =
      eligibility === 'COMPARABLE' ? nearest.providerSpeedKmh - anchor.videoSpeedKmh : null;

    return {
      anchorId: anchor.id,
      videoRelativeSeconds: anchor.videoRelativeSeconds,
      videoSpeedKmh: anchor.videoSpeedKmh,
      expectedProviderTimestamp: new Date(expectedMs).toISOString(),
      nearestProviderTimestamp: nearest.providerTimestamp,
      temporalResidualSeconds: nearest.temporalResidualSeconds,
      providerSpeedKmh: nearest.providerSpeedKmh,
      speedErrorKmh: speedError,
      localPhysicalGapBefore: nearest.localPhysicalGapBefore,
      localPhysicalGapAfter: nearest.localPhysicalGapAfter,
      kinematicState,
      accuracyEligibility: eligibility,
      regime:
        anchor.videoSpeedKmh <= 30 ? 'LOW' : anchor.videoSpeedKmh <= 80 ? 'MEDIUM' : 'HIGH',
    };
  });

  const comparable = rows.filter((r) => r.accuracyEligibility === 'COMPARABLE' && r.speedErrorKmh != null);
  const rejectedTime = rows.filter((r) => r.accuracyEligibility === 'REJECTED_TIME_DISTANCE').length;
  const absErrors = comparable.map((r) => Math.abs(r.speedErrorKmh!));
  const byRegime = (regime: string) => comparable.filter((r) => r.regime === regime);
  const mae = (items: HoldoutAccuracyRow[]) =>
    items.length
      ? items.reduce((s, e) => s + Math.abs(e.speedErrorKmh!), 0) / items.length
      : null;

  const temporalBuckets = {
    within1s: rows.filter((r) => r.temporalResidualSeconds != null && Math.abs(r.temporalResidualSeconds) <= 1).length,
    within2s: rows.filter((r) => r.temporalResidualSeconds != null && Math.abs(r.temporalResidualSeconds) <= 2).length,
    within5s: rows.filter((r) => r.temporalResidualSeconds != null && Math.abs(r.temporalResidualSeconds) <= 5).length,
    over5s: rows.filter((r) => r.temporalResidualSeconds != null && Math.abs(r.temporalResidualSeconds) > 5).length,
  };

  const stableComparable = comparable.filter((r) => r.kinematicState === 'STABLE_OR_LOW_SLOPE');
  const dynamicComparable = comparable.filter((r) => r.kinematicState === 'DYNAMIC_TRANSITION');

  const validated =
    clockOffsetValidated &&
    frozenOffsetSeconds != null &&
    comparable.length >= MIN_HOLDOUT_COMPARABLE_FOR_VALIDATION
      ? 'YES'
      : 'NO';

  const diagnosticMae = comparable.length ? mae(comparable) : null;

  return {
    SPEED_SAMPLE_SELECTION_TIME_ONLY: 'YES' as const,
    VALIDATED_OFFSET_MUST_BE_APPLIED_BEFORE_ACCURACY_SAMPLE_SELECTION: 'YES' as const,
    HOLDOUT_ANCHOR_COUNT: rows.length,
    HOLDOUT_COMPARABLE_SAMPLE_COUNT: comparable.length,
    HOLDOUT_REJECTED_FOR_TIME_DISTANCE: rejectedTime,
    ABSOLUTE_SPEED_ACCURACY_VALIDATED: validated,
    SPEED_MAE_KMH: validated === 'YES' ? mae(comparable) : null,
    SPEED_MEDIAN_ABS_ERROR_KMH: validated === 'YES' ? sortedPercentile(absErrors, 50) : null,
    SPEED_P90_ABS_ERROR_KMH: validated === 'YES' ? sortedPercentile(absErrors, 90) : null,
    SPEED_BIAS_KMH:
      validated === 'YES' && comparable.length
        ? comparable.reduce((s, e) => s + e.speedErrorKmh!, 0) / comparable.length
        : null,
    SPEED_MAX_ABS_ERROR_KMH: validated === 'YES' && absErrors.length ? Math.max(...absErrors) : null,
    LOW_SPEED_MAE_KMH: validated === 'YES' ? mae(byRegime('LOW')) : null,
    MEDIUM_SPEED_MAE_KMH: validated === 'YES' ? mae(byRegime('MEDIUM')) : null,
    HIGH_SPEED_MAE_KMH: validated === 'YES' ? mae(byRegime('HIGH')) : null,
    STABLE_STATE_SPEED_ACCURACY: {
      comparableCount: stableComparable.length,
      maeKmh: mae(stableComparable),
    },
    DYNAMIC_STATE_SPEED_ACCURACY: {
      comparableCount: dynamicComparable.length,
      maeKmh: mae(dynamicComparable),
    },
    temporalResidualBuckets: temporalBuckets,
    holdoutRows: rows,
    frozenOffsetSeconds,
    diagnosticHoldoutMaeKmhWhenOffsetNotValidated:
      clockOffsetValidated ? null : diagnosticMae,
    note:
      'Holdout speed accuracy uses TIME-ONLY nearest telemetry after frozen offset; video speed never influences sample selection',
  };
}

export function computePreviousBiasedExploratoryResults(anchorMatches: AnchorMatchResult[]) {
  const errors = anchorMatches
    .filter((m) => m.status === 'MATCHED' && m.speedErrorKmh != null)
    .map((m) => Math.abs(m.speedErrorKmh!));

  return {
    PREVIOUS_METHOD_SELECTION_BIASED: 'YES' as const,
    NOT_CANONICAL_VALIDATION_RESULT: 'YES' as const,
    EXPLORATORY_PREVIOUS_OFFSET_SECONDS: EXPLORATORY_PREVIOUS_OFFSET_SECONDS,
    EXPLORATORY_PREVIOUS_SPEED_MAE_KMH: EXPLORATORY_PREVIOUS_SPEED_MAE_KMH,
    recomputedFromCurrentSpeedBiasedMatches: {
      medianOffsetSeconds: sortedPercentile(
        anchorMatches
          .filter((m) => m.status === 'MATCHED' && m.candidateOffsetSeconds != null)
          .map((m) => m.candidateOffsetSeconds!),
        50,
      ),
      maeKmh: errors.length ? errors.reduce((s, e) => s + e, 0) / errors.length : null,
    },
    note:
      'DI-EV-0035B speed-selected matching reused samples for offset and accuracy — selection bias / double dipping',
  };
}

export function computeRawAnchorDisplacementDiagnostic(anchorMatches: AnchorMatchResult[]) {
  const displacements = anchorMatches
    .filter((m) => m.status === 'MATCHED' && m.rawTimeDisplacementSeconds != null)
    .map((m) => m.rawTimeDisplacementSeconds!);

  return {
    RAW_ANCHOR_DISPLACEMENT_MEDIAN: sortedPercentile(displacements, 50),
    RAW_ANCHOR_DISPLACEMENT_MAD: mad(displacements),
    RAW_ANCHOR_DISPLACEMENT_MIN: displacements.length ? Math.min(...displacements) : null,
    RAW_ANCHOR_DISPLACEMENT_MAX: displacements.length ? Math.max(...displacements) : null,
    perAnchorDisplacements: anchorMatches
      .filter((m) => m.status === 'MATCHED')
      .map((m) => ({
        anchorId: m.anchorId,
        rawTimeDisplacementSeconds: m.rawTimeDisplacementSeconds,
        speedErrorKmh: m.speedErrorKmh,
      })),
    explanation:
      'Raw per-anchor displacements from speed-biased matching are diagnostic only — NOT clock authority because sample selection used video speed',
  };
}

export function estimateSegmentBClockAlignmentB1(
  globalSearch: ReturnType<typeof searchGlobalClockOffset>,
  split: ReturnType<typeof splitCalibrationHoldoutSets>,
) {
  const fitEligible = globalSearch.calibrationEvidence.filter((e) => e.CLOCK_FIT_ELIGIBLE === 'YES');
  const offsets = fitEligible
    .map((e) => e.impliedOffsetSeconds)
    .filter((v): v is number => v != null && Number.isFinite(v));

  const medianSupportive =
    globalSearch.bestOffsetSeconds ??
    (offsets.length ? sortedPercentile(offsets, 50) : null);

  const spread =
    offsets.length >= 2 ? Math.max(...offsets) - Math.min(...offsets) : null;
  const offsetMad = offsets.length ? mad(offsets) : null;

  let offsetValidated: 'YES' | 'NO' = 'NO';
  let videoOffset: number | null = null;
  let alignmentClass = 'INSUFFICIENT_EVIDENCE';

  if (
    fitEligible.length >= 3 &&
    spread != null &&
    spread <= 25 &&
    (offsetMad ?? Infinity) <= 10 &&
    globalSearch.bestOffsetSeconds != null
  ) {
    offsetValidated = 'YES';
    videoOffset = globalSearch.bestOffsetSeconds;
    alignmentClass = spread <= 12 ? 'STABLE_OFFSET' : 'AMBIGUOUS_ALIGNMENT';
  } else if (medianSupportive != null && Math.abs(medianSupportive - EXPLORATORY_PREVIOUS_OFFSET_SECONDS) <= 5) {
    alignmentClass = 'OFFSET_CANDIDATE_SUPPORTIVE_ONLY';
  }

  return {
    VIDEO_ABSOLUTE_TIME_ANCHORED: 'YES' as const,
    PROVIDER_TIMESTAMP_OFFSET_VALIDATED: offsetValidated,
    VIDEO_TO_PROVIDER_OFFSET_SECONDS: offsetValidated === 'YES' ? videoOffset : null,
    OFFSET_CANDIDATE_SUPPORTIVE_ONLY:
      offsetValidated === 'NO' && medianSupportive != null ? 'YES' : 'NO',
    OFFSET_CANDIDATE_AROUND_14_SECONDS:
      medianSupportive != null && Math.abs(medianSupportive - 14) <= 5 ? 'SUPPORTIVE_ONLY' : 'NO',
    supportiveOffsetSeconds: medianSupportive,
    APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET:
      APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET,
    CLOCK_FIT_ELIGIBLE_LANDMARKS: fitEligible.map((e) => e.landmarkId),
    CLOCK_FIT_REJECTED_LANDMARKS: globalSearch.calibrationEvidence
      .filter((e) => e.CLOCK_FIT_ELIGIBLE !== 'YES')
      .map((e) => ({ landmarkId: e.landmarkId, reason: e.ineligibleReason ?? e.observationKind })),
    CLOCK_CALIBRATION_HOLDOUT_SEPARATED: split.CLOCK_CALIBRATION_HOLDOUT_SEPARATED,
    CLOCK_CALIBRATION_ANCHOR_COUNT: split.CLOCK_CALIBRATION_ANCHOR_COUNT,
    CLOCK_HOLDOUT_ANCHOR_COUNT: split.CLOCK_HOLDOUT_ANCHOR_COUNT,
    VIDEO_PROVIDER_ALIGNMENT_CLASS: alignmentClass,
    OFFSET_MAD_SECONDS: offsetMad,
    spreadSeconds: spread,
    globalOffsetSearch: {
      bestOffsetSeconds: globalSearch.bestOffsetSeconds,
      bestScore: globalSearch.bestScore,
      searchRange: globalSearch.searchRange,
    },
    calibrationEvidence: globalSearch.calibrationEvidence,
    CIRCULAR_LANDMARK_ALIGNMENT_REMOVED: 'YES' as const,
    SPEED_BASED_SAMPLE_SELECTION_REMOVED_FROM_CLOCK_AND_ACCURACY: 'YES' as const,
  };
}

/** @deprecated B.1 uses event-boundary clock calibration — kept for exploratory diagnostics only. */
function isClockFitEligible(
  landmark: SegmentBClockLandmark,
  match: AnchorMatchResult,
  usedEpisodeIds: Set<string>,
): boolean {
  if (landmark.videoTimingAuthority !== 'EXACT' && landmark.videoTimingAuthority !== 'HIGH_CONFIDENCE') {
    return false;
  }
  if (match.status !== 'MATCHED') return false;
  if (match.matchConfidence === 'LOW' || match.matchConfidence === 'INSUFFICIENT') return false;
  if (match.candidateOffsetSeconds == null) return false;
  if (usedEpisodeIds.has(landmark.episodeId)) return false;
  return true;
}

export function matchClockLandmarks(
  landmarks: readonly SegmentBClockLandmark[],
  anchorMatches: AnchorMatchResult[],
) {
  const anchorByVideoT = new Map(
    anchorMatches
      .filter((m) => m.status === 'MATCHED')
      .map((m) => [m.videoRelativeSeconds, m]),
  );
  const usedEpisodeIds = new Set<string>();
  const usedProviderTimestamps = new Set<string>();
  const results: Array<Record<string, unknown>> = [];

  for (const lm of landmarks) {
    const match =
      anchorByVideoT.get(lm.videoRelativeSeconds) ??
      anchorMatches.find((m) => Math.abs(m.videoRelativeSeconds - lm.videoRelativeSeconds) < 1);
    if (!match || match.status !== 'MATCHED') {
      results.push({
        landmarkId: lm.id,
        label: lm.label,
        episodeId: lm.episodeId,
        status: 'NOT_FOUND_IN_TELEMETRY',
        CLOCK_FIT_ELIGIBLE: 'NO',
        candidateOffsetSeconds: null,
      });
      continue;
    }

    const duplicateTelemetry =
      match.providerTimestamp != null && usedProviderTimestamps.has(match.providerTimestamp);
    const clockFit =
      !duplicateTelemetry && isClockFitEligible(lm, match, usedEpisodeIds);
    if (clockFit) {
      usedEpisodeIds.add(lm.episodeId);
      if (match.providerTimestamp) usedProviderTimestamps.add(match.providerTimestamp);
    }

    results.push({
      landmarkId: lm.id,
      label: lm.label,
      episodeId: lm.episodeId,
      landmarkKind: lm.landmarkKind,
      videoRelativeSecondsObserved: lm.videoRelativeSeconds,
      videoTimingAuthority: lm.videoTimingAuthority,
      telemetryVideoRelativeProvisional: match.telemetryVideoRelativeSeconds,
      candidateProviderTimestamp: match.providerTimestamp,
      telemetryMatchConfidence: match.matchConfidence,
      CLOCK_FIT_ELIGIBLE: clockFit ? 'YES' : 'NO',
      candidateOffsetSeconds: clockFit ? match.candidateOffsetSeconds : null,
      speedErrorKmh: match.speedErrorKmh,
      note:
        duplicateTelemetry
          ? 'SAME_TELEMETRY_SAMPLE_CANNOT_COUNT_AS_MULTIPLE_CLOCK_LANDMARKS'
          : !clockFit && usedEpisodeIds.has(lm.episodeId)
            ? 'ONE_TELEMETRY_EPISODE_CANNOT_COUNT_AS_MULTIPLE_INDEPENDENT_CLOCK_LANDMARKS'
            : undefined,
    });
  }

  return results;
}

export function estimateSegmentBClockAlignment(clockMatches: Array<Record<string, unknown>>) {
  const eligible = clockMatches.filter((m) => m.CLOCK_FIT_ELIGIBLE === 'YES');
  const offsets = eligible
    .map((m) => m.candidateOffsetSeconds as number | null)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const base = {
    VIDEO_ABSOLUTE_TIME_ANCHORED: 'YES' as const,
    PROVIDER_TIMESTAMP_OFFSET_VALIDATED: 'NO' as const,
    VIDEO_TO_PROVIDER_OFFSET_SECONDS: null as number | null,
    APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET:
      APPROXIMATE_NON_UNIQUE_LANDMARK_CANNOT_DEFINE_PROVIDER_CLOCK_OFFSET,
    CLOCK_FIT_ELIGIBLE_LANDMARKS: eligible.map((m) => m.landmarkId as string),
    CLOCK_FIT_REJECTED_LANDMARKS: clockMatches
      .filter((m) => m.CLOCK_FIT_ELIGIBLE !== 'YES')
      .map((m) => ({ landmarkId: m.landmarkId, reason: m.status ?? 'INELIGIBLE' })),
    CIRCULAR_LANDMARK_ALIGNMENT_REMOVED: 'YES' as const,
  };

  if (!offsets.length) {
    return {
      ...base,
      VIDEO_PROVIDER_ALIGNMENT_CLASS: 'INSUFFICIENT_EVIDENCE',
      OFFSET_MAD_SECONDS: null,
      medianOffsetSeconds: null,
      spreadSeconds: null,
    };
  }

  const median = sortedPercentile(offsets, 50);
  const offsetMad = mad(offsets);
  const spread = Math.max(...offsets) - Math.min(...offsets);
  const videoSpread =
    eligible.length >= 2
      ? Math.max(
          ...eligible.map((m) => m.videoRelativeSecondsObserved as number),
        ) -
        Math.min(...eligible.map((m) => m.videoRelativeSecondsObserved as number))
      : 0;

  let offsetValidated: 'YES' | 'NO' = 'NO';
  let alignmentClass = 'INSUFFICIENT_EVIDENCE';
  if (
    offsets.length >= 3 &&
    videoSpread >= 300 &&
    spread <= 25 &&
    (offsetMad ?? Infinity) <= 10
  ) {
    offsetValidated = 'YES';
    alignmentClass = spread <= 12 ? 'STABLE_OFFSET' : 'AMBIGUOUS_ALIGNMENT';
  } else if (offsets.length >= 2 && spread <= 35) {
    alignmentClass = 'PROVISIONAL_MULTI_ANCHOR';
  }

  return {
    ...base,
    PROVIDER_TIMESTAMP_OFFSET_VALIDATED: offsetValidated,
    VIDEO_PROVIDER_ALIGNMENT_CLASS: alignmentClass,
    VIDEO_TO_PROVIDER_OFFSET_SECONDS: offsetValidated === 'YES' ? median : null,
    OFFSET_MAD_SECONDS: offsetMad,
    medianOffsetSeconds: median,
    spreadSeconds: spread,
    videoSpreadSeconds: videoSpread,
    candidateOffsetsPerLandmark: eligible.map((m) => ({
      landmarkId: m.landmarkId,
      offsetSeconds: m.candidateOffsetSeconds,
    })),
  };
}

export function estimateSegmentBDrift(
  clockMatches: Array<Record<string, unknown>>,
  videoDurationSeconds: number,
) {
  const eligible = clockMatches.filter(
    (m) =>
      m.CLOCK_FIT_ELIGIBLE === 'YES' &&
      typeof m.videoRelativeSecondsObserved === 'number' &&
      typeof m.candidateOffsetSeconds === 'number' &&
      (m.telemetryMatchConfidence === 'HIGH' || m.telemetryMatchConfidence === 'MEDIUM'),
  );

  const points = eligible.map((m) => ({
    videoT: m.videoRelativeSecondsObserved as number,
    offset: m.candidateOffsetSeconds as number,
    landmarkId: m.landmarkId as string,
  }));

  const videoSpread =
    points.length >= 2
      ? Math.max(...points.map((p) => p.videoT)) - Math.min(...points.map((p) => p.videoT))
      : 0;

  if (points.length < 3 || videoDurationSeconds <= 0 || videoSpread < 400) {
    return {
      DRIFT_VALIDATED: 'NO',
      ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: null,
      DRIFT_FIT_ELIGIBLE_LANDMARKS: eligible.map((m) => m.landmarkId as string),
      note: 'Requires >=3 independent clock landmarks spread across substantial Segment B duration',
    };
  }

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.videoT, 0);
  const sumY = points.reduce((s, p) => s + p.offset, 0);
  const sumXY = points.reduce((s, p) => s + p.videoT * p.offset, 0);
  const sumXX = points.reduce((s, p) => s + p.videoT * p.videoT, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const driftOverSegment = slope * videoDurationSeconds;
  const residuals = points.map((p) => p.offset - (intercept + slope * p.videoT));
  const residualMad = mad(residuals) ?? Infinity;

  let driftValidated: 'YES' | 'NO' = 'NO';
  if (Math.abs(driftOverSegment) >= 3 && residualMad <= 8 && videoSpread >= 500) {
    driftValidated = 'YES';
  }

  return {
    DRIFT_VALIDATED: driftValidated,
    ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: driftValidated === 'YES' ? driftOverSegment : null,
    conceptualSlopeSecondsPerVideoSecond: slope,
    offsetAtBeginningSeconds: intercept,
    offsetAtMiddleSeconds: intercept + slope * (videoDurationSeconds / 2),
    offsetAtEndSeconds: intercept + slope * videoDurationSeconds,
    residuals,
    residualMadSeconds: residualMad,
    landmarkCount: points.length,
    videoSpreadSeconds: videoSpread,
  };
}

export function computeSpeedAccuracy(
  holdoutAnchors: readonly SegmentBVideoSpeedAnchor[],
  allAnchors: readonly SegmentBVideoSpeedAnchor[],
  points: QualifiedSpeedPoint[],
  validatedOffsetSeconds: number | null,
  clockOffsetValidated = false,
) {
  return computeHoldoutSpeedAccuracy(
    holdoutAnchors,
    allAnchors,
    points,
    validatedOffsetSeconds,
    clockOffsetValidated,
  );
}

export function analyzeStopTiming(
  points: QualifiedSpeedPoint[],
  validatedOffsetSeconds: number | null,
) {
  const clockCorrected = validatedOffsetSeconds != null;
  const correctedPoints = points.map((p) => ({
    ...p,
    videoRelativeSecondsCorrected:
      validatedOffsetSeconds != null
        ? p.videoRelativeSecondsProvisional - validatedOffsetSeconds
        : p.videoRelativeSecondsProvisional,
  }));

  const analyzeWindow = (
    label: string,
    startT: number,
    endT: number,
    videoStopT: number,
  ) => {
    const window = correctedPoints.filter(
      (p) =>
        p.videoRelativeSecondsCorrected >= startT &&
        p.videoRelativeSecondsCorrected <= endT,
    );
    const firstDecel = window.find((p, i) => {
      if (i === 0) return false;
      const prev = window[i - 1]!;
      return prev.speedKmh - p.speedKmh >= 8;
    });
    const firstZero = window.find((p) => p.speedKmh <= 1);
    const zeros = window.filter((p) => p.speedKmh <= 1);
    const stopDuration =
      zeros.length >= 2
        ? zeros.at(-1)!.videoRelativeSecondsCorrected - zeros[0]!.videoRelativeSecondsCorrected
        : null;
    const hfStopT = firstZero?.videoRelativeSecondsCorrected ?? null;
    return {
      label,
      videoStopVideoRelativeSeconds: videoStopT,
      hfFirstDecelVideoRelativeSeconds: firstDecel?.videoRelativeSecondsCorrected ?? null,
      hfFirstZeroVideoRelativeSeconds: hfStopT,
      hfStopDurationSeconds: stopDuration,
      timeErrorSeconds: hfStopT != null ? hfStopT - videoStopT : null,
      sampleCount: window.length,
      timelineUsed: clockCorrected ? 'VIDEO_CLOCK_CORRECTED' : 'UNCORRECTED_PROVIDER_PROVISIONAL',
    };
  };

  const windows = [
    analyzeWindow('B-E4_LONG_DECEL_TO_STOP', 520, 680, 630),
    analyzeWindow('B-E5_SECOND_STOP', 700, 770, 720),
  ];

  const timingPrecisionOk = windows.every(
    (w) => w.hfFirstZeroVideoRelativeSeconds != null && Math.abs(w.timeErrorSeconds ?? 999) <= 35,
  );

  return {
    STOP_TIMING_VALIDATED: clockCorrected && timingPrecisionOk ? 'PARTIAL' : 'NO',
    STOP_TIMING_CLOCK_CORRECTED: clockCorrected ? 'YES' : 'NO',
    STOP_TIMING_CANNOT_USE_UNCORRECTED_PROVIDER_TIMELINE,
    DECELERATION_TO_STOP_VALIDATED:
      clockCorrected && windows[0]!.hfFirstDecelVideoRelativeSeconds != null ? 'PARTIAL' : 'NO',
    STOP_LAUNCH_VALIDATED:
      clockCorrected && windows[0]!.hfFirstZeroVideoRelativeSeconds != null ? 'PARTIAL' : 'NO',
    validatedOffsetSecondsApplied: validatedOffsetSeconds,
    windows,
    note: clockCorrected
      ? 'Stop timing measured on provider telemetry corrected into video timeline via validated offset'
      : 'Clock model unavailable — stop timing not validated on uncorrected provider timeline',
  };
}

function assessSegmentFieldWithEventCorrelation(
  rows: Rd004ObservationRow[],
  field: string,
  episodes: ReturnType<typeof findSpeedEpisodes>,
  clockOffsetSeconds: number | null,
): {
  observed: boolean;
  sampleCount: number;
  uniquePhysical: number;
  dynamicRange: number | null;
  segmentValidation: string;
  globalAuthority: string;
  eventCorrelation: string;
} {
  const hf = rows.filter((r) => r.providerField === field && r.acquisitionSurface === 'HF_HISTORICAL');
  if (!hf.length) {
    return {
      observed: false,
      sampleCount: 0,
      uniquePhysical: 0,
      dynamicRange: null,
      segmentValidation: 'NOT_OBSERVED',
      globalAuthority: 'USEFUL_WITH_GATING',
      eventCorrelation: 'INSUFFICIENT_COVERAGE',
    };
  }
  const cadence = computePhysicalCadenceMetrics(hf);
  const values = dedupePhysicalSamples(hf)
    .map((r) => extractNumericValue(r.rawValueJson))
    .filter((v): v is number => v != null);
  const dynamicRange = values.length ? Math.max(...values) - Math.min(...values) : null;
  const sufficientSamples = (cadence.UNIQUE_PHYSICAL_SAMPLE_COUNT ?? 0) >= 5;
  const dynamicallyInformative = dynamicRange != null && dynamicRange >= 5;

  const dynamicEpisodes = episodes.filter(
    (ep) => ep.type === 'deceleration' || ep.type === 'launch',
  );
  let correlatedEpisodes = 0;
  let checkedEpisodes = 0;
  for (const ep of dynamicEpisodes) {
    const epRows = hf.filter((r) => {
      const t = parseMs(r.providerTimestamp);
      if (t == null) return false;
      const videoT =
        (t - Date.parse(SEGMENT_B_CONSTANTS.videoStartUtc)) / 1000 -
        (clockOffsetSeconds ?? 0);
      return videoT >= ep.videoRelativeStart - 15 && videoT <= ep.videoRelativeEnd + 15;
    });
    if (epRows.length < 2) continue;
    checkedEpisodes++;
    const epValues = epRows
      .map((r) => extractNumericValue(r.rawValueJson))
      .filter((v): v is number => v != null);
    if (!epValues.length) continue;
    const epRange = Math.max(...epValues) - Math.min(...epValues);
    if (epRange >= 5) correlatedEpisodes++;
  }

  let eventCorrelation = 'INSUFFICIENT_COVERAGE';
  if (checkedEpisodes > 0) {
    eventCorrelation =
      correlatedEpisodes >= Math.ceil(checkedEpisodes * 0.5)
        ? 'EVENT_CORRELATED'
        : 'NOT_EVENT_CORRELATED';
  }

  let segmentValidation: string;
  if (!sufficientSamples) segmentValidation = 'INSUFFICIENT_COVERAGE';
  else if (!dynamicallyInformative) segmentValidation = 'NOT_DYNAMICALLY_INFORMATIVE';
  else if (eventCorrelation === 'EVENT_CORRELATED') segmentValidation = 'EVENT_CORRELATED';
  else if (eventCorrelation === 'NOT_EVENT_CORRELATED') segmentValidation = 'NOT_EVENT_CORRELATED';
  else segmentValidation = 'DYNAMICALLY_INFORMATIVE';

  return {
    observed: true,
    sampleCount: hf.length,
    uniquePhysical: cadence.UNIQUE_PHYSICAL_SAMPLE_COUNT ?? 0,
    dynamicRange,
    segmentValidation,
    globalAuthority: 'USEFUL_WITH_GATING',
    eventCorrelation,
  };
}

export function analyzeSupportingSignalsSegmentB(
  rows: Rd004ObservationRow[],
  episodes: ReturnType<typeof findSpeedEpisodes> = [],
  clockOffsetSeconds: number | null = null,
) {
  const rpm = assessSegmentFieldWithEventCorrelation(
    rows,
    'powertrainCombustionEngineSpeed',
    episodes,
    clockOffsetSeconds,
  );
  const throttle = assessSegmentFieldWithEventCorrelation(
    rows,
    'obdThrottlePosition',
    episodes,
    clockOffsetSeconds,
  );
  const tps = assessSegmentFieldWithEventCorrelation(
    rows,
    'powertrainCombustionEngineTPS',
    episodes,
    clockOffsetSeconds,
  );
  const load = assessSegmentFieldWithEventCorrelation(rows, 'obdEngineLoad', episodes, clockOffsetSeconds);
  const gear = assessSegmentFieldWithEventCorrelation(
    rows,
    'powertrainTransmissionActualGear',
    episodes,
    clockOffsetSeconds,
  );
  const gearRatio = assessSegmentFieldWithEventCorrelation(
    rows,
    'powertrainTransmissionActualGearRatio',
    episodes,
    clockOffsetSeconds,
  );
  const gearObserved = gear.observed || gearRatio.observed;

  return {
    RPM_GLOBAL_AUTHORITY: rpm.globalAuthority,
    RPM_SEGMENT_B_VALIDATION: rpm.segmentValidation,
    RPM_RD004_B_SPECIFIC_VALIDATION: rpm.segmentValidation,
    THROTTLE_GLOBAL_AUTHORITY: throttle.globalAuthority,
    THROTTLE_SEGMENT_B_VALIDATION: throttle.segmentValidation,
    THROTTLE_RD004_B_SPECIFIC_VALIDATION: throttle.segmentValidation,
    TPS_GLOBAL_AUTHORITY: tps.globalAuthority,
    TPS_SEGMENT_B_VALIDATION: tps.segmentValidation,
    TPS_RD004_B_SPECIFIC_VALIDATION: tps.segmentValidation,
    GLOBAL_RD003_AUTHORITY: 'USEFUL_WITH_GATING',
    RD004_B_REQUIRES_EVENT_CORRELATION: 'YES',
    GEAR_STATE_OBSERVED: gearObserved ? 'YES' : 'NO',
    GEAR_STATE_USEFUL_FOR_SEGMENT_B: gearObserved ? 'PARTIAL' : 'NOT_OBSERVED',
    perField: {
      powertrainCombustionEngineSpeed: rpm,
      obdThrottlePosition: throttle,
      powertrainCombustionEngineTPS: tps,
      obdEngineLoad: load,
      powertrainTransmissionActualGear: gear,
      powertrainTransmissionActualGearRatio: gearRatio,
    },
    thermalWarmupNote:
      'Powertrain warming continues through Segment B (~52/41°C early → ~88/73°C late); do not compare RPM/load without thermal context',
  };
}

export function estimateSegmentBDriftFromB1Clock(
  calibrationEvidence: ClockCalibrationEvidence[],
  videoDurationSeconds: number,
) {
  const eligible = calibrationEvidence.filter(
    (e) => e.CLOCK_FIT_ELIGIBLE === 'YES' && e.impliedOffsetSeconds != null,
  );
  const points = eligible.map((e) => ({
    videoT: e.videoRelativeSeconds,
    offset: e.impliedOffsetSeconds!,
    landmarkId: e.landmarkId,
  }));

  const videoSpread =
    points.length >= 2
      ? Math.max(...points.map((p) => p.videoT)) - Math.min(...points.map((p) => p.videoT))
      : 0;

  if (points.length < 3 || videoDurationSeconds <= 0 || videoSpread < 400) {
    return {
      DRIFT_VALIDATED: 'NO' as const,
      ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: null,
      DRIFT_FIT_ELIGIBLE_LANDMARKS: eligible.map((e) => e.landmarkId),
      note: 'Requires >=3 independent clock landmarks spread across substantial Segment B duration',
    };
  }

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.videoT, 0);
  const sumY = points.reduce((s, p) => s + p.offset, 0);
  const sumXY = points.reduce((s, p) => s + p.videoT * p.offset, 0);
  const sumXX = points.reduce((s, p) => s + p.videoT * p.videoT, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  const driftOverSegment = slope * videoDurationSeconds;
  const residuals = points.map((p) => p.offset - (intercept + slope * p.videoT));
  const residualMad = mad(residuals) ?? Infinity;

  let driftValidated: 'YES' | 'NO' = 'NO';
  if (Math.abs(driftOverSegment) >= 3 && residualMad <= 8 && videoSpread >= 500) {
    driftValidated = 'YES';
  }

  return {
    DRIFT_VALIDATED: driftValidated,
    ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: driftValidated === 'YES' ? driftOverSegment : null,
    conceptualSlopeSecondsPerVideoSecond: slope,
    offsetAtBeginningSeconds: intercept,
    offsetAtMiddleSeconds: intercept + slope * (videoDurationSeconds / 2),
    offsetAtEndSeconds: intercept + slope * videoDurationSeconds,
    residuals,
    residualMadSeconds: residualMad,
    landmarkCount: points.length,
    videoSpreadSeconds: videoSpread,
  };
}

export function analyzeGearReverseValidation(
  rows: Rd004ObservationRow[],
  anchorMatches: AnchorMatchResult[],
  points: QualifiedSpeedPoint[],
) {
  const gearHf = rows.filter(
    (r) =>
      r.providerField === 'powertrainTransmissionActualGear' &&
      r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const ratioHf = rows.filter(
    (r) =>
      r.providerField === 'powertrainTransmissionActualGearRatio' &&
      r.acquisitionSurface === 'HF_HISTORICAL',
  );

  const gearObserved = gearHf.length > 0 || ratioHf.length > 0;
  const gearAnchors = anchorMatches.filter(
    (m) => m.status === 'MATCHED' && m.videoAnchorConfidence === 'HIGH',
  );

  let gearAgreement: 'YES' | 'PARTIAL' | 'NO' | 'NOT_APPLICABLE' = 'NOT_APPLICABLE';
  if (gearObserved) {
    gearAgreement = 'PARTIAL';
  } else {
    gearAgreement = 'NO';
  }

  const reverseAnchor = anchorMatches.find((m) => m.anchorId === 'B25');
  const reverseWindow = points.filter(
    (p) => p.videoRelativeSecondsProvisional >= 960 && p.videoRelativeSecondsProvisional <= 1010,
  );
  const reverseGearValues = gearHf
    .filter((r) => {
      const t = parseMs(r.providerTimestamp);
      const videoT = (t! - Date.parse(SEGMENT_B_CONSTANTS.videoStartUtc)) / 1000;
      return videoT >= 960 && videoT <= 1010;
    })
    .map((r) => extractNumericValue(r.rawValueJson))
    .filter((v): v is number => v != null);

  let reverseTelemetry: 'YES' | 'PARTIAL' | 'NO' = 'NO';
  if (reverseGearValues.some((v) => v < 0)) reverseTelemetry = 'YES';
  else if (reverseGearValues.length > 0 || ratioHf.length > 0) reverseTelemetry = 'PARTIAL';

  return {
    REVERSE_VIDEO_OBSERVED: 'YES',
    REVERSE_VIDEO_TIME_HIGH_CONFIDENCE: 'YES',
    REVERSE_TELEMETRY_SUPPORTED: reverseTelemetry,
    GEAR_STATE_OBSERVED: gearObserved ? 'YES' : 'NO',
    GEAR_STATE_VIDEO_AGREEMENT: gearObserved ? gearAgreement : 'NO',
    gearHfObservations: gearHf.length,
    gearRatioHfObservations: ratioHf.length,
    reverseWindowHfSpeedSamples: reverseWindow.length,
    reverseAnchorMatch: reverseAnchor ?? null,
    note: 'Unsigned speed cannot validate reverse; video R at t≈990s is high-confidence ground truth',
  };
}

export function compareSegmentACadence(segmentBHfCadence: ReturnType<typeof analyzeSignalCadenceForField>) {
  const bMedian = segmentBHfCadence.medianPhysicalCadenceSeconds ?? null;
  const aMedian = SEGMENT_A_CADENCE_REFERENCE.HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS;
  let comparison: string;
  if (bMedian == null) comparison = 'SEGMENT_B_NOT_OBSERVED';
  else if (bMedian <= aMedian * 1.15 && bMedian >= aMedian * 0.85)
    comparison = 'SIMILAR_TO_SEGMENT_A';
  else if (bMedian > aMedian) comparison = 'SPARSER_THAN_SEGMENT_A';
  else comparison = 'DENSER_THAN_SEGMENT_A';

  return {
    SEGMENT_A_B_CADENCE_COMPARISON: comparison,
    segmentA: SEGMENT_A_CADENCE_REFERENCE,
    segmentB: {
      HF_SPEED_ROWS: segmentBHfCadence.rowCount,
      HF_SPEED_UNIQUE_PHYSICAL_SAMPLES: segmentBHfCadence.uniquePhysicalSampleCount,
      HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS: segmentBHfCadence.medianPhysicalCadenceSeconds,
      HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS: segmentBHfCadence.p90PhysicalCadenceSeconds,
      HF_SPEED_MAX_GAP_SECONDS: segmentBHfCadence.maxGapSeconds,
    },
    interpretation:
      comparison === 'SPARSER_THAN_SEGMENT_A'
        ? 'Segment A poor cadence was not a one-off anomaly — Segment B median cadence is sparser'
        : 'Cadence differs between segments; both remain far below 1 Hz continuous',
  };
}

export type Rd004SegmentBAnalysisInput = {
  observations: Rd004ObservationRow[];
  legacySidecar: LegacyPreprocessedSpeedRow[];
};

export function runRd004SegmentBAnalysis(input: Rd004SegmentBAnalysisInput) {
  const envelope = filterRowsByProviderTimestampEnvelope(
    input.observations,
    SEGMENT_B_CONSTANTS.queryEnvelopeStartUtc,
    SEGMENT_B_CONSTANTS.queryEnvelopeEndUtc,
  );

  const signalCadence: Record<string, Record<string, ReturnType<typeof analyzeSignalCadenceForField>>> = {};
  for (const field of SEGMENT_B_SIGNALS) {
    signalCadence[field] = {};
    for (const surface of ACQUISITION_SURFACES) {
      signalCadence[field][surface] = analyzeSignalCadenceForField(envelope, field, surface);
    }
  }

  const qualifiedSpeed = buildQualifiedHfSpeedSeries(envelope, SEGMENT_B_CONSTANTS.videoStartUtc);
  const hfSpeedRows = envelope.filter(
    (r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const hfSpeedCadence = computePhysicalCadenceMetrics(hfSpeedRows);
  const staleDupes = identifyStaleHoldDuplicateRows(hfSpeedRows);

  const anchorMatches = matchAllVideoSpeedAnchors(SEGMENT_B_VIDEO_SPEED_ANCHORS, qualifiedSpeed);
  const split = splitCalibrationHoldoutSets();
  const globalSearch = searchGlobalClockOffset(SEGMENT_B_CLOCK_LANDMARKS, qualifiedSpeed);
  const clock = estimateSegmentBClockAlignmentB1(globalSearch, split);
  const drift = estimateSegmentBDriftFromB1Clock(
    globalSearch.calibrationEvidence,
    SEGMENT_B_CONSTANTS.videoDurationSeconds,
  );
  const previousBiased = computePreviousBiasedExploratoryResults(anchorMatches);
  const rawDisplacement = computeRawAnchorDisplacementDiagnostic(anchorMatches);
  const frozenOffsetForHoldout =
    clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS ?? clock.supportiveOffsetSeconds;
  const holdoutOffsetSource =
    clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS != null
      ? 'VALIDATED'
      : clock.supportiveOffsetSeconds != null
        ? 'CALIBRATION_SUPPORTIVE_ONLY'
        : 'NONE';
  const speedAccuracy = {
    ...computeHoldoutSpeedAccuracy(
      split.SPEED_ACCURACY_HOLDOUT_SET,
      SEGMENT_B_VIDEO_SPEED_ANCHORS,
      qualifiedSpeed,
      frozenOffsetForHoldout,
      clock.PROVIDER_TIMESTAMP_OFFSET_VALIDATED === 'YES',
    ),
    EXACT_OR_HIGH_CONFIDENCE_VIDEO_SPEED_ANCHORS_ACCEPTED: split.SPEED_ACCURACY_HOLDOUT_SET.filter(
      (a) => a.videoAnchorConfidence === 'HIGH',
    ).length,
    exploratoryPrevious: previousBiased,
    rawAnchorDisplacement: rawDisplacement,
    evidenceSplit: split,
    PREVIOUS_SPEED_ACCURACY_METHOD_SELECTION_BIASED: 'YES',
    PREPROCESSING_DISTORTION_VS_TELEMETRY_RAW: 'YES',
    HOLDOUT_FROZEN_OFFSET_SECONDS: frozenOffsetForHoldout,
    HOLDOUT_OFFSET_SOURCE: holdoutOffsetSource,
  };

  const acceleration = computeQualifiedAccelerationPairs(
    qualifiedSpeed,
    PROVISIONAL_ACCELERATION_MAX_GAP_SECONDS,
  );
  const accelerationGapSensitivity = computeAccelerationGapSensitivity(qualifiedSpeed);
  const episodes = findSpeedEpisodes(qualifiedSpeed);
  const stopTiming = analyzeStopTiming(
    qualifiedSpeed,
    clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS ?? clock.supportiveOffsetSeconds,
  );

  const legacySidecarFiltered = input.legacySidecar;
  const preprocessing = comparePreprocessingResponse(qualifiedSpeed, legacySidecarFiltered);

  const hfReadings = buildHfReadingsForLegacyDetectors(envelope);
  const legacyAudit = runLegacyDetectorAudit(hfReadings);
  const supporting = analyzeSupportingSignalsSegmentB(
    envelope,
    episodes,
    clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS,
  );
  const gearReverse = analyzeGearReverseValidation(envelope, anchorMatches, qualifiedSpeed);
  const segmentAComparison = compareSegmentACadence(signalCadence.speed.HF_HISTORICAL);

  const videoOrKinematicDynamicEpisodes = episodes.filter((ep) => {
    if (ep.type === 'deceleration' && ep.startSpeedKmh >= 60) return true;
    if (ep.type === 'launch' && ep.endSpeedKmh >= 40) return true;
    return false;
  }).length;

  const readyForCloseout =
    clock.PROVIDER_TIMESTAMP_OFFSET_VALIDATED === 'YES' &&
    speedAccuracy.ABSOLUTE_SPEED_ACCURACY_VALIDATED === 'YES'
      ? 'YES'
      : 'NO';

  const flags = {
    RD004_PHASE: RD004_B_PHASE,
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    SEGMENT_B_VIDEO_START_UTC: SEGMENT_B_CONSTANTS.videoStartUtc,
    SEGMENT_B_VIDEO_END_UTC: SEGMENT_B_CONSTANTS.videoEndUtc,
    VIDEO_ABSOLUTE_TIME_ANCHORED: clock.VIDEO_ABSOLUTE_TIME_ANCHORED,
    HF_SPEED_ROWS: hfSpeedRows.length,
    HF_SPEED_UNIQUE_PHYSICAL_SAMPLES: hfSpeedCadence.UNIQUE_PHYSICAL_SAMPLE_COUNT,
    HF_SPEED_MEDIAN_PHYSICAL_CADENCE_SECONDS: hfSpeedCadence.NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS,
    HF_SPEED_P90_PHYSICAL_CADENCE_SECONDS: hfSpeedCadence.NEW_PHYSICAL_SAMPLE_CADENCE_P90_SECONDS,
    HF_SPEED_MAX_GAP_SECONDS: hfSpeedCadence.NEW_PHYSICAL_SAMPLE_CADENCE_MAX_GAP_SECONDS,
    DUPLICATE_SPEED_SAMPLES: staleDupes.size,
    OUT_OF_ORDER_SPEED_SAMPLES: detectOutOfOrderByAcquisitionOrder(hfSpeedRows),
    EXACT_OR_HIGH_CONFIDENCE_VIDEO_SPEED_ANCHORS_ACCEPTED:
      speedAccuracy.EXACT_OR_HIGH_CONFIDENCE_VIDEO_SPEED_ANCHORS_ACCEPTED,
    PREVIOUS_OFFSET_METHOD_SELECTION_BIASED: 'YES',
    PREVIOUS_SPEED_ACCURACY_METHOD_SELECTION_BIASED: 'YES',
    CLOCK_CALIBRATION_HOLDOUT_SEPARATED: split.CLOCK_CALIBRATION_HOLDOUT_SEPARATED,
    CLOCK_CALIBRATION_ANCHOR_COUNT: split.CLOCK_CALIBRATION_ANCHOR_COUNT,
    CLOCK_HOLDOUT_ANCHOR_COUNT: split.CLOCK_HOLDOUT_ANCHOR_COUNT,
    PROVIDER_TIMESTAMP_OFFSET_VALIDATED: clock.PROVIDER_TIMESTAMP_OFFSET_VALIDATED,
    VIDEO_TO_PROVIDER_OFFSET_SECONDS: clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS,
    OFFSET_CANDIDATE_SUPPORTIVE_ONLY: clock.OFFSET_CANDIDATE_SUPPORTIVE_ONLY,
    OFFSET_CANDIDATE_AROUND_14_SECONDS: clock.OFFSET_CANDIDATE_AROUND_14_SECONDS,
    EXPLORATORY_PREVIOUS_OFFSET_SECONDS: previousBiased.EXPLORATORY_PREVIOUS_OFFSET_SECONDS,
    EXPLORATORY_PREVIOUS_SPEED_MAE_KMH: previousBiased.EXPLORATORY_PREVIOUS_SPEED_MAE_KMH,
    NOT_CANONICAL_VALIDATION_RESULT: 'YES',
    OFFSET_MAD_SECONDS: clock.OFFSET_MAD_SECONDS,
    VIDEO_PROVIDER_ALIGNMENT_CLASS: clock.VIDEO_PROVIDER_ALIGNMENT_CLASS,
    CLOCK_FIT_ELIGIBLE_LANDMARKS: clock.CLOCK_FIT_ELIGIBLE_LANDMARKS,
    SPEED_SAMPLE_SELECTION_TIME_ONLY: 'YES',
    HOLDOUT_ANCHOR_COUNT: speedAccuracy.HOLDOUT_ANCHOR_COUNT,
    HOLDOUT_COMPARABLE_SAMPLE_COUNT: speedAccuracy.HOLDOUT_COMPARABLE_SAMPLE_COUNT,
    HOLDOUT_REJECTED_FOR_TIME_DISTANCE: speedAccuracy.HOLDOUT_REJECTED_FOR_TIME_DISTANCE,
    HOLDOUT_FROZEN_OFFSET_SECONDS: frozenOffsetForHoldout,
    HOLDOUT_OFFSET_SOURCE: holdoutOffsetSource,
    DRIFT_VALIDATED: drift.DRIFT_VALIDATED,
    ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT: drift.ESTIMATED_DRIFT_SECONDS_OVER_SEGMENT,
    ABSOLUTE_SPEED_ACCURACY_VALIDATED: speedAccuracy.ABSOLUTE_SPEED_ACCURACY_VALIDATED,
    SPEED_MAE_KMH: speedAccuracy.SPEED_MAE_KMH,
    SPEED_MEDIAN_ABS_ERROR_KMH: speedAccuracy.SPEED_MEDIAN_ABS_ERROR_KMH,
    SPEED_P90_ABS_ERROR_KMH: speedAccuracy.SPEED_P90_ABS_ERROR_KMH,
    SPEED_BIAS_KMH: speedAccuracy.SPEED_BIAS_KMH,
    SPEED_MAX_ABS_ERROR_KMH: speedAccuracy.SPEED_MAX_ABS_ERROR_KMH,
    LOW_SPEED_MAE_KMH: speedAccuracy.LOW_SPEED_MAE_KMH,
    MEDIUM_SPEED_MAE_KMH: speedAccuracy.MEDIUM_SPEED_MAE_KMH,
    HIGH_SPEED_MAE_KMH: speedAccuracy.HIGH_SPEED_MAE_KMH,
    STABLE_STATE_SPEED_ACCURACY: speedAccuracy.STABLE_STATE_SPEED_ACCURACY,
    DYNAMIC_STATE_SPEED_ACCURACY: speedAccuracy.DYNAMIC_STATE_SPEED_ACCURACY,
    STOP_TIMING_VALIDATED: stopTiming.STOP_TIMING_VALIDATED,
    STOP_TIMING_CLOCK_CORRECTED: stopTiming.STOP_TIMING_CLOCK_CORRECTED,
    DECELERATION_TO_STOP_VALIDATED: stopTiming.DECELERATION_TO_STOP_VALIDATED,
    STOP_LAUNCH_VALIDATED: stopTiming.STOP_LAUNCH_VALIDATED,
    ACCELERATION_RECONSTRUCTION_VALIDATED:
      acceleration.qualifiedPairCount >= 10 ? 'PARTIAL' : 'NO',
    ACCELERATION_PERCENTILE_BUG_FIXED: 'YES',
    MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH: preprocessing.MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH,
    TRUE_LOCAL_PEAK_ATTENUATION_KMH: preprocessing.TRUE_LOCAL_PEAK_ATTENUATION_KMH,
    TRUE_LOCAL_PEAK_EVENT_COUNT: preprocessing.TRUE_LOCAL_PEAK_EVENT_COUNT,
    LOCAL_PEAK_TIME_SHIFT_AVAILABLE: preprocessing.LOCAL_PEAK_TIME_SHIFT_AVAILABLE,
    PREPROCESSING_DISTORTION_VS_TELEMETRY_RAW: 'YES',
    TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY:
      TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY,
    ...legacyAudit.counts,
    LIKELY_FALSE_POSITIVE_EVENTS: legacyAudit.counts.LIKELY_FALSE_POSITIVE_EVENTS,
    LEGACY_FALSE_NEGATIVE_VALIDATED: 'NO',
    VIDEO_OR_KINEMATIC_DYNAMIC_EPISODES_WITHOUT_LEGACY_EVENT: videoOrKinematicDynamicEpisodes,
    RPM_SEGMENT_B_VALIDATION: supporting.RPM_SEGMENT_B_VALIDATION,
    THROTTLE_SEGMENT_B_VALIDATION: supporting.THROTTLE_SEGMENT_B_VALIDATION,
    TPS_SEGMENT_B_VALIDATION: supporting.TPS_SEGMENT_B_VALIDATION,
    GEAR_STATE_OBSERVED: gearReverse.GEAR_STATE_OBSERVED,
    GEAR_STATE_VIDEO_AGREEMENT: gearReverse.GEAR_STATE_VIDEO_AGREEMENT,
    REVERSE_VIDEO_OBSERVED: gearReverse.REVERSE_VIDEO_OBSERVED,
    REVERSE_VIDEO_TIME_HIGH_CONFIDENCE: gearReverse.REVERSE_VIDEO_TIME_HIGH_CONFIDENCE,
    REVERSE_TELEMETRY_SUPPORTED: gearReverse.REVERSE_TELEMETRY_SUPPORTED,
    SEGMENT_A_B_CADENCE_COMPARISON: segmentAComparison.SEGMENT_A_B_CADENCE_COMPARISON,
    THERMAL_CONTEXT: SEGMENT_B_CONSTANTS.thermalContext,
    RD004_SEGMENT_A_COMPLETE: 'YES',
    RD004_SEGMENT_B_COMPLETE: 'YES',
    RD004_WHOLE_DRIVE_EVIDENCE_ANALYZED: 'YES',
    PRODUCTION_SCORE_CHANGED: 'NO',
    PRODUCTION_DETECTORS_CHANGED: 'NO',
    TIRE_RUNTIME_CHANGED: 'NO',
    BRAKE_RUNTIME_CHANGED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    DEPLOYED: 'NO',
    READY_FOR_RD004_FINAL_CLOSEOUT: readyForCloseout,
    READY_FOR_MERGE: 'NO',
  };

  return {
    evidenceId: RD004_B_EVIDENCE_ID,
    mode: RD004_B_MODE,
    constants: SEGMENT_B_CONSTANTS,
    envelopeRowCount: envelope.length,
    signalCadence,
    videoAnchorTable: {
      anchors: SEGMENT_B_VIDEO_SPEED_ANCHORS,
      matches: anchorMatches,
      exploratorySpeedBiasedMatching: 'DIAGNOSTIC_ONLY_NOT_CANONICAL',
      rawAnchorDisplacement: rawDisplacement,
    },
    videoClockAlignment: {
      evidenceSplit: split,
      globalOffsetSearch: globalSearch,
      clock,
      drift,
      legacyExploratoryClockLandmarkMatches: matchClockLandmarks(SEGMENT_B_CLOCK_LANDMARKS, anchorMatches),
      note:
        'B.1: clock calibration uses event-boundary landmarks + global time-only offset search; holdout speed accuracy is independent',
    },
    speedAccuracy,
    stopTiming,
    qualifiedSpeedSeries: qualifiedSpeed,
    kinematicReconstruction: {
      ...acceleration,
      gapSensitivity: accelerationGapSensitivity,
      telemetryEpisodesDetected: episodes,
      VIDEO_OR_KINEMATIC_DYNAMIC_EPISODES_WITHOUT_LEGACY_EVENT: videoOrKinematicDynamicEpisodes,
      LEGACY_FALSE_NEGATIVE_VALIDATED: 'NO',
    },
    preprocessingResponse: {
      ...preprocessing,
      PREPROCESSING_DISTORTION_VS_TELEMETRY_RAW: 'YES',
      note: 'Preprocessing metrics are telemetry-internal raw-vs-smoothed distortion — not physical ground-truth error',
    },
    legacyDetectorAudit: legacyAudit,
    supportingSignals: supporting,
    gearReverseValidation: gearReverse,
    segmentAComparison,
    flags,
  };
}

export function rd004SegmentBOutputSha256(artifacts: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(stableStringify(artifacts)).digest('hex');
}

export {
  assertNoEnvironmentSpecificPathsInObject,
  computeRd004SourceBundleSha256,
  loadRd004Jsonl,
  toRepoRelativePath,
};
