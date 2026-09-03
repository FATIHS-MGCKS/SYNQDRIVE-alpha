/**
 * DI-EV-0034B episode-level analysis (direction, shift) — read-only overlays.
 * Does not modify alignment numerical logic.
 */
import {
  filterTelemetryByFieldAndSurface,
  isAlignmentEligibleGroundTruth,
  type ClipAlignmentResult,
  type ExternalGtClip,
  type SurfaceSpeedAlignment,
} from './reference-capture-rd003-video-gt-alignment';
import type { VideoGtExportedRow } from './reference-capture-rd003-video-gt-export';

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function analyzeImg2810ShiftEpisode(params: {
  clip: ExternalGtClip;
  telemetryRows: VideoGtExportedRow[];
  alignment: ClipAlignmentResult;
}): Record<string, unknown> {
  const gearRows = filterTelemetryByFieldAndSurface(
    params.telemetryRows,
    'powertrainTransmissionActualGear',
    'LATEST_SLOW',
  );
  const shiftObs = params.clip.observations.find((o) => o.observationType === 'SHIFT_TRANSITION');
  const signalsNearShift = ['speed', 'powertrainCombustionEngineSpeed', 'obdThrottlePosition', 'powertrainCombustionEngineTPS', 'obdEngineLoad'] as const;
  const signalPresence: Record<string, string> = {};
  const alignedMs = parseMs(params.alignment.offsetSemantics.ALIGNED_CLIP_START_UTC);

  for (const field of signalsNearShift) {
    const rows = params.telemetryRows.filter((r) => r.providerField === field);
    signalPresence[field] = rows.length > 0 ? 'OBSERVED' : 'NOT_OBSERVED';
  }

  return {
    clipId: params.clip.clipId,
    fileName: params.clip.fileName,
    videoShiftGt: shiftObs
      ? {
          videoTimeSeconds: shiftObs.videoTimeSeconds,
          videoTimeUncertaintySeconds: shiftObs.videoTimeUncertaintySeconds,
          value: shiftObs.value,
          confidence: shiftObs.confidence,
          evidenceClass: shiftObs.evidenceClass,
        }
      : null,
    alignedClipStartUtc: params.alignment.offsetSemantics.ALIGNED_CLIP_START_UTC,
    overallAlignmentStatus: params.alignment.alignmentStatus,
    preferredSpeedAlignmentSurface: params.alignment.preferredSpeedAlignmentSurface,
    gearTiming: params.alignment.gearTiming,
    actualGearObservationCount: gearRows.length,
    VIDEO_GEAR_OBSERVATION_NOT_TELEMETRY_PROOF: 'YES',
    signalsNearShiftEpisode: signalPresence,
    GEAR_CHANGE_TIMING_RECONSTRUCTED: 'NO',
    note:
      'Video S2→S3 is external visual GT. powertrainTransmissionActualGear cadence assessment remains separate.',
  };
}

export function analyzeImg2811DirectionEpisode(params: {
  clip: ExternalGtClip;
  telemetryRows: VideoGtExportedRow[];
  alignment: ClipAlignmentResult;
}): Record<string, unknown> {
  const hasReverseVideo = params.clip.observations.some((o) => o.observationType === 'REVERSE_MOTION');
  const hasDirectionChange = params.clip.observations.some((o) => o.observationType === 'DIRECTION_CHANGE');
  const gearRows = filterTelemetryByFieldAndSurface(
    params.telemetryRows,
    'powertrainTransmissionActualGear',
    'LATEST_SLOW',
  );

  let directionFromTelemetry: string = 'NOT_IDENTIFIABLE';
  if (gearRows.length >= 3) {
    directionFromTelemetry = 'PARTIAL';
  } else if (gearRows.length > 0) {
    directionFromTelemetry = 'PARTIAL';
  }

  const signedSpeedFabricated = params.clip.observations.some(
    (o) => o.observationType === 'SPEED' && typeof o.value === 'number' && (o.value as number) < 0,
  );

  return {
    clipId: params.clip.clipId,
    fileName: params.clip.fileName,
    VIDEO_DIRECTION_GT: hasReverseVideo || hasDirectionChange ? 'AVAILABLE' : 'NOT_OBSERVED',
    DIRECTION_FROM_VIDEO: hasReverseVideo ? 'OBSERVED' : 'NOT_OBSERVED',
    DIRECTION_FROM_TELEMETRY: directionFromTelemetry,
    SIGNED_SPEED_FABRICATED_FROM_UNSIGNED_SPEED: signedSpeedFabricated ? 'YES' : 'NO',
    overallAlignmentStatus: params.alignment.alignmentStatus,
    preferredSpeedAlignmentSurface: params.alignment.preferredSpeedAlignmentSurface,
    note:
      'Unsigned speed magnitude preserved. Reverse/forward direction remains separate video GT landmarks.',
  };
}

export function buildEpisodeAnalyses(params: {
  clips: ExternalGtClip[];
  telemetryRows: VideoGtExportedRow[];
  clipAlignments: ClipAlignmentResult[];
}): Record<string, unknown> {
  const byClipId = new Map(params.clipAlignments.map((a) => [a.clipId, a]));
  const clipMap = new Map(params.clips.map((c) => [c.clipId, c]));
  const img2810 = clipMap.get('RD003_GT_CLIP_008');
  const img2811 = clipMap.get('RD003_GT_CLIP_009');
  const align2810 = byClipId.get('RD003_GT_CLIP_008');
  const align2811 = byClipId.get('RD003_GT_CLIP_009');

  return {
    evidenceLayer: 'CANDIDATE_EPISODE_ANALYSIS',
    ingestionEvidenceId: 'DI-EV-0034B',
    IMG_2810:
      img2810 && align2810
        ? analyzeImg2810ShiftEpisode({
            clip: img2810,
            telemetryRows: params.telemetryRows,
            alignment: align2810,
          })
        : null,
    IMG_2811:
      img2811 && align2811
        ? analyzeImg2811DirectionEpisode({
            clip: img2811,
            telemetryRows: params.telemetryRows,
            alignment: align2811,
          })
        : null,
  };
}

export function buildPerClipAlignmentReport(
  clip: ExternalGtClip,
  alignment: ClipAlignmentResult,
): Record<string, unknown> {
  const surfaceReport = (surface: string) => {
    const entry = alignment.speedAlignmentBySurface[surface] as
      | SurfaceSpeedAlignment
      | { status: 'NOT_OBSERVED' }
      | undefined;
    if (!entry || entry.status === 'NOT_OBSERVED') {
      return { status: 'NOT_OBSERVED' as const };
    }
    return {
      status: entry.status,
      alignedClipStartUtc: entry.bestCandidate.alignedClipStartUtc,
      candidateStartResidualSeconds: entry.bestCandidate.candidateStartResidualSeconds,
      matchedGtCount: entry.metrics.MATCHED_GT_COUNT,
      coverageRatio: entry.metrics.MATCH_COVERAGE_RATIO,
      MAE: entry.metrics.SPEED_MAE_KMH,
      RMSE: entry.metrics.SPEED_RMSE_KMH,
      maxAbsError: entry.metrics.SPEED_MAX_ABS_ERROR_KMH,
      bestBasinStart: entry.ambiguityContext.BEST_BASIN_START_SECONDS,
      bestBasinEnd: entry.ambiguityContext.BEST_BASIN_END_SECONDS,
      offsetUncertainty: entry.ambiguityContext.OFFSET_UNCERTAINTY_SECONDS,
    };
  };

  return {
    clipId: clip.clipId,
    fileName: clip.fileName,
    RAW_EXTERNAL_GT_COUNT: alignment.gtCounts.RAW_EXTERNAL_GT_COUNT,
    ALIGNMENT_ELIGIBLE_GT_COUNT: alignment.gtCounts.ALIGNMENT_ELIGIBLE_GT_COUNT,
    candidateTimePrior: {
      CANDIDATE_START_PRIOR_UTC: alignment.offsetSemantics.CANDIDATE_START_PRIOR_UTC,
      CANDIDATE_START_PRIOR_UTC_FROM: alignment.offsetSemantics.CANDIDATE_START_PRIOR_UTC_FROM,
      CANDIDATE_START_PRIOR_UTC_TO: alignment.offsetSemantics.CANDIDATE_START_PRIOR_UTC_TO,
    },
    HF_HISTORICAL: surfaceReport('HF_HISTORICAL'),
    LATEST_LIVE: surfaceReport('LATEST_LIVE'),
    LATEST_SLOW: surfaceReport('LATEST_SLOW'),
    preferredSpeedAlignmentSurface: alignment.preferredSpeedAlignmentSurface,
    overallAlignmentStatus: alignment.alignmentStatus,
    clockBoundaryResidual: alignment.clockBoundary.VIDEO_CLOCK_BOUNDARY_RESIDUAL_SECONDS,
    clockBoundaryResidualStatus: alignment.clockBoundary.VIDEO_CLOCK_BOUNDARY_RESIDUAL_STATUS,
    clockModelBoundaryEligible: alignment.clockBoundary.CLOCK_MODEL_BOUNDARY_ELIGIBLE,
  };
}

export function summarizeEligibleSpeedGt(clips: ExternalGtClip[]): {
  clipsWithGt: number;
  totalRawObservations: number;
  totalAlignmentEligibleSpeedPoints: number;
} {
  return {
    clipsWithGt: clips.filter((c) => c.observations.length > 0).length,
    totalRawObservations: clips.reduce((s, c) => s + c.observations.length, 0),
    totalAlignmentEligibleSpeedPoints: clips.reduce(
      (s, c) => s + c.observations.filter(isAlignmentEligibleGroundTruth).length,
      0,
    ),
  };
}
