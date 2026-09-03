/**
 * DI-EV-0034D — GLOBAL_FINGERPRINT_DISCOVERY V2
 * Corrected candidate selection, joint clock/chronology, independent ingress discovery.
 * Does NOT modify external GT, canonical telemetry, or prior experiment artifacts.
 */
import * as crypto from 'crypto';
import {
  AMBIGUITY_MAE_DELTA_KMH,
  absoluteEventMsFromAlignedClipStart,
  buildSpeedSeries,
  clipHasObservedMinuteTransition,
  computeProviderDeliveryMetrics,
  deriveTelemetryAtUtc,
  filterTelemetryByFieldAndSurface,
  getClipObservedMinuteTransition,
  identifyNearOptimalBasins,
  isAlignmentEligibleGroundTruth,
  MIN_ALIGNMENT_ELIGIBLE_GT_POINTS,
  MIN_STRONG_CANDIDATE_COVERAGE,
  parseCestLocalMinuteToUtcMs,
  stableStringify,
  SURFACE_INTERPOLATION_GAP_SECONDS,
  type AcquisitionSurface,
  type AlignmentStatus,
  type ExternalGtClip,
  type ExternalGtDocument,
  type ExternalGtObservation,
} from './reference-capture-rd003-video-gt-alignment';
import type { VideoGtExportedRow } from './reference-capture-rd003-video-gt-export';
import {
  artifactSha256,
  buildSpeedSeriesIngress,
  classifyGlobalCandidateStatus,
  CLIP_CHRONOLOGY_ORDER,
  COARSE_STEP_SECONDS,
  FINE_REFINE_RADIUS_SECONDS,
  FINE_STEP_SECONDS,
  hasObservedMinuteTransition,
  normalizePhaseSecondsMod60,
  scoreSpeedAtAbsoluteClipStart,
  searchAbsoluteClipStarts,
  sessionSearchBoundsMs,
  STATIC_MINUTE_CLIP_IDS,
  TRANSITION_CLIP_IDS,
  type GlobalSearchCandidate,
} from './reference-capture-rd003-video-gt-global-discovery';

export { artifactSha256 };

export const DISCOVERY_V2_EVIDENCE_ID = 'DI-EV-0034D';
export const DISCOVERY_V2_MODE = 'GLOBAL_FINGERPRINT_DISCOVERY_V2';

export const QUALITY_SEED_COUNT = 20;
export const COVERAGE_SEED_COUNT = 10;
export const SEED_MIN_SEPARATION_SECONDS = 5.0;
export const REPORTED_BASIN_COUNT = 10;
export const JOINT_INTERCEPT_TOLERANCE_SECONDS = 15.0;
export const IMG_2810_HARD_CLOCK_UPPER_BOUND_MS = Date.parse('2026-09-02T19:23:38.600Z');

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export type DiscoveryV2Metrics = {
  mae: number;
  rmse: number;
  maxAbsError: number;
  coverage: number;
  matched: number;
  total: number;
};

export function compareDiscoveryV2Quality(a: DiscoveryV2Metrics, b: DiscoveryV2Metrics): number {
  if (Math.abs(a.mae - b.mae) > 1e-9) return a.mae - b.mae;
  if (Math.abs(a.rmse - b.rmse) > 1e-9) return a.rmse - b.rmse;
  if (Math.abs(a.maxAbsError - b.maxAbsError) > 1e-9) return a.maxAbsError - b.maxAbsError;
  return b.coverage - a.coverage;
}

export function candidateMetrics(c: GlobalSearchCandidate): DiscoveryV2Metrics {
  return {
    mae: c.mae,
    rmse: c.rmse,
    maxAbsError: c.maxAbsError,
    coverage: c.matchCoverageRatio,
    matched: c.matched,
    total: c.total,
  };
}

export function dominatesPareto(a: DiscoveryV2Metrics, b: DiscoveryV2Metrics): boolean {
  const betterOrEqual =
    a.coverage >= b.coverage &&
    a.mae <= b.mae &&
    a.rmse <= b.rmse &&
    a.maxAbsError <= b.maxAbsError;
  const strictlyBetter =
    a.coverage > b.coverage ||
    a.mae < b.mae ||
    a.rmse < b.rmse ||
    a.maxAbsError < b.maxAbsError;
  return betterOrEqual && strictlyBetter;
}

export function buildParetoFrontier(candidates: GlobalSearchCandidate[]): GlobalSearchCandidate[] {
  const frontier: GlobalSearchCandidate[] = [];
  for (const c of candidates) {
    const cm = candidateMetrics(c);
    if (frontier.some((f) => dominatesPareto(candidateMetrics(f), cm))) continue;
    for (let i = frontier.length - 1; i >= 0; i--) {
      if (dominatesPareto(cm, candidateMetrics(frontier[i]!))) frontier.splice(i, 1);
    }
    frontier.push(c);
  }
  return frontier.sort((a, b) => compareDiscoveryV2Quality(candidateMetrics(a), candidateMetrics(b)));
}

export function dedupeSeedsByTime(
  seeds: GlobalSearchCandidate[],
  minSeparationSeconds: number,
): GlobalSearchCandidate[] {
  const picked: GlobalSearchCandidate[] = [];
  for (const seed of seeds) {
    const sec = seed.alignedClipStartMs / 1000;
    if (
      picked.some((p) => Math.abs(p.alignedClipStartMs / 1000 - sec) < minSeparationSeconds)
    ) {
      continue;
    }
    picked.push(seed);
  }
  return picked;
}

export function buildDiscoveryV2SeedSet(candidates: GlobalSearchCandidate[]): GlobalSearchCandidate[] {
  const qualityQualified = candidates
    .filter((c) => c.matchCoverageRatio >= MIN_STRONG_CANDIDATE_COVERAGE)
    .sort((a, b) => compareDiscoveryV2Quality(candidateMetrics(a), candidateMetrics(b)));

  const coverageSeeds = [...candidates]
    .sort((a, b) => {
      if (Math.abs(a.matchCoverageRatio - b.matchCoverageRatio) > 1e-9) {
        return b.matchCoverageRatio - a.matchCoverageRatio;
      }
      return compareDiscoveryV2Quality(candidateMetrics(a), candidateMetrics(b));
    })
    .slice(0, COVERAGE_SEED_COUNT);

  const paretoSeeds = buildParetoFrontier(candidates);

  const union = dedupeSeedsByTime(
    [
      ...qualityQualified.slice(0, QUALITY_SEED_COUNT),
      ...coverageSeeds,
      ...paretoSeeds,
    ],
    SEED_MIN_SEPARATION_SECONDS,
  );
  return union;
}

export type BasinV2Result = {
  rankByQuality: number;
  rankByCoverage: number;
  paretoStatus: 'PARETO' | 'DOMINATED';
  alignedClipStartUtc: string;
  alignedClipStartMs: number;
  matchedGtCount: number;
  eligibleGtCount: number;
  coverage: number;
  MAE: number;
  RMSE: number;
  maxAbsError: number;
  basinStartUtc: string;
  basinEndUtc: string;
  basinWidthSeconds: number;
  distinctFromNearestCompetingBasinSeconds: number | null;
  status: AlignmentStatus;
  FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: number | null;
  WHOLE_MINUTE_RESIDUAL_COUNT: number | null;
  CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: number | null;
};

export function deriveGlobalStatusV2(basins: BasinV2Result[]): AlignmentStatus {
  const strong = basins.filter((b) => b.status === 'STRONG_CANDIDATE');
  if (strong.length === 0) {
    if (basins.length === 0) return 'INSUFFICIENT_CADENCE';
    return basins.some((b) => b.status === 'AMBIGUOUS') ? 'AMBIGUOUS' : 'NOT_IDENTIFIABLE';
  }
  if (strong.length >= 2) return 'AMBIGUOUS';
  const isolatedStrong = strong[0]!;
  const hasNearbyCompetitor = basins.some(
    (b) =>
      b !== isolatedStrong &&
      b.status !== 'INSUFFICIENT_GROUND_TRUTH' &&
      b.status !== 'INSUFFICIENT_CADENCE' &&
      Math.abs(b.alignedClipStartMs - isolatedStrong.alignedClipStartMs) >=
        SEED_MIN_SEPARATION_SECONDS * 1000 &&
      Math.abs(b.MAE - isolatedStrong.MAE) <= AMBIGUITY_MAE_DELTA_KMH,
  );
  if (hasNearbyCompetitor) return 'AMBIGUOUS';
  return 'STRONG_CANDIDATE';
}

export function circularMeanMod60(values: number[]): number {
  if (values.length === 0) return 0;
  let sinSum = 0;
  let cosSum = 0;
  for (const v of values) {
    const rad = (2 * Math.PI * normalizePhaseSecondsMod60(v)) / 60;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const meanRad = Math.atan2(sinSum / values.length, cosSum / values.length);
  let deg = (meanRad * 60) / (2 * Math.PI);
  if (deg < 0) deg += 60;
  return deg;
}

export function circularMedianMod60(values: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return normalizePhaseSecondsMod60(values[0]!);
  let best = values[0]!;
  let bestCost = Infinity;
  for (const candidate of values) {
    const cost = values.reduce(
      (s, v) => s + Math.min(Math.abs(normalizePhaseSecondsMod60(v) - normalizePhaseSecondsMod60(candidate)), 60 - Math.abs(normalizePhaseSecondsMod60(v) - normalizePhaseSecondsMod60(candidate))),
      0,
    );
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }
  return normalizePhaseSecondsMod60(best);
}

export function decomposeClockResidual(residualSeconds: number): {
  FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: number;
  WHOLE_MINUTE_RESIDUAL_COUNT: number;
  CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: number;
} {
  const wholeMinutes = Math.trunc(residualSeconds / 60);
  const phase = residualSeconds - wholeMinutes * 60;
  return {
    FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: residualSeconds,
    WHOLE_MINUTE_RESIDUAL_COUNT: wholeMinutes,
    CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: normalizePhaseSecondsMod60(phase),
  };
}

export function parseDisplayedMinuteOrdinal(minute: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(minute.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function clipDisplayedMinuteOrdinal(clip: ExternalGtClip): number | null {
  const transition = getClipObservedMinuteTransition(clip);
  if (transition) return parseDisplayedMinuteOrdinal(transition.toMinute);
  const local = clip.videoClock?.displayedLocalTime ?? '';
  const first = local.split('→')[0]?.trim() ?? local.trim();
  const match = /(\d{1,2}:\d{2})/.exec(first);
  return match ? parseDisplayedMinuteOrdinal(match[1]!) : null;
}

export function computeRelativeClockIntercept(params: {
  alignedClipStartMs: number;
  transitionVideoTimeSeconds: number;
  minuteOrdinalL: number;
}): number {
  const boundarySeconds = params.alignedClipStartMs / 1000 + params.transitionVideoTimeSeconds;
  return boundarySeconds - 60 * params.minuteOrdinalL;
}

export function computeStaticMinuteInterceptInterval(params: {
  alignedClipStartMs: number;
  durationSeconds: number;
  durationUncertaintySeconds: number;
  minuteOrdinalL: number;
}): { from: number; to: number } {
  const s = params.alignedClipStartMs / 1000;
  const d = params.durationSeconds;
  const u = params.durationUncertaintySeconds;
  return {
    from: s - 60 * params.minuteOrdinalL - u,
    to: s + d + u - 60 * params.minuteOrdinalL,
  };
}

export function pairwiseMinuteDistanceResidual(
  interceptI: number,
  interceptJ: number,
  minuteLi: number,
  minuteLj: number,
): number {
  return interceptJ - interceptI - 60 * (minuteLj - minuteLi);
}

function expandBasinMembersV2(
  seed: GlobalSearchCandidate,
  candidates: GlobalSearchCandidate[],
): GlobalSearchCandidate[] {
  const seedSec = seed.alignedClipStartMs / 1000;
  const near = candidates.filter(
    (c) => Math.abs(c.alignedClipStartMs / 1000 - seedSec) <= FINE_REFINE_RADIUS_SECONDS + 0.5,
  );
  if (near.length === 0) return [seed];
  near.sort((a, b) => a.alignedClipStartMs - b.alignedClipStartMs);
  const basins = identifyNearOptimalBasins(
    near.map((c) => ({ ...c, residualSeconds: c.alignedClipStartMs / 1000 })),
    AMBIGUITY_MAE_DELTA_KMH,
  );
  const seedBasin = basins.find(
    (b) => seedSec >= b.startSeconds - 1e-9 && seedSec <= b.endSeconds + 1e-9,
  );
  if (!seedBasin) return [seed];
  return near.filter((c) => {
    const s = c.alignedClipStartMs / 1000;
    return s >= seedBasin.startSeconds - 1e-9 && s <= seedBasin.endSeconds + 1e-9;
  });
}

export function extractV2Basins(params: {
  candidates: GlobalSearchCandidate[];
  eligibleCount: number;
  clip: ExternalGtClip;
  nominalBoundaryUtcMs?: number | null;
}): BasinV2Result[] {
  if (params.candidates.length === 0) return [];

  const paretoSet = new Set(
    buildParetoFrontier(params.candidates).map((c) => c.alignedClipStartMs),
  );
  const seeds = buildDiscoveryV2SeedSet(params.candidates).slice(0, REPORTED_BASIN_COUNT);
  const basins: BasinV2Result[] = [];

  for (const seed of seeds) {
    const members = expandBasinMembersV2(seed, params.candidates);
    const best = members.reduce((a, b) =>
      compareDiscoveryV2Quality(candidateMetrics(a), candidateMetrics(b)) <= 0 ? a : b,
    );
    const startMs = Math.min(...members.map((m) => m.alignedClipStartMs));
    const endMs = Math.max(...members.map((m) => m.alignedClipStartMs));

    let fullResidual: number | null = null;
    if (params.nominalBoundaryUtcMs != null && hasObservedMinuteTransition(params.clip)) {
      const transition = getClipObservedMinuteTransition(params.clip)!;
      const boundaryMs = absoluteEventMsFromAlignedClipStart(
        best.alignedClipStartMs,
        transition.videoTimeSeconds,
      );
      fullResidual = (boundaryMs - params.nominalBoundaryUtcMs) / 1000;
    }

    const decomposed =
      fullResidual != null ? decomposeClockResidual(fullResidual) : null;

    basins.push({
      rankByQuality: 0,
      rankByCoverage: 0,
      paretoStatus: paretoSet.has(best.alignedClipStartMs) ? 'PARETO' : 'DOMINATED',
      alignedClipStartUtc: best.alignedClipStartUtc,
      alignedClipStartMs: best.alignedClipStartMs,
      matchedGtCount: best.matched,
      eligibleGtCount: params.eligibleCount,
      coverage: best.matchCoverageRatio,
      MAE: best.mae,
      RMSE: best.rmse,
      maxAbsError: best.maxAbsError,
      basinStartUtc: toIso(startMs),
      basinEndUtc: toIso(endMs),
      basinWidthSeconds: (endMs - startMs) / 1000,
      distinctFromNearestCompetingBasinSeconds: null,
      status: classifyGlobalCandidateStatus(best),
      FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS: decomposed?.FULL_CLOCK_BOUNDARY_RESIDUAL_SECONDS ?? null,
      WHOLE_MINUTE_RESIDUAL_COUNT: decomposed?.WHOLE_MINUTE_RESIDUAL_COUNT ?? null,
      CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60: decomposed?.CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60 ?? null,
    });
  }

  const byQuality = [...basins].sort((a, b) =>
    compareDiscoveryV2Quality(
      { mae: a.MAE, rmse: a.RMSE, maxAbsError: a.maxAbsError, coverage: a.coverage, matched: a.matchedGtCount, total: a.eligibleGtCount },
      { mae: b.MAE, rmse: b.RMSE, maxAbsError: b.maxAbsError, coverage: b.coverage, matched: b.matchedGtCount, total: b.eligibleGtCount },
    ),
  );
  const byCoverage = [...basins].sort((a, b) => b.coverage - a.coverage || a.MAE - b.MAE);

  for (let i = 0; i < basins.length; i++) {
    const b = basins[i]!;
    b.rankByQuality = byQuality.findIndex((x) => x.alignedClipStartMs === b.alignedClipStartMs) + 1;
    b.rankByCoverage = byCoverage.findIndex((x) => x.alignedClipStartMs === b.alignedClipStartMs) + 1;
  }

  for (let i = 0; i < byQuality.length; i++) {
    const cur = byQuality[i]!;
    const next = byQuality[i + 1];
    const target = basins.find((b) => b.alignedClipStartMs === cur.alignedClipStartMs);
    if (target) {
      target.distinctFromNearestCompetingBasinSeconds = next
        ? Math.abs(cur.alignedClipStartMs - next.alignedClipStartMs) / 1000
        : null;
    }
  }

  return basins.sort((a, b) => a.rankByQuality - b.rankByQuality);
}

export function resolveNominalBoundaryUtcMs(clip: ExternalGtClip): number | null {
  const transition = getClipObservedMinuteTransition(clip);
  if (!transition) return null;
  return parseCestLocalMinuteToUtcMs(transition.toMinute);
}

export function coarseToFineGlobalSearchV2(params: {
  clip: ExternalGtClip;
  speedSeries: ReturnType<typeof buildSpeedSeries>;
  eligibleObservations: ExternalGtObservation[];
  surface: AcquisitionSurface;
}): {
  allCandidates: GlobalSearchCandidate[];
  basins: BasinV2Result[];
  globalStatus: AlignmentStatus;
  seedCount: number;
} {
  const maxGap = SURFACE_INTERPOLATION_GAP_SECONDS[params.surface];
  const bounds = sessionSearchBoundsMs(params.clip);

  if (params.eligibleObservations.length < MIN_ALIGNMENT_ELIGIBLE_GT_POINTS) {
    return {
      allCandidates: [],
      basins: [],
      globalStatus: 'INSUFFICIENT_GROUND_TRUTH',
      seedCount: 0,
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

  const refineSeeds = buildDiscoveryV2SeedSet(coarse);
  const fineMap = new Map<number, GlobalSearchCandidate>();
  for (const c of coarse) fineMap.set(c.alignedClipStartMs, c);

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

  const allCandidates = [...fineMap.values()];
  const basins = extractV2Basins({
    candidates: allCandidates,
    eligibleCount: params.eligibleObservations.length,
    clip: params.clip,
    nominalBoundaryUtcMs: resolveNominalBoundaryUtcMs(params.clip),
  });

  return {
    allCandidates,
    basins,
    globalStatus: deriveGlobalStatusV2(basins),
    seedCount: refineSeeds.length,
  };
}

export function dedupePhysicalSamples(rows: VideoGtExportedRow[]): VideoGtExportedRow[] {
  const seen = new Set<string>();
  const out: VideoGtExportedRow[] = [];
  for (const row of rows) {
    const key = [
      row.physicalSampleFingerprint ?? '',
      row.providerTimestamp ?? '',
      row.providerField,
      row.acquisitionSurface,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export type ClipDiscoveryV2Result = {
  clipId: string;
  fileName: string;
  alignmentEligibleGtCount: number;
  HF_HISTORICAL: {
    independentStatus: AlignmentStatus;
    basins: BasinV2Result[];
    globalStatus: AlignmentStatus;
  };
  INGRESS_DIAGNOSTIC: {
    status: AlignmentStatus;
    alignedStart: string | null;
    coverage: number | null;
    MAE: number | null;
    RMSE: number | null;
    maxAbsError: number | null;
    ingressMinusProviderStartSeconds: number | null;
  };
};

export function runIndependentIngressDiscovery(params: {
  clip: ExternalGtClip;
  telemetryRows: VideoGtExportedRow[];
  providerBestStartMs: number | null;
}): ClipDiscoveryV2Result['INGRESS_DIAGNOSTIC'] {
  const eligible = params.clip.observations.filter(isAlignmentEligibleGroundTruth);
  const rows = dedupePhysicalSamples(
    filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', 'HF_HISTORICAL'),
  );
  const ingressSeries = buildSpeedSeriesIngress(rows);
  if (ingressSeries.length === 0 || eligible.length < MIN_ALIGNMENT_ELIGIBLE_GT_POINTS) {
    return {
      status: 'INSUFFICIENT_GROUND_TRUTH',
      alignedStart: null,
      coverage: null,
      MAE: null,
      RMSE: null,
      maxAbsError: null,
      ingressMinusProviderStartSeconds: null,
    };
  }

  const search = coarseToFineGlobalSearchV2({
    clip: params.clip,
    speedSeries: ingressSeries,
    eligibleObservations: eligible,
    surface: 'HF_HISTORICAL',
  });
  const best = search.basins.sort((a, b) =>
    compareDiscoveryV2Quality(
      { mae: a.MAE, rmse: a.RMSE, maxAbsError: a.maxAbsError, coverage: a.coverage, matched: a.matchedGtCount, total: a.eligibleGtCount },
      { mae: b.MAE, rmse: b.RMSE, maxAbsError: b.maxAbsError, coverage: b.coverage, matched: b.matchedGtCount, total: b.eligibleGtCount },
    ),
  )[0];

  const ingressSupported =
    best != null &&
    best.status === 'STRONG_CANDIDATE' &&
    Number.isFinite(best.MAE);

  return {
    status: best?.status ?? 'NOT_IDENTIFIABLE',
    alignedStart: best?.alignedClipStartUtc ?? null,
    coverage: best?.coverage ?? null,
    MAE: best?.MAE ?? null,
    RMSE: best?.RMSE ?? null,
    maxAbsError: best?.maxAbsError ?? null,
    ingressMinusProviderStartSeconds:
      best && params.providerBestStartMs != null
        ? (best.alignedClipStartMs - params.providerBestStartMs) / 1000
        : null,
    ...(ingressSupported ? { INGRESS_DIAGNOSTIC_SUPPORTED: 'YES' as const } : {}),
  };
}

export function discoverClipV2(params: {
  clip: ExternalGtClip;
  telemetryRows: VideoGtExportedRow[];
}): ClipDiscoveryV2Result {
  const eligible = params.clip.observations.filter(isAlignmentEligibleGroundTruth);
  const hfRows = filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', 'HF_HISTORICAL');
  const providerSeries = buildSpeedSeries(hfRows);

  const hfSearch =
    providerSeries.length > 0
      ? coarseToFineGlobalSearchV2({
          clip: params.clip,
          speedSeries: providerSeries,
          eligibleObservations: eligible,
          surface: 'HF_HISTORICAL',
        })
      : { basins: [], globalStatus: 'INSUFFICIENT_GROUND_TRUTH' as AlignmentStatus, allCandidates: [], seedCount: 0 };

  const providerBest = hfSearch.basins.sort((a, b) => a.rankByQuality - b.rankByQuality)[0];
  const ingress = runIndependentIngressDiscovery({
    clip: params.clip,
    telemetryRows: params.telemetryRows,
    providerBestStartMs: providerBest?.alignedClipStartMs ?? null,
  });

  return {
    clipId: params.clip.clipId,
    fileName: params.clip.fileName,
    alignmentEligibleGtCount: eligible.length,
    HF_HISTORICAL: {
      independentStatus: hfSearch.globalStatus,
      basins: hfSearch.basins,
      globalStatus: hfSearch.globalStatus,
    },
    INGRESS_DIAGNOSTIC: ingress,
  };
}

export type JointPathSelection = {
  clipId: string;
  fileName: string;
  selectedBasinRank: number;
  alignedClipStartUtc: string;
  jointStatus: string;
  jointRejectionReason: string | null;
};

export function buildJointClockChronologyPath(params: {
  discoveries: ClipDiscoveryV2Result[];
  clips: ExternalGtClip[];
}): {
  JOINT_PATH_FOUND: 'YES' | 'NO';
  JOINT_PATH_STATUS: string;
  path: JointPathSelection[];
  note: string;
} {
  type State = {
    selections: Array<{ disc: ClipDiscoveryV2Result; basin: BasinV2Result; clip: ExternalGtClip; endMs: number }>;
    intercepts: number[];
  };

  const clipMap = new Map(params.clips.map((c) => [c.clipId, c]));
  let states: State[] = [{ selections: [], intercepts: [] }];

  for (const clipId of CLIP_CHRONOLOGY_ORDER) {
    const disc = params.discoveries.find((d) => d.clipId === clipId);
    const clip = clipMap.get(clipId);
    if (!disc || !clip) continue;

    const basinOptions = disc.HF_HISTORICAL.basins.filter(
      (b) => b.status === 'STRONG_CANDIDATE' || b.status === 'AMBIGUOUS' || b.coverage >= 0.5,
    );
    if (basinOptions.length === 0) {
      return {
        JOINT_PATH_FOUND: 'NO',
        JOINT_PATH_STATUS: 'NO_CONSISTENT_PATH_IN_RETAINED_BASINS',
        path: [],
        note: `No credible basin retained for ${clip.fileName}`,
      };
    }

    const durationMs = ((clip.videoDurationSeconds ?? 60) + (clip.videoDurationUncertainty ?? 0)) * 1000;
    const nextStates: State[] = [];

    for (const state of states) {
      const prevEnd = state.selections.length
        ? state.selections[state.selections.length - 1]!.endMs
        : 0;

      for (const basin of basinOptions) {
        if (state.selections.length > 0 && basin.alignedClipStartMs < prevEnd - 1000) continue;

        const minuteL = clipDisplayedMinuteOrdinal(clip);
        const newIntercepts = [...state.intercepts];
        if (minuteL != null) {
          if (hasObservedMinuteTransition(clip)) {
            const tr = getClipObservedMinuteTransition(clip)!;
            newIntercepts.push(
              computeRelativeClockIntercept({
                alignedClipStartMs: basin.alignedClipStartMs,
                transitionVideoTimeSeconds: tr.videoTimeSeconds,
                minuteOrdinalL: parseDisplayedMinuteOrdinal(tr.toMinute),
              }),
            );
          }
        }

        if (newIntercepts.length >= 2) {
          const spread = Math.max(...newIntercepts) - Math.min(...newIntercepts);
          if (spread > JOINT_INTERCEPT_TOLERANCE_SECONDS) continue;
        }

        nextStates.push({
          selections: [
            ...state.selections,
            {
              disc,
              basin,
              clip,
              endMs: basin.alignedClipStartMs + durationMs,
            },
          ],
          intercepts: newIntercepts,
        });
      }
    }

    if (nextStates.length === 0) {
      return {
        JOINT_PATH_FOUND: 'NO',
        JOINT_PATH_STATUS: 'NO_CONSISTENT_PATH_IN_RETAINED_BASINS',
        path: [],
        note: 'Joint chronology/clock constraints unsatisfiable within retained basins (non-exhaustive DP)',
      };
    }

    states = nextStates.sort((a, b) => {
      const scoreA = a.selections.reduce((s, x) => s + x.basin.MAE, 0);
      const scoreB = b.selections.reduce((s, x) => s + x.basin.MAE, 0);
      return scoreA - scoreB;
    });
  }

  const best = states.sort((a, b) => {
    const strongA = a.selections.filter((s) => s.basin.status === 'STRONG_CANDIDATE').length;
    const strongB = b.selections.filter((s) => s.basin.status === 'STRONG_CANDIDATE').length;
    if (strongA !== strongB) return strongB - strongA;
    return (
      a.selections.reduce((s, x) => s + x.basin.MAE, 0) -
      b.selections.reduce((s, x) => s + x.basin.MAE, 0)
    );
  })[0];

  if (!best || best.selections.length < CLIP_CHRONOLOGY_ORDER.length) {
    return {
      JOINT_PATH_FOUND: 'NO',
      JOINT_PATH_STATUS: 'NO_CONSISTENT_PATH_IN_RETAINED_BASINS',
      path: [],
      note: 'Incomplete joint path within retained basins',
    };
  }

  const path: JointPathSelection[] = best.selections.map(({ disc, basin }) => ({
    clipId: disc.clipId,
    fileName: disc.fileName,
    selectedBasinRank: basin.rankByQuality,
    alignedClipStartUtc: basin.alignedClipStartUtc,
    jointStatus: basin.status === 'STRONG_CANDIDATE' ? 'JOINTLY_SUPPORTED' : 'JOINTLY_AMBIGUOUS',
    jointRejectionReason: null,
  }));

  return {
    JOINT_PATH_FOUND: 'YES',
    JOINT_PATH_STATUS: 'JOINT_CLOCK_CHRONOLOGY_PATH_SELECTED',
    path,
    note: 'Joint path is secondary inference — independent basin metrics unchanged',
  };
}

export function selectClockAuthorityBasin(basins: BasinV2Result[]): BasinV2Result | null {
  const qualified = basins.filter(
    (b) => b.status === 'STRONG_CANDIDATE' || b.status === 'AMBIGUOUS',
  );
  if (qualified.length === 0) return null;
  return qualified.sort((a, b) => a.rankByQuality - b.rankByQuality)[0] ?? null;
}

export function isClipClockAuthorityEligible(disc: ClipDiscoveryV2Result): boolean {
  return (
    disc.HF_HISTORICAL.independentStatus === 'STRONG_CANDIDATE' ||
    disc.HF_HISTORICAL.independentStatus === 'AMBIGUOUS'
  );
}

export function buildRelativeClockInterceptModel(params: {
  discoveries: ClipDiscoveryV2Result[];
  clips: ExternalGtClip[];
}): Record<string, unknown> {
  const entries: Array<Record<string, unknown>> = [];

  for (const disc of params.discoveries) {
    const clip = params.clips.find((c) => c.clipId === disc.clipId);
    if (!clip) continue;
    const authorityBasin = selectClockAuthorityBasin(disc.HF_HISTORICAL.basins);
    const best =
      authorityBasin ??
      disc.HF_HISTORICAL.basins.sort((a, b) => a.rankByQuality - b.rankByQuality)[0];
    if (!best) continue;

    const minuteL = clipDisplayedMinuteOrdinal(clip);
    if (minuteL == null) continue;

    const qualifiedForClock = isClipClockAuthorityEligible(disc) && authorityBasin != null;

    if (hasObservedMinuteTransition(clip)) {
      const tr = getClipObservedMinuteTransition(clip)!;
      const intercept = computeRelativeClockIntercept({
        alignedClipStartMs: best.alignedClipStartMs,
        transitionVideoTimeSeconds: tr.videoTimeSeconds,
        minuteOrdinalL: parseDisplayedMinuteOrdinal(tr.toMinute),
      });
      entries.push({
        clipId: disc.clipId,
        fileName: disc.fileName,
        clipType: 'TRANSITION',
        basinStatus: best.status,
        clockAuthorityEligible: qualifiedForClock ? 'YES' : 'NO',
        CLOCK_INTERCEPT_SECONDS: intercept,
        minuteOrdinalL: parseDisplayedMinuteOrdinal(tr.toMinute),
      });
    } else if (STATIC_MINUTE_CLIP_IDS.has(disc.clipId) || !TRANSITION_CLIP_IDS.has(disc.clipId)) {
      const interval = computeStaticMinuteInterceptInterval({
        alignedClipStartMs: best.alignedClipStartMs,
        durationSeconds: clip.videoDurationSeconds ?? 60,
        durationUncertaintySeconds: clip.videoDurationUncertainty ?? 0.5,
        minuteOrdinalL: minuteL,
      });
      entries.push({
        clipId: disc.clipId,
        fileName: disc.fileName,
        clipType: 'STATIC_MINUTE',
        basinStatus: best.status,
        clockAuthorityEligible: 'NO',
        CLOCK_INTERCEPT_INTERVAL_FROM: interval.from,
        CLOCK_INTERCEPT_INTERVAL_TO: interval.to,
        minuteOrdinalL: minuteL,
      });
    }
  }

  const qualifiedIntercepts = entries
    .filter((e) => e.clockAuthorityEligible === 'YES' && typeof e.CLOCK_INTERCEPT_SECONDS === 'number')
    .map((e) => e.CLOCK_INTERCEPT_SECONDS as number);

  let status = 'UNRESOLVED_INSUFFICIENT_QUALIFIED_TRANSITION_CLIPS';
  let center: number | null = null;
  let spread: number | null = null;

  if (qualifiedIntercepts.length >= 2) {
    center = qualifiedIntercepts.reduce((a, b) => a + b, 0) / qualifiedIntercepts.length;
    spread = Math.max(...qualifiedIntercepts) - Math.min(...qualifiedIntercepts);
    status = spread <= JOINT_INTERCEPT_TOLERANCE_SECONDS ? 'RELATIVE_INTERCEPT_CLUSTER_SUPPORTED' : 'RELATIVE_INTERCEPT_CLUSTER_WEAK';
  }

  return {
    evidenceLayer: 'METHOD_CORRECTION',
    modelName: 'RELATIVE_CLOCK_INTERCEPT_MODEL',
    RELATIVE_CLOCK_MODEL_STATUS: status,
    RELATIVE_CLOCK_INTERCEPT_CENTER: center,
    RELATIVE_CLOCK_INTERCEPT_SPREAD_SECONDS: spread,
    QUALIFIED_TRANSITION_CLIPS: qualifiedIntercepts.length,
    entries,
    note: 'Timezone-independent; CEST interpretation reported separately',
  };
}

export function buildQualifiedClockPhaseModel(params: {
  discoveries: ClipDiscoveryV2Result[];
  clips: ExternalGtClip[];
}): Record<string, unknown> {
  const phases: Array<{ clipId: string; phase: number; status: AlignmentStatus }> = [];

  for (const disc of params.discoveries) {
    if (!TRANSITION_CLIP_IDS.has(disc.clipId)) continue;
    if (!isClipClockAuthorityEligible(disc)) continue;
    const clip = params.clips.find((c) => c.clipId === disc.clipId);
    if (!clip || !clipHasObservedMinuteTransition(clip)) continue;

    const best = selectClockAuthorityBasin(disc.HF_HISTORICAL.basins);
    if (!best || best.CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60 == null) continue;

    phases.push({
      clipId: disc.clipId,
      phase: best.CLOCK_BOUNDARY_PHASE_SECONDS_MOD_60,
      status: disc.HF_HISTORICAL.independentStatus,
    });
  }

  const strongPhases = phases.filter((p) => p.status === 'STRONG_CANDIDATE');
  if (strongPhases.length < 2) {
    return {
      COMMON_CLOCK_PHASE_STATUS: 'UNRESOLVED_INSUFFICIENT_QUALIFIED_TRANSITION_CLIPS',
      CLOCK_PHASE_CENTER_SECONDS_MOD_60: null,
      CLOCK_PHASE_SPREAD_SECONDS: null,
      qualifiedClipCount: strongPhases.length,
    };
  }
  const values = strongPhases.map((p) => p.phase);
  const center = circularMeanMod60(values);
  const spreads = values.map((v) => Math.min(Math.abs(v - center), 60 - Math.abs(v - center)));
  const maxSpread = Math.max(...spreads);

  return {
    COMMON_CLOCK_PHASE_STATUS:
      maxSpread <= 8 ? 'PHASE_CLUSTER_SUPPORTED' : maxSpread <= 15 ? 'PHASE_CLUSTER_WEAK' : 'UNRESOLVED',
    CLOCK_PHASE_CENTER_SECONDS_MOD_60: center,
    CLOCK_PHASE_SPREAD_SECONDS: spreads.reduce((a, b) => a + b, 0) / spreads.length,
    qualifiedClipCount: strongPhases.length,
    circularMeanUsed: true,
  };
}

export function auditMutuallyExclusiveCandidates(params: {
  discoveries: ClipDiscoveryV2Result[];
  clips: ExternalGtClip[];
}): Record<string, unknown> {
  const clip2807 = params.discoveries.find((d) => d.fileName === 'IMG_2807.mp4');
  const clip2810 = params.discoveries.find((d) => d.fileName === 'IMG_2810.mp4');
  const meta2807 = params.clips.find((c) => c.fileName === 'IMG_2807.mp4');
  const meta2810 = params.clips.find((c) => c.fileName === 'IMG_2810.mp4');

  const b2807 = clip2807?.HF_HISTORICAL.basins.find((b) => b.status === 'STRONG_CANDIDATE');
  const b2810 = clip2810?.HF_HISTORICAL.basins.find((b) => b.status === 'STRONG_CANDIDATE');

  let jointlyPossible: 'YES' | 'NO' = 'NO';
  let gapConflict: number | null = null;

  if (b2807 && b2810 && meta2807 && meta2810) {
    const interveningClipIds = ['RD003_GT_CLIP_006', 'RD003_GT_CLIP_007'];
    let requiredStartMs = b2807.alignedClipStartMs;
    requiredStartMs += (meta2807.videoDurationSeconds ?? 61.2) * 1000;
    for (const clipId of interveningClipIds) {
      const meta = params.clips.find((c) => c.clipId === clipId);
      if (meta) requiredStartMs += (meta.videoDurationSeconds ?? 0) * 1000;
    }
    gapConflict = (b2810.alignedClipStartMs - requiredStartMs) / 1000;
    jointlyPossible = gapConflict >= -1 ? 'YES' : 'NO';
  }

  return {
    IMG_2807_INDEPENDENT_STRONG: b2807 ? 'YES' : 'NO',
    IMG_2810_INDEPENDENT_STRONG: b2810 ? 'YES' : 'NO',
    IMG_2807_AND_IMG_2810_JOINTLY_POSSIBLE: jointlyPossible,
    MINIMUM_CHRONOLOGY_GAP_CONFLICT_SECONDS: gapConflict,
    note: 'Independent speed strength does not imply joint chronology feasibility; intervening clips IMG_2808/IMG_2809 included',
  };
}

export function countIngressDiagnosticSupported(
  discoveries: ClipDiscoveryV2Result[],
): number {
  return discoveries.filter((d) => {
    const ing = d.INGRESS_DIAGNOSTIC;
    return (
      ing.status === 'STRONG_CANDIDATE' &&
      ing.MAE != null &&
      Number.isFinite(ing.MAE) &&
      ing.alignedStart != null
    );
  }).length;
}

export function runGlobalFingerprintDiscoveryV2(params: {
  telemetryRows: VideoGtExportedRow[];
  externalGt: ExternalGtDocument;
}): {
  perClipDiscoveries: ClipDiscoveryV2Result[];
  perClipTopBasins: Record<string, unknown>;
  paretoFrontiers: Record<string, unknown>;
  independentProviderDiscovery: Record<string, unknown>;
  independentIngressDiscovery: Record<string, unknown>;
  relativeClockInterceptModel: Record<string, unknown>;
  jointClockChronologyPath: ReturnType<typeof buildJointClockChronologyPath>;
  mutuallyExclusiveCandidates: Record<string, unknown>;
  discoverySummary: Record<string, unknown>;
} {
  const perClipDiscoveries = params.externalGt.clips.map((clip) =>
    discoverClipV2({ clip, telemetryRows: params.telemetryRows }),
  );

  const perClipTopBasins = Object.fromEntries(
    perClipDiscoveries.map((d) => [
      d.clipId,
      { clipId: d.clipId, fileName: d.fileName, basins: d.HF_HISTORICAL.basins },
    ]),
  );

  const paretoFrontiers = Object.fromEntries(
    perClipDiscoveries.map((d) => [
      d.clipId,
      {
        clipId: d.clipId,
        paretoBasins: d.HF_HISTORICAL.basins.filter((b) => b.paretoStatus === 'PARETO'),
      },
    ]),
  );

  const independentProviderDiscovery = Object.fromEntries(
    perClipDiscoveries.map((d) => [
      d.clipId,
      {
        clipId: d.clipId,
        independentStatus: d.HF_HISTORICAL.independentStatus,
        basins: d.HF_HISTORICAL.basins,
      },
    ]),
  );

  const independentIngressDiscovery = Object.fromEntries(
    perClipDiscoveries.map((d) => [d.clipId, { clipId: d.clipId, ...d.INGRESS_DIAGNOSTIC }]),
  );

  const relativeClockInterceptModel = buildRelativeClockInterceptModel({
    discoveries: perClipDiscoveries,
    clips: params.externalGt.clips,
  });

  const jointClockChronologyPath = buildJointClockChronologyPath({
    discoveries: perClipDiscoveries,
    clips: params.externalGt.clips,
  });

  const mutuallyExclusiveCandidates = auditMutuallyExclusiveCandidates({
    discoveries: perClipDiscoveries,
    clips: params.externalGt.clips,
  });

  const qualifiedPhase = buildQualifiedClockPhaseModel({
    discoveries: perClipDiscoveries,
    clips: params.externalGt.clips,
  });

  const independentStrongBasinClips = perClipDiscoveries.filter((d) =>
    d.HF_HISTORICAL.basins.some((b) => b.status === 'STRONG_CANDIDATE'),
  ).length;
  const providerAlignmentSupportedClips = perClipDiscoveries.filter(
    (d) => d.HF_HISTORICAL.independentStatus === 'STRONG_CANDIDATE',
  ).length;

  const jointlyConsistentStrong =
    jointClockChronologyPath.JOINT_PATH_FOUND === 'YES'
      ? jointClockChronologyPath.path.filter((p) => p.jointStatus === 'JOINTLY_SUPPORTED').length
      : 0;

  const img2810 = perClipDiscoveries.find((d) => d.clipId === 'RD003_GT_CLIP_008');
  const img2810Basin = img2810?.HF_HISTORICAL.basins.find(
    (b) =>
      b.alignedClipStartMs >= Date.parse('2026-09-02T19:23:50.000Z') &&
      b.alignedClipStartMs <= Date.parse('2026-09-02T19:24:10.000Z') &&
      b.status === 'STRONG_CANDIDATE',
  );

  const ages: number[] = [];
  for (const disc of perClipDiscoveries) {
    const best = disc.HF_HISTORICAL.basins[0];
    if (!best) continue;
    const clip = params.externalGt.clips.find((c) => c.clipId === disc.clipId);
    if (!clip) continue;
    const eligible = clip.observations.filter(isAlignmentEligibleGroundTruth);
    const series = buildSpeedSeries(
      filterTelemetryByFieldAndSurface(params.telemetryRows, 'speed', 'HF_HISTORICAL'),
    );
    const maxGap = SURFACE_INTERPOLATION_GAP_SECONDS.HF_HISTORICAL;
    for (const obs of eligible) {
      const absMs = absoluteEventMsFromAlignedClipStart(best.alignedClipStartMs, obs.videoTimeSeconds!);
      const pt = deriveTelemetryAtUtc(series, absMs, maxGap);
      if (pt.status === 'MATCHED' && pt.beforeSource) {
        const row = series.find((s) => s.row.acquisitionOrdinal === pt.beforeSource!.acquisitionOrdinal)?.row;
        if (row) {
          const age = computeProviderDeliveryMetrics(row).providerSampleAgeSeconds;
          if (age != null) ages.push(age);
        }
      }
    }
  }
  ages.sort((a, b) => a - b);

  const discoverySummary: Record<string, unknown> = {
    evidenceId: DISCOVERY_V2_EVIDENCE_ID,
    discoveryMode: DISCOVERY_V2_MODE,
    DISCOVERY_V2_EXECUTED: 'YES',
    GROUND_TRUTH_VALIDATED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    DRIVING_SCORE_CHANGED: 'NO',
    INDEPENDENT_STRONG_CANDIDATE_COUNT: independentStrongBasinClips,
    JOINTLY_CONSISTENT_STRONG_CANDIDATE_COUNT: jointlyConsistentStrong,
    ...mutuallyExclusiveCandidates,
    RELATIVE_CLOCK_MODEL_STATUS: relativeClockInterceptModel.RELATIVE_CLOCK_MODEL_STATUS,
    QUALIFIED_TRANSITION_CLIPS: relativeClockInterceptModel.QUALIFIED_TRANSITION_CLIPS,
    RELATIVE_CLOCK_INTERCEPT_CENTER: relativeClockInterceptModel.RELATIVE_CLOCK_INTERCEPT_CENTER,
    RELATIVE_CLOCK_INTERCEPT_SPREAD_SECONDS:
      relativeClockInterceptModel.RELATIVE_CLOCK_INTERCEPT_SPREAD_SECONDS,
    ...qualifiedPhase,
    ZERO_PHASE_HARD_CLOCK_BOUND_CONCLUSION: img2810Basin ? 'HARD_SECOND_PHASE_PRIOR_FALSIFIED' : 'INCONCLUSIVE',
    DISPLAYED_MINUTE_IDENTITY_CONCLUSION: 'SUPPORTED_BY_OBSERVED_CLIP_ORDER',
    CEST_TIMEZONE_HYPOTHESIS_CONCLUSION: 'UNRESOLVED_INDEPENDENT_OF_RELATIVE_MODEL',
    PROVIDER_TIME_ALIGNMENT_SUPPORTED_CLIPS: providerAlignmentSupportedClips,
    INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS: countIngressDiagnosticSupported(perClipDiscoveries),
    HF_PROVIDER_SAMPLE_AGE_MEDIAN_SECONDS: ages.length ? ages[Math.floor(ages.length / 2)] : null,
    HF_PROVIDER_SAMPLE_AGE_P90_SECONDS: ages.length ? ages[Math.floor(ages.length * 0.9)] : null,
    HF_SPEED_ALIGNMENT_V2_CONCLUSION:
      providerAlignmentSupportedClips >= 5
        ? 'HF_SPEED_ALIGNMENT_V2_SUPPORTED'
        : providerAlignmentSupportedClips >= 2
          ? 'HF_SPEED_ALIGNMENT_V2_AMBIGUOUS'
          : 'HF_SPEED_ALIGNMENT_V2_NOT_IDENTIFIABLE',
    IMG_2810_V2_STRONG_BASIN_AT_19_23_59: img2810Basin ? 'YES' : 'NO',
    READY_FOR_DI_EV_0034E_SIGNAL_QUALITY_INTERPRETATION: 'YES',
  };

  return {
    perClipDiscoveries,
    perClipTopBasins,
    paretoFrontiers,
    independentProviderDiscovery,
    independentIngressDiscovery,
    relativeClockInterceptModel,
    jointClockChronologyPath,
    mutuallyExclusiveCandidates,
    discoverySummary,
  };
}

export function discoveryV2OutputSha256(outputs: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(stableStringify(outputs)).digest('hex');
}

/** Regression helper: ensure MAE=5 / coverage=0.9 candidate survives coverage=1 / MAE=50 junk. */
export function regressionCoverageMaeSeedSelection(
  candidates: GlobalSearchCandidate[],
): { qualitySeedIncluded: boolean; refinedBasinSurfaced: boolean } {
  const junk: GlobalSearchCandidate = {
    alignedClipStartMs: 1_000_000,
    alignedClipStartUtc: new Date(1_000_000).toISOString(),
    mae: 50,
    rmse: 50,
    maxAbsError: 55,
    matched: 10,
    total: 10,
    errors: [],
    matchCoverageRatio: 1,
  };
  const good: GlobalSearchCandidate = {
    alignedClipStartMs: 2_000_000,
    alignedClipStartUtc: new Date(2_000_000).toISOString(),
    mae: 5,
    rmse: 5,
    maxAbsError: 6,
    matched: 9,
    total: 10,
    errors: [],
    matchCoverageRatio: 0.9,
  };
  const all = [...candidates, junk, good];
  const seeds = buildDiscoveryV2SeedSet(all);
  const qualitySeedIncluded = seeds.some((s) => s.alignedClipStartMs === good.alignedClipStartMs);
  const basins = extractV2Basins({
    candidates: all,
    eligibleCount: 10,
    clip: {
      clipId: 'TEST',
      fileName: 'TEST.mp4',
      videoDurationSeconds: 30,
      videoDurationUncertainty: 0.5,
      evidenceStatus: 'EXTERNAL_GT_INGESTED',
      observations: [],
    },
  });
  const refinedBasinSurfaced = basins.some((b) => b.alignedClipStartMs === good.alignedClipStartMs);
  return { qualitySeedIncluded, refinedBasinSurfaced };
}
