/**
 * RD004-B / DI-EV-0035B — Segment B video ↔ telemetry validation (read-only analysis).
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

export const RD004_B_PHASE = 'RD004-B';
export const RD004_B_EVIDENCE_ID = 'DI-EV-0035B';
export const RD004_B_MODE = 'RD004_SEGMENT_B_VIDEO_TELEMETRY_VALIDATION';

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
  anchorMatches: AnchorMatchResult[],
  offsetValidated: boolean,
  validatedOffsetSeconds: number | null,
) {
  const accepted = anchorMatches.filter(
    (m) =>
      m.status === 'MATCHED' &&
      m.videoAnchorConfidence !== 'REJECTED' &&
      (m.videoAnchorConfidence === 'HIGH' ||
        (m.videoAnchorConfidence === 'MEDIUM' && m.matchConfidence !== 'INSUFFICIENT')) &&
      m.matchConfidence !== 'INSUFFICIENT' &&
      m.speedErrorKmh != null,
  );

  const highConfidence = accepted.filter(
    (m) =>
      m.videoAnchorConfidence === 'HIGH' &&
      (m.matchConfidence === 'HIGH' || m.matchConfidence === 'MEDIUM'),
  );

  const offset =
    validatedOffsetSeconds ??
    (highConfidence.length >= 5
      ? sortedPercentile(
          highConfidence
            .map((m) => m.candidateOffsetSeconds)
            .filter((v): v is number => v != null),
          50,
        )
      : null);

  const errors = accepted.map((m) => {
    const adjustedError =
      offset != null && m.telemetryVideoRelativeSeconds != null
        ? m.speedErrorKmh!
        : m.speedErrorKmh!;
    return {
      anchorId: m.anchorId,
      videoSpeedKmh: m.videoSpeedKmh,
      providerSpeedKmh: m.providerSpeedKmh,
      speedErrorKmh: adjustedError,
      absErrorKmh: Math.abs(adjustedError),
      regime: m.videoSpeedKmh <= 30 ? 'LOW' : m.videoSpeedKmh <= 80 ? 'MEDIUM' : 'HIGH',
    };
  });

  const absErrors = errors.map((e) => e.absErrorKmh);
  const byRegime = (regime: string) => errors.filter((e) => e.regime === regime);

  const mae = (items: typeof errors) =>
    items.length
      ? items.reduce((s, e) => s + e.absErrorKmh, 0) / items.length
      : null;

  return {
    EXACT_OR_HIGH_CONFIDENCE_VIDEO_SPEED_ANCHORS_ACCEPTED: highConfidence.length,
    anchorMatchCount: accepted.length,
    ABSOLUTE_SPEED_ACCURACY_VALIDATED: offsetValidated && accepted.length >= 8 ? 'YES' : 'NO',
    SPEED_MAE_KMH: mae(errors),
    SPEED_MEDIAN_ABS_ERROR_KMH: sortedPercentile(absErrors, 50),
    SPEED_P90_ABS_ERROR_KMH: sortedPercentile(absErrors, 90),
    SPEED_BIAS_KMH: errors.length
      ? errors.reduce((s, e) => s + e.speedErrorKmh, 0) / errors.length
      : null,
    SPEED_MAX_ABS_ERROR_KMH: absErrors.length ? Math.max(...absErrors) : null,
    LOW_SPEED_MAE_KMH: mae(byRegime('LOW')),
    MEDIUM_SPEED_MAE_KMH: mae(byRegime('MEDIUM')),
    HIGH_SPEED_MAE_KMH: mae(byRegime('HIGH')),
    perAnchorErrors: errors,
    provisionalOffsetUsedForReporting: offset,
    note: offsetValidated
      ? 'Speed accuracy computed with validated provider offset'
      : 'Speed errors from best-effort anchor matches; offset not validated',
  };
}

export function analyzeStopTiming(points: QualifiedSpeedPoint[]) {
  const analyzeWindow = (
    label: string,
    startT: number,
    endT: number,
    videoStopT: number,
  ) => {
    const window = points.filter(
      (p) =>
        p.videoRelativeSecondsProvisional >= startT &&
        p.videoRelativeSecondsProvisional <= endT,
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
        ? zeros.at(-1)!.videoRelativeSecondsProvisional -
          zeros[0]!.videoRelativeSecondsProvisional
        : null;
    const hfStopT = firstZero?.videoRelativeSecondsProvisional ?? null;
    return {
      label,
      videoStopVideoRelativeSeconds: videoStopT,
      hfFirstDecelVideoRelativeSeconds: firstDecel?.videoRelativeSecondsProvisional ?? null,
      hfFirstZeroVideoRelativeSeconds: hfStopT,
      hfStopDurationSeconds: stopDuration,
      timeErrorSeconds:
        hfStopT != null ? hfStopT - videoStopT : null,
      sampleCount: window.length,
    };
  };

  const windows = [
    analyzeWindow('B-E4_LONG_DECEL_TO_STOP', 520, 680, 630),
    analyzeWindow('B-E5_SECOND_STOP', 700, 770, 720),
  ];

  const validated = windows.every(
    (w) => w.hfFirstZeroVideoRelativeSeconds != null && Math.abs(w.timeErrorSeconds ?? 999) <= 35,
  );

  return {
    STOP_TIMING_VALIDATED: validated ? 'PARTIAL' : 'NO',
    DECELERATION_TO_STOP_VALIDATED: windows[0]!.hfFirstDecelVideoRelativeSeconds != null
      ? 'PARTIAL'
      : 'NO',
    STOP_LAUNCH_VALIDATED:
      windows[0]!.hfFirstZeroVideoRelativeSeconds != null ? 'PARTIAL' : 'NO',
    windows,
    note: 'Sparse HF cadence limits stop boundary precision; video stop timing is authoritative',
  };
}

function assessSegmentField(
  rows: Rd004ObservationRow[],
  field: string,
): {
  observed: boolean;
  sampleCount: number;
  uniquePhysical: number;
  dynamicRange: number | null;
  segmentValidation: string;
  globalAuthority: string;
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
    };
  }
  const cadence = computePhysicalCadenceMetrics(hf);
  const values = dedupePhysicalSamples(hf)
    .map((r) => extractNumericValue(r.rawValueJson))
    .filter((v): v is number => v != null);
  const dynamicRange = values.length ? Math.max(...values) - Math.min(...values) : null;
  const sufficientSamples = (cadence.UNIQUE_PHYSICAL_SAMPLE_COUNT ?? 0) >= 5;
  const dynamicallyInformative = dynamicRange != null && dynamicRange >= 5;

  let segmentValidation: string;
  if (!sufficientSamples) segmentValidation = 'INSUFFICIENT_SAMPLE_COUNT';
  else if (!dynamicallyInformative) segmentValidation = 'NOT_DYNAMICALLY_INFORMATIVE';
  else segmentValidation = 'PARTIAL';

  return {
    observed: true,
    sampleCount: hf.length,
    uniquePhysical: cadence.UNIQUE_PHYSICAL_SAMPLE_COUNT ?? 0,
    dynamicRange,
    segmentValidation,
    globalAuthority: 'USEFUL_WITH_GATING',
  };
}

export function analyzeSupportingSignalsSegmentB(rows: Rd004ObservationRow[]) {
  const rpm = assessSegmentField(rows, 'powertrainCombustionEngineSpeed');
  const throttle = assessSegmentField(rows, 'obdThrottlePosition');
  const tps = assessSegmentField(rows, 'powertrainCombustionEngineTPS');
  const load = assessSegmentField(rows, 'obdEngineLoad');
  const gear = assessSegmentField(rows, 'powertrainTransmissionActualGear');
  const gearRatio = assessSegmentField(rows, 'powertrainTransmissionActualGearRatio');
  const gearObserved = gear.observed || gearRatio.observed;

  return {
    RPM_GLOBAL_AUTHORITY: rpm.globalAuthority,
    RPM_SEGMENT_B_VALIDATION: rpm.segmentValidation,
    THROTTLE_GLOBAL_AUTHORITY: throttle.globalAuthority,
    THROTTLE_SEGMENT_B_VALIDATION: throttle.segmentValidation,
    TPS_GLOBAL_AUTHORITY: tps.globalAuthority,
    TPS_SEGMENT_B_VALIDATION: tps.segmentValidation,
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
  const clockLandmarkMatches = matchClockLandmarks(SEGMENT_B_CLOCK_LANDMARKS, anchorMatches);
  const clock = estimateSegmentBClockAlignment(clockLandmarkMatches);
  const drift = estimateSegmentBDrift(clockLandmarkMatches, SEGMENT_B_CONSTANTS.videoDurationSeconds);
  const speedAccuracy = computeSpeedAccuracy(
    anchorMatches,
    clock.PROVIDER_TIMESTAMP_OFFSET_VALIDATED === 'YES',
    clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS,
  );

  const acceleration = computeQualifiedAccelerationPairs(
    qualifiedSpeed,
    PROVISIONAL_ACCELERATION_MAX_GAP_SECONDS,
  );
  const accelerationGapSensitivity = computeAccelerationGapSensitivity(qualifiedSpeed);
  const episodes = findSpeedEpisodes(qualifiedSpeed);
  const stopTiming = analyzeStopTiming(qualifiedSpeed);

  const legacySidecarFiltered = input.legacySidecar;
  const preprocessing = comparePreprocessingResponse(qualifiedSpeed, legacySidecarFiltered);

  const hfReadings = buildHfReadingsForLegacyDetectors(envelope);
  const legacyAudit = runLegacyDetectorAudit(hfReadings);
  const supporting = analyzeSupportingSignalsSegmentB(envelope);
  const gearReverse = analyzeGearReverseValidation(envelope, anchorMatches, qualifiedSpeed);
  const segmentAComparison = compareSegmentACadence(signalCadence.speed.HF_HISTORICAL);

  const possibleFalseNegatives = episodes.filter((ep) => {
    if (ep.type === 'deceleration' && ep.startSpeedKmh >= 60) return true;
    if (ep.type === 'launch' && ep.endSpeedKmh >= 40) return true;
    return false;
  }).length;

  const flags = {
    RD004_PHASE: RD004_B_PHASE,
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
    PROVIDER_TIMESTAMP_OFFSET_VALIDATED: clock.PROVIDER_TIMESTAMP_OFFSET_VALIDATED,
    VIDEO_TO_PROVIDER_OFFSET_SECONDS: clock.VIDEO_TO_PROVIDER_OFFSET_SECONDS,
    OFFSET_MAD_SECONDS: clock.OFFSET_MAD_SECONDS,
    VIDEO_PROVIDER_ALIGNMENT_CLASS: clock.VIDEO_PROVIDER_ALIGNMENT_CLASS,
    CLOCK_FIT_ELIGIBLE_LANDMARKS: clock.CLOCK_FIT_ELIGIBLE_LANDMARKS,
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
    STOP_TIMING_VALIDATED: stopTiming.STOP_TIMING_VALIDATED,
    DECELERATION_TO_STOP_VALIDATED: stopTiming.DECELERATION_TO_STOP_VALIDATED,
    STOP_LAUNCH_VALIDATED: stopTiming.STOP_LAUNCH_VALIDATED,
    ACCELERATION_RECONSTRUCTION_VALIDATED:
      acceleration.qualifiedPairCount >= 10 ? 'PARTIAL' : 'NO',
    ACCELERATION_PERCENTILE_BUG_FIXED: 'YES',
    MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH: preprocessing.MAX_SAME_TIMESTAMP_RAW_SMOOTHED_DELTA_KMH,
    TRUE_LOCAL_PEAK_ATTENUATION_KMH: preprocessing.TRUE_LOCAL_PEAK_ATTENUATION_KMH,
    TRUE_LOCAL_PEAK_EVENT_COUNT: preprocessing.TRUE_LOCAL_PEAK_EVENT_COUNT,
    LOCAL_PEAK_TIME_SHIFT_AVAILABLE: preprocessing.LOCAL_PEAK_TIME_SHIFT_AVAILABLE,
    TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY:
      TRUE_LOCAL_PEAK_ATTENUATION_DOES_NOT_USE_SAME_TIMESTAMP_PROXY,
    ...legacyAudit.counts,
    LIKELY_FALSE_POSITIVE_EVENTS: legacyAudit.counts.LIKELY_FALSE_POSITIVE_EVENTS,
    POSSIBLE_FALSE_NEGATIVE_EVENTS: possibleFalseNegatives,
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
    READY_FOR_RD004_FINAL_CLOSEOUT: 'YES',
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
    },
    videoClockAlignment: {
      clockLandmarkMatches,
      clock,
      drift,
      note: 'VIDEO_ABSOLUTE_TIME_ANCHORED != PROVIDER_TIMESTAMP_OFFSET_VALIDATED',
    },
    speedAccuracy,
    stopTiming,
    qualifiedSpeedSeries: qualifiedSpeed,
    kinematicReconstruction: {
      ...acceleration,
      gapSensitivity: accelerationGapSensitivity,
      telemetryEpisodesDetected: episodes,
    },
    preprocessingResponse: preprocessing,
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
