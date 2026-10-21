/**
 * DI-EV-0034C — GLOBAL_FINGERPRINT_DISCOVERY mode.
 * Full-session speed fingerprint search without hard clock-prior bounds.
 * Does NOT modify external GT or canonical telemetry.
 */
import * as crypto from 'crypto';
import {
  AMBIGUITY_MAE_DELTA_KMH,
  absoluteEventMsFromAlignedClipStart,
  buildSpeedSeries,
  compareCandidateQuality,
  computeProviderDeliveryMetrics,
  deriveTelemetryAtUtc,
  filterTelemetryByFieldAndSurface,
  identifyNearOptimalBasins,
  isAlignmentEligibleGroundTruth,
  MIN_ALIGNMENT_ELIGIBLE_GT_POINTS,
  MIN_STRONG_CANDIDATE_COVERAGE,
  parseCestLocalMinuteToUtcMs,
  clipHasObservedMinuteTransition,
  getClipObservedMinuteTransition,
  scoreSpeedResidual,
  SESSION_START,
  SESSION_STOP,
  SPEED_SURFACES,
  stableStringify,
  SURFACE_INTERPOLATION_GAP_SECONDS,
  type AcquisitionSurface,
  type AlignmentStatus,
  type ExternalGtClip,
  type ExternalGtDocument,
  type ExternalGtObservation,
  type SpeedMatchMetrics,
  type SpeedSeriesPoint,
} from './reference-capture-rd003-video-gt-alignment';
import type { VideoGtExportedRow } from './reference-capture-rd003-video-gt-export';

export const DISCOVERY_EVIDENCE_ID = 'DI-EV-0034C';
export const DISCOVERY_MODE = 'GLOBAL_FINGERPRINT_DISCOVERY';
export const HARD_CLOCK_PRIOR_MODE = 'HARD_CLOCK_PRIOR_RUN';

export const COARSE_STEP_SECONDS = 0.5;
export const FINE_STEP_SECONDS = 0.1;
export const FINE_REFINE_RADIUS_SECONDS = 2.0;
export const TOP_DISTINCT_BASINS = 5;

export const CLIP_CHRONOLOGY_ORDER = [
  'RD003_GT_CLIP_001',
  'RD003_GT_CLIP_002',
  'RD003_GT_CLIP_003',
  'RD003_GT_CLIP_004',
  'RD003_GT_CLIP_005',
  'RD003_GT_CLIP_006',
  'RD003_GT_CLIP_007',
  'RD003_GT_CLIP_008',
  'RD003_GT_CLIP_009',
] as const;

export const TRANSITION_CLIP_IDS = new Set([
  'RD003_GT_CLIP_001',
  'RD003_GT_CLIP_003',
  'RD003_GT_CLIP_004',
  'RD003_GT_CLIP_005',
  'RD003_GT_CLIP_007',
]);

export const STATIC_MINUTE_CLIP_IDS = new Set([
  'RD003_GT_CLIP_002',
  'RD003_GT_CLIP_006',
  'RD003_GT_CLIP_008',
]);

const FIRST_RUN_PHASE_PATTERN_MIN = 19;
const FIRST_RUN_PHASE_PATTERN_MAX = 32;

const IMG_2810_DIAGNOSTIC_START_MS = Date.parse('2026-09-02T19:23:59.500Z');
const IMG_2810_DIAGNOSTIC_WINDOW_FROM_MS = Date.parse('2026-09-02T19:23:50.000Z');
const IMG_2810_DIAGNOSTIC_WINDOW_TO_MS = Date.parse('2026-09-02T19:24:10.000Z');

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function hasObservedMinuteTransition(clip: ExternalGtClip): boolean {
  return clipHasObservedMinuteTransition(clip);
}

export function getObservedMinuteTransition(clip: ExternalGtClip): {
  videoTimeSeconds: number;
  toMinute: string;
} | null {
  return getClipObservedMinuteTransition(clip);
}

export function normalizePhaseSecondsMod60(seconds: number): number {
  let s = seconds % 60;
  if (s < 0) s += 60;
  return s;
}

export function circularDistanceMod60(a: number, b: number): number {
  const na = normalizePhaseSecondsMod60(a);
  const nb = normalizePhaseSecondsMod60(b);
  const d = Math.abs(na - nb);
  return Math.min(d, 60 - d);
}

export function equivalentPhaseMod60(a: number, b: number): boolean {
  return circularDistanceMod60(a, b) < 1e-6;
}

export type GlobalSearchCandidate = SpeedMatchMetrics & {
  alignedClipStartUtc: string;
  alignedClipStartMs: number;
  matchCoverageRatio: number;
};

export function scoreSpeedAtAbsoluteClipStart(params: {
  eligibleObservations: ExternalGtObservation[];
  speedSeries: SpeedSeriesPoint[];
  alignedClipStartMs: number;
  maxGapSeconds: number;
}): SpeedMatchMetrics & { matchCoverageRatio: number } {
  const residualSeconds = params.alignedClipStartMs / 1000;
  const score = scoreSpeedResidual({
    eligibleObservations: params.eligibleObservations,
    speedSeries: params.speedSeries,
    searchAnchorMs: 0,
    residualSeconds,
    maxGapSeconds: params.maxGapSeconds,
  });
  const matchCoverageRatio = score.total > 0 ? score.matched / score.total : 0;
  return { ...score, matchCoverageRatio };
}

export function classifyGlobalCandidateStatus(
  candidate: GlobalSearchCandidate,
): AlignmentStatus {
  if (candidate.total < MIN_ALIGNMENT_ELIGIBLE_GT_POINTS) return 'INSUFFICIENT_GROUND_TRUTH';
  if (candidate.matched === 0) return 'INSUFFICIENT_CADENCE';
  if (candidate.mae > 15) return 'NOT_IDENTIFIABLE';
  if (candidate.matchCoverageRatio < MIN_STRONG_CANDIDATE_COVERAGE) return 'NOT_IDENTIFIABLE';
  return 'STRONG_CANDIDATE';
}

export function sessionSearchBoundsMs(clip: ExternalGtClip): {
  fromMs: number;
  toMs: number;
} {
  const sessionStartMs = parseMs(SESSION_START)!;
  const sessionStopMs = parseMs(SESSION_STOP)!;
  const durationMs = (clip.videoDurationSeconds ?? 0) * 1000;
  return {
    fromMs: sessionStartMs,
    toMs: sessionStopMs - durationMs,
  };
}

export function searchAbsoluteClipStarts(params: {
  eligibleObservations: ExternalGtObservation[];
  speedSeries: SpeedSeriesPoint[];
  fromMs: number;
  toMs: number;
  maxGapSeconds: number;
  stepSeconds: number;
}): GlobalSearchCandidate[] {
  const candidates: GlobalSearchCandidate[] = [];
  const stepMs = params.stepSeconds * 1000;
  for (let startMs = params.fromMs; startMs <= params.toMs + 1e-6; startMs += stepMs) {
    const score = scoreSpeedAtAbsoluteClipStart({
      eligibleObservations: params.eligibleObservations,
      speedSeries: params.speedSeries,
      alignedClipStartMs: startMs,
      maxGapSeconds: params.maxGapSeconds,
    });
    if (!Number.isFinite(score.mae)) continue;
    candidates.push({
      ...score,
      alignedClipStartMs: startMs,
      alignedClipStartUtc: toIso(startMs),
    });
  }
  candidates.sort((a, b) =>
    compareCandidateQuality(
      { mae: a.mae, coverage: a.matchCoverageRatio },
      { mae: b.mae, coverage: b.matchCoverageRatio },
    ),
  );
  return candidates;
}

export type DistinctBasinResult = {
  rank: number;
  alignedClipStartUtc: string;
  alignedClipStartMs: number;
  matchedGtCount: number;
  alignmentEligibleGtCount: number;
  coverageRatio: number;
  MAE: number;
  RMSE: number;
  maxAbsError: number;
  basinStartUtc: string;
  basinEndUtc: string;
  basinWidthSeconds: number;
  offsetUncertaintySeconds: number;
  distinctFromNextBasinSeconds: number | null;
  status: AlignmentStatus;
};

export function rankGlobalCandidatesByQuality(
  candidates: GlobalSearchCandidate[],
): GlobalSearchCandidate[] {
  return [...candidates].sort((a, b) =>
    compareCandidateQuality(
      { mae: a.mae, coverage: a.matchCoverageRatio },
      { mae: b.mae, coverage: b.matchCoverageRatio },
    ),
  );
}

export function selectDistinctTemporalBasinSeeds(
  candidates: GlobalSearchCandidate[],
  topN: number,
  minSeparationSeconds: number = 5.0,
): GlobalSearchCandidate[] {
  const ranked = rankGlobalCandidatesByQuality(candidates);
  const picked: GlobalSearchCandidate[] = [];
  for (const c of ranked) {
    if (picked.length >= topN) break;
    const cStartSec = c.alignedClipStartMs / 1000;
    const tooClose = picked.some(
      (p) => Math.abs(p.alignedClipStartMs / 1000 - cStartSec) < minSeparationSeconds,
    );
    if (!tooClose) picked.push(c);
  }
  return picked;
}

export function expandBasinMembers(
  seed: GlobalSearchCandidate,
  candidates: GlobalSearchCandidate[],
): GlobalSearchCandidate[] {
  const seedSec = seed.alignedClipStartMs / 1000;
  const near = candidates.filter(
    (c) =>
      Math.abs(c.alignedClipStartMs / 1000 - seedSec) <= FINE_REFINE_RADIUS_SECONDS + 0.5 &&
      c.mae <= seed.mae + AMBIGUITY_MAE_DELTA_KMH,
  );
  if (near.length === 0) return [seed];
  near.sort((a, b) => a.alignedClipStartMs - b.alignedClipStartMs);
  const basins = identifyNearOptimalBasins(
    near.map((c) => ({ ...c, residualSeconds: c.alignedClipStartMs / 1000 })),
    AMBIGUITY_MAE_DELTA_KMH,
  );
  const seedBasin = basins.find(
    (b) =>
      seedSec >= b.startSeconds - 1e-9 && seedSec <= b.endSeconds + 1e-9,
  );
  if (!seedBasin) return [seed];
  return near.filter(
    (c) => {
      const s = c.alignedClipStartMs / 1000;
      return s >= seedBasin.startSeconds - 1e-9 && s <= seedBasin.endSeconds + 1e-9;
    },
  );
}

export function extractTopDistinctBasins(
  candidates: GlobalSearchCandidate[],
  eligibleCount: number,
  topN: number = TOP_DISTINCT_BASINS,
): DistinctBasinResult[] {
  if (candidates.length === 0) return [];

  const seeds = selectDistinctTemporalBasinSeeds(candidates, topN);
  const results: DistinctBasinResult[] = [];

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]!;
    const members = expandBasinMembers(seed, candidates);
    const best = members.reduce((a, b) =>
      compareCandidateQuality(
        { mae: a.mae, coverage: a.matchCoverageRatio },
        { mae: b.mae, coverage: b.matchCoverageRatio },
      ) <= 0
        ? a
        : b,
    );
    const startMs = Math.min(...members.map((m) => m.alignedClipStartMs));
    const endMs = Math.max(...members.map((m) => m.alignedClipStartMs));
    const nextSeed = seeds[i + 1];
    results.push({
      rank: i + 1,
      alignedClipStartUtc: best.alignedClipStartUtc,
      alignedClipStartMs: best.alignedClipStartMs,
      matchedGtCount: best.matched,
      alignmentEligibleGtCount: eligibleCount,
      coverageRatio: best.matchCoverageRatio,
      MAE: best.mae,
      RMSE: best.rmse,
      maxAbsError: best.maxAbsError,
      basinStartUtc: toIso(startMs),
      basinEndUtc: toIso(endMs),
      basinWidthSeconds: (endMs - startMs) / 1000,
      offsetUncertaintySeconds: (endMs - startMs) / 1000,
      distinctFromNextBasinSeconds: nextSeed
        ? Math.abs(best.alignedClipStartMs / 1000 - nextSeed.alignedClipStartMs / 1000)
        : null,
      status: classifyGlobalCandidateStatus(best),
    });
  }
  return results;
}

export function coarseToFineGlobalSearch(params: {
  clip: ExternalGtClip;
  speedSeries: SpeedSeriesPoint[];
  eligibleObservations: ExternalGtObservation[];
  surface: AcquisitionSurface;
}): {
  coarseCandidateCount: number;
  fineCandidateCount: number;
  allCandidates: GlobalSearchCandidate[];
  topBasins: DistinctBasinResult[];
  globalStatus: AlignmentStatus;
  distinctCompetingBasins: number;
} {
  const maxGap = SURFACE_INTERPOLATION_GAP_SECONDS[params.surface];
  const bounds = sessionSearchBoundsMs(params.clip);

  if (params.eligibleObservations.length < MIN_ALIGNMENT_ELIGIBLE_GT_POINTS) {
    return {
      coarseCandidateCount: 0,
      fineCandidateCount: 0,
      allCandidates: [],
      topBasins: [],
      globalStatus: 'INSUFFICIENT_GROUND_TRUTH',
      distinctCompetingBasins: 0,
    };
  }

  const coarse = searchAbsoluteClipStarts({
    eligibleObservations: params.eligibleObservations,
    speedSeries: params.speedSeries,
    fromMs: bounds.fromMs,
    toMs: bounds.toMs,
    maxGapSeconds: maxGap,
    stepSeconds: COARSE_STEP_SECONDS,
  });

  const refineSeeds = selectDistinctTemporalBasinSeeds(coarse, TOP_DISTINCT_BASINS);

  const fineMap = new Map<number, GlobalSearchCandidate>();
  for (const c of coarse) {
    fineMap.set(c.alignedClipStartMs, c);
  }

  for (const seed of refineSeeds) {
    const centerMs = seed.alignedClipStartMs;
    const fromMs = Math.max(bounds.fromMs, centerMs - FINE_REFINE_RADIUS_SECONDS * 1000);
    const toMs = Math.min(bounds.toMs, centerMs + FINE_REFINE_RADIUS_SECONDS * 1000);
    const fine = searchAbsoluteClipStarts({
      eligibleObservations: params.eligibleObservations,
      speedSeries: params.speedSeries,
      fromMs,
      toMs,
      maxGapSeconds: maxGap,
      stepSeconds: FINE_STEP_SECONDS,
    });
    for (const c of fine) fineMap.set(c.alignedClipStartMs, c);
  }

  const allCandidates = [...fineMap.values()].sort((a, b) =>
    compareCandidateQuality(
      { mae: a.mae, coverage: a.matchCoverageRatio },
      { mae: b.mae, coverage: b.matchCoverageRatio },
    ),
  );

  const topBasins = extractTopDistinctBasins(
    allCandidates,
    params.eligibleObservations.length,
    TOP_DISTINCT_BASINS,
  );

  let globalStatus: AlignmentStatus = 'NOT_IDENTIFIABLE';
  if (topBasins.length === 0) {
    globalStatus = allCandidates.length === 0 ? 'INSUFFICIENT_CADENCE' : 'NOT_IDENTIFIABLE';
  } else {
    const strong = topBasins.filter((b) => b.status === 'STRONG_CANDIDATE');
    const ambiguousStrong = topBasins.filter(
      (b) =>
        b.status === 'STRONG_CANDIDATE' &&
        Math.abs(b.MAE - (topBasins[0]?.MAE ?? Infinity)) <= AMBIGUITY_MAE_DELTA_KMH,
    );
    if (strong.length >= 2 && ambiguousStrong.length >= 2) {
      globalStatus = 'AMBIGUOUS';
    } else if (topBasins[0]!.status === 'STRONG_CANDIDATE') {
      globalStatus = 'STRONG_CANDIDATE';
    } else {
      globalStatus = topBasins[0]!.status;
    }
  }

  const distinctCompetingBasins = selectDistinctTemporalBasinSeeds(
    allCandidates,
    TOP_DISTINCT_BASINS,
  ).length;

  return {
    coarseCandidateCount: coarse.length,
    fineCandidateCount: allCandidates.length,
    allCandidates,
    topBasins,
    globalStatus,
    distinctCompetingBasins,
  };
}

export function buildSpeedSeriesIngress(rows: VideoGtExportedRow[]): SpeedSeriesPoint[] {
  return rows
    .map((r) => {
      const value = typeof r.rawValueJson === 'number' ? r.rawValueJson : Number(r.rawValueJson);
      const utcMs = parseMs(r.synqReceivedAt);
      if (!Number.isFinite(value) || utcMs == null) return null;
      return { utcMs, value, row: r };
    })
    .filter((v): v is SpeedSeriesPoint => v != null)
    .sort((a, b) => a.utcMs - b.utcMs);
}

export function computeClockBoundaryPhase(params: {
  clip: ExternalGtClip;
  alignedClipStartMs: number;
}): {
  alignedBoundaryUtc: string;
  nominalDisplayedBoundaryUtc: string;
  CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: number;
  VIDEO_CLOCK_BOUNDARY_RESIDUAL_SECONDS: number;
} | null {
  const transition = getObservedMinuteTransition(params.clip);
  if (!transition) return null;
  const interpretedMs = parseCestLocalMinuteToUtcMs(transition.toMinute);
  if (interpretedMs == null) return null;
  const alignedBoundaryMs = absoluteEventMsFromAlignedClipStart(
    params.alignedClipStartMs,
    transition.videoTimeSeconds,
  );
  const residualSeconds = (alignedBoundaryMs - interpretedMs) / 1000;
  return {
    alignedBoundaryUtc: toIso(alignedBoundaryMs),
    nominalDisplayedBoundaryUtc: toIso(interpretedMs),
    CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: normalizePhaseSecondsMod60(residualSeconds),
    VIDEO_CLOCK_BOUNDARY_RESIDUAL_SECONDS: residualSeconds,
  };
}

export type ClipDiscoveryResult = {
  clipId: string;
  fileName: string;
  discoveryMode: typeof DISCOVERY_MODE;
  hardClockPriorIgnored: 'YES';
  alignmentEligibleGtCount: number;
  HF_HISTORICAL: {
    globalStatus: AlignmentStatus;
    bestStart: string | null;
    bestCoverage: number | null;
    bestMae: number | null;
    bestRmse: number | null;
    bestMaxError: number | null;
    bestBasinWidth: number | null;
    distinctCompetingBasins: number;
    topBasins: DistinctBasinResult[];
  };
  LATEST_LIVE: {
    globalStatus: AlignmentStatus;
    bestStart: string | null;
    bestCoverage: number | null;
    bestMae: number | null;
    topBasins: DistinctBasinResult[];
  };
  LATEST_SLOW: { globalStatus: 'NOT_OBSERVED' };
};

export function discoverClipGlobally(params: {
  clip: ExternalGtClip;
  telemetryRows: VideoGtExportedRow[];
}): ClipDiscoveryResult {
  const eligible = params.clip.observations.filter(isAlignmentEligibleGroundTruth);
  const result: ClipDiscoveryResult = {
    clipId: params.clip.clipId,
    fileName: params.clip.fileName,
    discoveryMode: DISCOVERY_MODE,
    hardClockPriorIgnored: 'YES',
    alignmentEligibleGtCount: eligible.length,
    HF_HISTORICAL: {
      globalStatus: 'INSUFFICIENT_GROUND_TRUTH',
      bestStart: null,
      bestCoverage: null,
      bestMae: null,
      bestRmse: null,
      bestMaxError: null,
      bestBasinWidth: null,
      distinctCompetingBasins: 0,
      topBasins: [],
    },
    LATEST_LIVE: {
      globalStatus: 'INSUFFICIENT_GROUND_TRUTH',
      bestStart: null,
      bestCoverage: null,
      bestMae: null,
      topBasins: [],
    },
    LATEST_SLOW: { globalStatus: 'NOT_OBSERVED' },
  };

  for (const surface of ['HF_HISTORICAL', 'LATEST_LIVE'] as const) {
    const rows = filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', surface);
    if (rows.length === 0) continue;
    const series = buildSpeedSeries(rows);

    const search = coarseToFineGlobalSearch({
      clip: params.clip,
      speedSeries: series,
      eligibleObservations: eligible,
      surface,
    });
    const best = search.topBasins[0];
    const entry = {
      globalStatus: search.globalStatus,
      bestStart: best?.alignedClipStartUtc ?? null,
      bestCoverage: best?.coverageRatio ?? null,
      bestMae: best?.MAE ?? null,
      bestRmse: best?.RMSE ?? null,
      bestMaxError: best?.maxAbsError ?? null,
      bestBasinWidth: best?.basinWidthSeconds ?? null,
      distinctCompetingBasins: search.distinctCompetingBasins,
      topBasins: search.topBasins,
    };
    if (surface === 'HF_HISTORICAL') {
      result.HF_HISTORICAL = entry;
    } else {
      result.LATEST_LIVE = {
        globalStatus: entry.globalStatus,
        bestStart: entry.bestStart,
        bestCoverage: entry.bestCoverage,
        bestMae: entry.bestMae,
        topBasins: entry.topBasins,
      };
    }
  }

  return result;
}

export type ChronologyPathEntry = {
  clipId: string;
  fileName: string;
  selectedBasinRank: number;
  alignedClipStartUtc: string;
  clipEndUtc: string;
  MAE: number;
  coverageRatio: number;
  status: AlignmentStatus;
};

export function buildChronologyConsistentPath(
  discoveries: ClipDiscoveryResult[],
  clips: ExternalGtClip[],
  surface: 'HF_HISTORICAL' | 'LATEST_LIVE' = 'HF_HISTORICAL',
): {
  CHRONOLOGY_PATH_FOUND: 'YES' | 'NO';
  CHRONOLOGY_PATH_STATUS: string;
  CHRONOLOGY_PATH_TOTAL_SCORE: number | null;
  CHRONOLOGY_PATH_MIN_CLIP_CONFIDENCE: AlignmentStatus | null;
  path: ChronologyPathEntry[];
  note: string;
} {
  const ordered = CLIP_CHRONOLOGY_ORDER.map((id) =>
    discoveries.find((d) => d.clipId === id),
  ).filter((d): d is ClipDiscoveryResult => d != null);

  type Choice = { clip: ClipDiscoveryResult; basin: DistinctBasinResult; endMs: number };
  let paths: Choice[][] = [[]];

  for (const clip of ordered) {
    const surfaceResult = surface === 'HF_HISTORICAL' ? clip.HF_HISTORICAL : clip.LATEST_LIVE;
    const basins = surfaceResult.topBasins.filter(
      (b) => b.status === 'STRONG_CANDIDATE' || b.coverageRatio >= 0.5,
    );
    if (basins.length === 0) {
      return {
        CHRONOLOGY_PATH_FOUND: 'NO',
        CHRONOLOGY_PATH_STATUS: 'NO_CREDIBLE_BASIN_FOR_CLIP',
        CHRONOLOGY_PATH_TOTAL_SCORE: null,
        CHRONOLOGY_PATH_MIN_CLIP_CONFIDENCE: null,
        path: [],
        note: `Cannot fabricate chronology path — no credible basin for ${clip.fileName}`,
      };
    }
    const clipMeta = clips.find((c) => c.clipId === clip.clipId);
    const clipDurationMs = (clipMeta?.videoDurationSeconds ?? 60) * 1000;
    const nextPaths: Choice[][] = [];
    for (const path of paths) {
      const prevEnd = path.length > 0 ? path[path.length - 1]!.endMs : 0;
      for (const basin of basins) {
        if (path.length > 0 && basin.alignedClipStartMs < prevEnd - 1000) continue;
        const endMs = basin.alignedClipStartMs + clipDurationMs;
        nextPaths.push([...path, { clip, basin, endMs }]);
      }
    }
    if (nextPaths.length === 0) {
      return {
        CHRONOLOGY_PATH_FOUND: 'NO',
        CHRONOLOGY_PATH_STATUS: 'CHRONOLOGY_CONSTRAINT_UNSATISFIABLE',
        CHRONOLOGY_PATH_TOTAL_SCORE: null,
        CHRONOLOGY_PATH_MIN_CLIP_CONFIDENCE: null,
        path: [],
        note: 'No non-overlapping chronology-consistent path exists without fabricating basins',
      };
    }
    paths = nextPaths.sort((a, b) => {
      const scoreA = a.reduce((s, c) => s + c.basin.MAE, 0);
      const scoreB = b.reduce((s, c) => s + c.basin.MAE, 0);
      return scoreA - scoreB;
    }).slice(0, 50);
  }

  const best = paths[0]!;
  const pathEntries: ChronologyPathEntry[] = best.map(({ clip, basin, endMs }) => ({
    clipId: clip.clipId,
    fileName: clip.fileName,
    selectedBasinRank: basin.rank,
    alignedClipStartUtc: basin.alignedClipStartUtc,
    clipEndUtc: toIso(endMs),
    MAE: basin.MAE,
    coverageRatio: basin.coverageRatio,
    status: basin.status,
  }));

  const totalScore = pathEntries.reduce((s, e) => s + e.MAE, 0);
  const minConfidence = pathEntries.reduce<AlignmentStatus | null>((min, e) => {
    if (!min) return e.status;
    const rank = (s: AlignmentStatus) =>
      ['STRONG_CANDIDATE', 'AMBIGUOUS', 'NOT_IDENTIFIABLE', 'INSUFFICIENT_CADENCE'].indexOf(s);
    return rank(e.status) > rank(min) ? e.status : min;
  }, null);

  return {
    CHRONOLOGY_PATH_FOUND: 'YES',
    CHRONOLOGY_PATH_STATUS: 'CHRONOLOGY_CONSISTENT_PATH_SELECTED',
    CHRONOLOGY_PATH_TOTAL_SCORE: totalScore,
    CHRONOLOGY_PATH_MIN_CLIP_CONFIDENCE: minConfidence,
    path: pathEntries,
    note: 'Chronology path selected from independent basin results — does not alter basin scores',
  };
}

export function buildClockPhaseModel(
  discoveries: ClipDiscoveryResult[],
  clips: ExternalGtClip[],
): Record<string, unknown> {
  const phases: Array<{
    clipId: string;
    fileName: string;
    phaseSecondsMod60: number;
    residualSeconds: number;
    status: AlignmentStatus;
  }> = [];

  for (const disc of discoveries) {
    if (!TRANSITION_CLIP_IDS.has(disc.clipId)) continue;
    const clip = clips.find((c) => c.clipId === disc.clipId);
    if (!clip || !hasObservedMinuteTransition(clip)) continue;
    const best = disc.HF_HISTORICAL.topBasins[0];
    if (!best) continue;
    const phase = computeClockBoundaryPhase({
      clip,
      alignedClipStartMs: best.alignedClipStartMs,
    });
    if (!phase) continue;
    phases.push({
      clipId: disc.clipId,
      fileName: disc.fileName,
      phaseSecondsMod60: phase.CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60,
      residualSeconds: phase.VIDEO_CLOCK_BOUNDARY_RESIDUAL_SECONDS,
      status: best.status,
    });
  }

  if (phases.length < 2) {
    return {
      evidenceLayer: 'METHOD_DIAGNOSTIC',
      modelName: 'VEHICLE_CLOCK_BOUNDARY_PHASE_UNDER_CEST_HYPOTHESIS',
      CLOCK_PHASE_MODEL_STATUS: 'UNRESOLVED',
      eligibleClipCount: phases.length,
      phases,
      note: 'Insufficient transition clips with discovery candidates for phase clustering',
    };
  }

  const phaseValues = phases.map((p) => p.phaseSecondsMod60);
  const center = normalizePhaseSecondsMod60(
    phaseValues.reduce((s, v) => s + v, 0) / phaseValues.length,
  );
  const spreads = phaseValues.map((v) => circularDistanceMod60(v, center));
  const maxSpread = Math.max(...spreads);
  const spread = spreads.reduce((a, b) => a + b, 0) / spreads.length;

  let status: string;
  if (maxSpread <= 3) status = 'PHASE_CLUSTER_SUPPORTED';
  else if (maxSpread <= 8) status = 'PHASE_CLUSTER_WEAK';
  else status = 'PHASE_CLUSTER_REJECTED';

  let phaseInformedWindow: Record<string, unknown> | null = null;
  if (status === 'PHASE_CLUSTER_SUPPORTED' || status === 'PHASE_CLUSTER_WEAK') {
    phaseInformedWindow = {
      PHASE_INFORMED_CLOCK_WINDOW: 'SOFT_DIAGNOSTIC_ONLY',
      centerSecondsMod60: center,
      toleranceSeconds: maxSpread,
      note: 'Phase-informed window is soft evidence — cannot delete stronger global basins',
    };
  }

  return {
    evidenceLayer: 'METHOD_DIAGNOSTIC',
    modelName: 'VEHICLE_CLOCK_BOUNDARY_PHASE_UNDER_CEST_HYPOTHESIS',
    CLOCK_PHASE_MODEL_STATUS: status,
    CLOCK_PHASE_CENTER_SECONDS_MOD_60: center,
    CLOCK_PHASE_SPREAD_SECONDS: spread,
    CLOCK_PHASE_MAX_CIRCULAR_RESIDUAL_SECONDS: maxSpread,
    eligibleClipCount: phases.length,
    phases,
    phaseInformedWindow,
    CROSS_CLIP_MODEL_USES_CANDIDATE_START_RESIDUAL_AS_CLOCK_OFFSET: 'NO',
    note: 'Phase uses modulo-60 circular distance — not validated UTC clock offset',
  };
}

export function evaluateFirstRunPhasePattern(
  phases: Array<{ phaseSecondsMod60: number }>,
): 'SUPPORTED' | 'WEAKLY_SUPPORTED' | 'REJECTED' | 'CANNOT_TEST' {
  if (phases.length < 2) return 'CANNOT_TEST';
  const inRange = phases.filter(
    (p) =>
      p.phaseSecondsMod60 >= FIRST_RUN_PHASE_PATTERN_MIN &&
      p.phaseSecondsMod60 <= FIRST_RUN_PHASE_PATTERN_MAX,
  );
  const ratio = inRange.length / phases.length;
  if (ratio >= 0.8) return 'SUPPORTED';
  if (ratio >= 0.5) return 'WEAKLY_SUPPORTED';
  return 'REJECTED';
}

export function buildProviderVsIngressDiagnostics(
  discoveries: ClipDiscoveryResult[],
  clips: ExternalGtClip[],
  telemetryRows: VideoGtExportedRow[],
): Record<string, unknown> {
  const perClip: Record<string, unknown>[] = [];

  for (const disc of discoveries) {
    const clip = clips.find((c) => c.clipId === disc.clipId);
    if (!clip) continue;
    const eligible = clip.observations.filter(isAlignmentEligibleGroundTruth);
    const hfBest = disc.HF_HISTORICAL.topBasins[0];
    if (!hfBest) continue;

    const hfRows = filterTelemetryByFieldAndSurface(telemetryRows, 'speed', 'HF_HISTORICAL');
    const providerSeries = buildSpeedSeries(hfRows);

    const ingressSeries = buildSpeedSeriesIngress(hfRows);
    const maxGap = SURFACE_INTERPOLATION_GAP_SECONDS.HF_HISTORICAL;

    const providerScore = scoreSpeedAtAbsoluteClipStart({
      eligibleObservations: eligible,
      speedSeries: providerSeries,
      alignedClipStartMs: hfBest.alignedClipStartMs,
      maxGapSeconds: maxGap,
    });
    const ingressScore = scoreSpeedAtAbsoluteClipStart({
      eligibleObservations: eligible,
      speedSeries: ingressSeries,
      alignedClipStartMs: hfBest.alignedClipStartMs,
      maxGapSeconds: maxGap,
    });

    const ages: number[] = [];
    for (const obs of eligible) {
      const absMs = absoluteEventMsFromAlignedClipStart(
        hfBest.alignedClipStartMs,
        obs.videoTimeSeconds!,
      );
      const pt = deriveTelemetryAtUtc(providerSeries, absMs, maxGap);
      if (pt.status === 'MATCHED' && pt.beforeSource) {
        const row = providerSeries.find(
          (s) => s.row.acquisitionOrdinal === pt.beforeSource!.acquisitionOrdinal,
        )?.row;
        if (row) {
          const age = computeProviderDeliveryMetrics(row).providerSampleAgeSeconds;
          if (age != null) ages.push(age);
        }
      }
    }

    perClip.push({
      clipId: disc.clipId,
      fileName: disc.fileName,
      PHYSICAL_CANDIDATE_TIMELINE: 'providerTimestamp',
      DELIVERY_TIMELINE: 'synqReceivedAt',
      PROVIDER_TIME_MAE: providerScore.mae,
      INGRESS_TIME_MAE: ingressScore.mae,
      PROVIDER_TIME_ALIGNED_START: hfBest.alignedClipStartUtc,
      INGRESS_TIME_DIAGNOSTIC_ALIGNMENT: {
        label: 'INGRESS_TIME_DIAGNOSTIC_ALIGNMENT',
        INGRESS_TIME_MAE: ingressScore.mae,
        note: 'Not physical alignment — diagnostic only',
      },
      providerSampleAgeSeconds: {
        median: ages.length ? ages.sort((a, b) => a - b)[Math.floor(ages.length / 2)]! : null,
        p90: ages.length ? ages.sort((a, b) => a - b)[Math.floor(ages.length * 0.9)]! : null,
        min: ages.length ? Math.min(...ages) : null,
        max: ages.length ? Math.max(...ages) : null,
      },
    });
  }

  return {
    evidenceLayer: 'METHOD_DIAGNOSTIC',
    perClip,
    note: 'providerTimestamp and synqReceivedAt remain separate timelines',
  };
}

export function analyzeImg2810Diagnostic(disc: ClipDiscoveryResult): Record<string, unknown> {
  const basins = disc.HF_HISTORICAL.topBasins;
  const diagnosticBasin = basins.find(
    (b) =>
      b.alignedClipStartMs >= IMG_2810_DIAGNOSTIC_WINDOW_FROM_MS &&
      b.alignedClipStartMs <= IMG_2810_DIAGNOSTIC_WINDOW_TO_MS,
  );
  const nearTarget = basins.find(
    (b) => Math.abs(b.alignedClipStartMs - IMG_2810_DIAGNOSTIC_START_MS) <= 2000,
  );
  const best = basins[0];
  return {
    IMG_2810_DIAGNOSTIC_BASIN_NEAR_19_23_59_FOUND: nearTarget ? 'YES' : 'NO',
    IMG_2810_DIAGNOSTIC_BASIN_RANK: nearTarget?.rank ?? null,
    IMG_2810_GLOBAL_BEST_START: best?.alignedClipStartUtc ?? null,
    IMG_2810_GLOBAL_BEST_COVERAGE: best?.coverageRatio ?? null,
    IMG_2810_GLOBAL_BEST_MAE: best?.MAE ?? null,
    IMG_2810_GLOBAL_BEST_RMSE: best?.RMSE ?? null,
    IMG_2810_GLOBAL_BEST_MAX_ERROR: best?.maxAbsError ?? null,
    diagnosticWindowBasinFound: diagnosticBasin ? 'YES' : 'NO',
    note: 'Diagnostic expectation from post-run forensics — not authoritative truth',
  };
}

export function deriveClockPriorConclusion(
  discoveries: ClipDiscoveryResult[],
  hardPriorHadStrong: boolean,
): 'CLOCK_PRIOR_FALSIFIED' | 'CLOCK_PRIOR_SUPPORTED' | 'CLOCK_PRIOR_INCONCLUSIVE' {
  const hfStrong = discoveries.filter((d) => d.HF_HISTORICAL.globalStatus === 'STRONG_CANDIDATE');
  if (!hardPriorHadStrong && hfStrong.length >= 3) return 'CLOCK_PRIOR_FALSIFIED';
  if (hardPriorHadStrong && hfStrong.length === 0) return 'CLOCK_PRIOR_SUPPORTED';
  if (hfStrong.length > 0 && !hardPriorHadStrong) return 'CLOCK_PRIOR_FALSIFIED';
  return 'CLOCK_PRIOR_INCONCLUSIVE';
}

export function deriveHfSpeedAlignmentConclusion(
  discoveries: ClipDiscoveryResult[],
): string {
  const strong = discoveries.filter((d) => d.HF_HISTORICAL.globalStatus === 'STRONG_CANDIDATE').length;
  const ambiguous = discoveries.filter((d) => d.HF_HISTORICAL.globalStatus === 'AMBIGUOUS').length;
  if (strong >= 5) return 'HF_SPEED_ALIGNMENT_SUPPORTED';
  if (strong + ambiguous >= 3) return 'HF_SPEED_ALIGNMENT_AMBIGUOUS';
  return 'HF_SPEED_ALIGNMENT_NOT_IDENTIFIABLE';
}

export function runGlobalFingerprintDiscovery(params: {
  telemetryRows: VideoGtExportedRow[];
  externalGt: ExternalGtDocument;
}): {
  perClipDiscoveries: ClipDiscoveryResult[];
  perClipTopBasins: Record<string, unknown>;
  chronologyPath: ReturnType<typeof buildChronologyConsistentPath>;
  clockPhaseModel: Record<string, unknown>;
  providerVsIngress: Record<string, unknown>;
  discoverySummary: Record<string, unknown>;
  img2810Diagnostic: Record<string, unknown>;
} {
  const perClipDiscoveries = params.externalGt.clips.map((clip) =>
    discoverClipGlobally({ clip, telemetryRows: params.telemetryRows }),
  );

  const perClipTopBasins = Object.fromEntries(
    perClipDiscoveries.map((d) => [
      d.clipId,
      {
        clipId: d.clipId,
        fileName: d.fileName,
        HF_HISTORICAL: d.HF_HISTORICAL.topBasins,
        LATEST_LIVE: d.LATEST_LIVE.topBasins,
      },
    ]),
  );

  const chronologyPath = buildChronologyConsistentPath(
    perClipDiscoveries,
    params.externalGt.clips,
    'HF_HISTORICAL',
  );
  const clockPhaseModel = buildClockPhaseModel(perClipDiscoveries, params.externalGt.clips);
  const providerVsIngress = buildProviderVsIngressDiagnostics(
    perClipDiscoveries,
    params.externalGt.clips,
    params.telemetryRows,
  );

  const img2810 = perClipDiscoveries.find((d) => d.clipId === 'RD003_GT_CLIP_008');
  const img2810Diagnostic = img2810 ? analyzeImg2810Diagnostic(img2810) : {};

  const phaseList = (clockPhaseModel.phases as Array<{ phaseSecondsMod60: number }>) ?? [];
  const firstRunPattern = evaluateFirstRunPhasePattern(phaseList);

  const transitionWithCandidate = perClipDiscoveries.filter(
    (d) => TRANSITION_CLIP_IDS.has(d.clipId) && d.HF_HISTORICAL.topBasins.length > 0,
  ).length;

  const hfStrongClips = perClipDiscoveries.filter(
    (d) => d.HF_HISTORICAL.globalStatus === 'STRONG_CANDIDATE',
  ).length;

  const discoverySummary: Record<string, unknown> = {
    evidenceId: DISCOVERY_EVIDENCE_ID,
    discoveryMode: DISCOVERY_MODE,
    methodology: 'GLOBAL_FINGERPRINT_DISCOVERY',
    FULL_SESSION_SEARCH_USED: 'YES',
    sessionStart: SESSION_START,
    sessionStop: SESSION_STOP,
    coarseStepSeconds: COARSE_STEP_SECONDS,
    fineStepSeconds: FINE_STEP_SECONDS,
    fineRefineRadiusSeconds: FINE_REFINE_RADIUS_SECONDS,
    GLOBAL_FINGERPRINT_DISCOVERY_EXECUTED: 'YES',
    HARD_CLOCK_PRIOR_IGNORED: 'YES',
    GROUND_TRUTH_VALIDATED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    DRIVING_SCORE_CHANGED: 'NO',
    TRANSITION_CLIPS_WITH_DISCOVERY_CANDIDATE: transitionWithCandidate,
    CLOCK_PHASE_MODEL_STATUS: clockPhaseModel.CLOCK_PHASE_MODEL_STATUS,
    CLOCK_PHASE_CENTER_SECONDS_MOD_60: clockPhaseModel.CLOCK_PHASE_CENTER_SECONDS_MOD_60 ?? null,
    CLOCK_PHASE_SPREAD_SECONDS: clockPhaseModel.CLOCK_PHASE_SPREAD_SECONDS ?? null,
    FIRST_RUN_19_TO_32_SECOND_PHASE_PATTERN: firstRunPattern,
    CHRONOLOGY_PATH_FOUND: chronologyPath.CHRONOLOGY_PATH_FOUND,
    CHRONOLOGY_PATH_STATUS: chronologyPath.CHRONOLOGY_PATH_STATUS,
    HF_STRONG_CANDIDATE_CLIP_COUNT: hfStrongClips,
    CLOCK_PRIOR_CONCLUSION: deriveClockPriorConclusion(perClipDiscoveries, false),
    HF_SPEED_ALIGNMENT_CONCLUSION: deriveHfSpeedAlignmentConclusion(perClipDiscoveries),
    PROVIDER_TIME_ALIGNMENT_SUPPORTED_CLIPS: perClipDiscoveries.filter(
      (d) => d.HF_HISTORICAL.globalStatus === 'STRONG_CANDIDATE',
    ).length,
    INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS: perClipDiscoveries.filter(
      (d) => (d.HF_HISTORICAL.topBasins[0]?.MAE ?? Infinity) < 20,
    ).length,
    ...img2810Diagnostic,
  };

  return {
    perClipDiscoveries,
    perClipTopBasins,
    chronologyPath,
    clockPhaseModel,
    providerVsIngress,
    discoverySummary,
    img2810Diagnostic,
  };
}

export function discoveryOutputSha256(outputs: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(stableStringify(outputs)).digest('hex');
}

export function artifactSha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}
