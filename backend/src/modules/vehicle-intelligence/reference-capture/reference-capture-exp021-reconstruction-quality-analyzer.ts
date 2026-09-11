/**
 * EXP-021 — read-only reconstruction-quality analysis per calibration phase.
 *
 * Forensic / experimental scope only. Does NOT modify production trip FSM or map matching.
 * Full map-matching continuity requires a future read-only adapter over trip-route artifacts.
 */
import {
  computeNativeTemporalCadenceStats,
  type HfCalibrationPhaseSummary,
} from './reference-capture-hf-calibration-phase.policy';
import { buildExp021IntendedSlotOffsets } from './reference-capture-exp021-request-slots.lib';
import {
  findPhaseSpecByCadence,
  type Exp021CalibrationPlan,
  resolveExp021CalibrationPlan,
} from './reference-capture-exp021-calibration-plan.lib';
import {
  extractNativeGapsFromOrderedTimestamps,
  reconstructNativeGapReportFromEvidence,
} from './reference-capture-exp021-native-gap-reconstruction';
import { EXP021_GAP_SETTLEMENT_MIN_GAP_MS } from './reference-capture-exp021-gap-settlement-analyzer';
import type { Exp021NativeTemporalEvidenceV1 } from './reference-capture-native-temporal-evidence.lib';

export type Exp021ReconstructionQualityReadiness =
  | 'BUCKET_AND_GAP_METRICS_READY'
  | 'MAP_MATCHING_ADAPTER_REQUIRED';

export type Exp021PhaseReconstructionMetrics = {
  cadenceMs: number;
  phaseLabel: string;
  intendedRequestSlots: number;
  issuedSlots: number;
  successfulSlots: number;
  zeroResultSlots: number;
  failureSlots: number;
  nativeBucketCount: number;
  bucketsPerWallMinute: number | null;
  deltaTP50Ms: number | null;
  deltaTP90Ms: number | null;
  deltaTP95Ms: number | null;
  deltaTP99Ms: number | null;
  maxDeltaTMs: number | null;
  gapsGe10s: number;
  gapsGe20s: number;
  gapsGe30s: number;
  gapAssessabilityPct: number | null;
  validMovementDurationMs: number | null;
  requestCostPerWallMinute: number | null;
  /** Read-only experimental — not yet wired to trip route matcher. */
  temporalRouteContinuityScore: number | null;
  matchedGeometryContinuityScore: number | null;
  unreconstructableSegmentCount: number | null;
  unreconstructableSegmentDurationMs: number | null;
  stopDetectionContinuityScore: number | null;
  majorMovementTransitionCount: number | null;
  mapMatchingConfidenceClassification: string | null;
};

export type Exp021BracketReconstructionReport = {
  planVersion: string;
  readiness: Exp021ReconstructionQualityReadiness;
  phases: Exp021PhaseReconstructionMetrics[];
  decisionFrameworkNote: string;
  mapMatchingIntegrationGap: string;
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

function countSlotStatuses(
  slots: Array<{ status: string }> | null | undefined,
): { issued: number; success: number; zero: number; failure: number } {
  if (!slots?.length) return { issued: 0, success: 0, zero: 0, failure: 0 };
  let issued = 0;
  let success = 0;
  let zero = 0;
  let failure = 0;
  for (const slot of slots) {
    if (slot.status === 'ISSUED' || slot.status === 'SUCCESS' || slot.status === 'ZERO_RESULT' || slot.status === 'FAILURE') {
      issued += 1;
    }
    if (slot.status === 'SUCCESS') success += 1;
    if (slot.status === 'ZERO_RESULT') zero += 1;
    if (slot.status === 'FAILURE') failure += 1;
  }
  return { issued, success, zero, failure };
}

function computeDeltaTPercentiles(
  orderedBucketStarts: string[],
): { p50: number | null; p90: number | null; p95: number | null; p99: number | null; max: number | null } {
  const dts: number[] = [];
  for (let i = 1; i < orderedBucketStarts.length; i++) {
    dts.push(Date.parse(orderedBucketStarts[i]) - Date.parse(orderedBucketStarts[i - 1]));
  }
  if (dts.length === 0) {
    return { p50: null, p90: null, p95: null, p99: null, max: null };
  }
  const sorted = [...dts].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
}

/**
 * Temporal continuity proxy: fraction of phase wall time covered by native 1s buckets
 * without gaps >= 10s (read-only; not map-matched geometry).
 */
function temporalRouteContinuityProxy(args: {
  orderedBucketStarts: string[];
  phaseStartMs: number;
  phaseEndMs: number;
}): number | null {
  const wallMs = args.phaseEndMs - args.phaseStartMs;
  if (wallMs <= 0 || args.orderedBucketStarts.length < 2) return null;
  const gaps = extractNativeGapsFromOrderedTimestamps({
    phaseLabel: 'proxy',
    phaseProvenance: null,
    orderedNativeTemporalBucketStarts: args.orderedBucketStarts,
    minGapMs: EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
  });
  const gapMs = gaps.reduce((sum, g) => sum + g.gapDurationMs, 0);
  const covered = Math.max(0, wallMs - gapMs);
  return Math.min(1, covered / wallMs);
}

export function buildPhaseReconstructionMetrics(args: {
  summary: HfCalibrationPhaseSummary;
  plan?: Exp021CalibrationPlan;
  gapAssessabilityPct?: number | null;
}): Exp021PhaseReconstructionMetrics {
  const { summary } = args;
  const plan = args.plan ?? resolveExp021CalibrationPlan();
  const cadenceMs = summary.effectivePollIntervalMs;
  const phaseSpec = findPhaseSpecByCadence(plan, cadenceMs);
  const phaseDurationMs = phaseSpec?.targetDurationMs ?? summary.durationMs;
  const intendedOffsets = buildExp021IntendedSlotOffsets({
    cadenceMs,
    phaseDurationMs,
  });
  const slotCounts = countSlotStatuses(summary.exp021RequestSlots);
  const evidence: Exp021NativeTemporalEvidenceV1 | null =
    summary.nativeTemporalEvidence ?? null;
  const ordered = evidence?.orderedNativeTemporalBucketStarts ?? [];
  const cadenceStats = computeNativeTemporalCadenceStats(ordered);
  const deltaT = computeDeltaTPercentiles(ordered);
  const gapReport = evidence
    ? reconstructNativeGapReportFromEvidence(evidence)
    : null;
  const gapsGe20s = gapReport
    ? gapReport.gaps.filter((g) => g.gapDurationMs >= 20_000).length
    : 0;
  const wallMinutes = summary.durationMs > 0 ? summary.durationMs / 60_000 : 0;
  const phaseStartMs = Date.parse(summary.phaseStartedAt);
  const phaseEndMs = Date.parse(summary.phaseEndedAt);

  return {
    cadenceMs,
    phaseLabel: `${cadenceMs / 1000}s`,
    intendedRequestSlots: intendedOffsets.length,
    issuedSlots: slotCounts.issued,
    successfulSlots: slotCounts.success,
    zeroResultSlots: slotCounts.zero,
    failureSlots: slotCounts.failure,
    nativeBucketCount: summary.nativeUniqueTemporalBucketStartCount,
    bucketsPerWallMinute:
      wallMinutes > 0 ? summary.nativeUniqueTemporalBucketStartCount / wallMinutes : null,
    deltaTP50Ms: deltaT.p50 ?? cadenceStats.nativeMedianTemporalCadenceMs,
    deltaTP90Ms: deltaT.p90 ?? cadenceStats.nativeP90TemporalCadenceMs,
    deltaTP95Ms: deltaT.p95 ?? null,
    deltaTP99Ms: deltaT.p99 ?? null,
    maxDeltaTMs: deltaT.max ?? cadenceStats.nativeMaxTemporalGapMs,
    gapsGe10s: gapReport?.gapsGe10s ?? 0,
    gapsGe20s,
    gapsGe30s: gapReport?.gapsGe30s ?? 0,
    gapAssessabilityPct: args.gapAssessabilityPct ?? null,
    validMovementDurationMs: summary.validMovementDurationMs ?? null,
    requestCostPerWallMinute:
      wallMinutes > 0 ? summary.providerRequestCount / wallMinutes : null,
    temporalRouteContinuityScore:
      Number.isFinite(phaseStartMs) && Number.isFinite(phaseEndMs)
        ? temporalRouteContinuityProxy({
            orderedBucketStarts: ordered,
            phaseStartMs,
            phaseEndMs,
          })
        : null,
    matchedGeometryContinuityScore: null,
    unreconstructableSegmentCount: gapReport?.nativeGapsTotal ?? null,
    unreconstructableSegmentDurationMs: gapReport
      ? gapReport.gaps.reduce((sum, g) => sum + g.gapDurationMs, 0)
      : null,
    stopDetectionContinuityScore: null,
    majorMovementTransitionCount: null,
    mapMatchingConfidenceClassification: null,
  };
}

export function buildBracketReconstructionReport(args: {
  plan: Exp021CalibrationPlan;
  phaseSummaries: HfCalibrationPhaseSummary[];
  gapAssessabilityByCadenceMs?: Record<number, number>;
}): Exp021BracketReconstructionReport {
  const phases = args.phaseSummaries.map((summary) =>
    buildPhaseReconstructionMetrics({
      summary,
      plan: args.plan,
      gapAssessabilityPct:
        args.gapAssessabilityByCadenceMs?.[summary.effectivePollIntervalMs] ?? null,
    }),
  );

  const hasMapMetrics = phases.some(
    (p) => p.matchedGeometryContinuityScore != null || p.stopDetectionContinuityScore != null,
  );

  return {
    planVersion: args.plan.planVersion,
    readiness: hasMapMetrics
      ? 'BUCKET_AND_GAP_METRICS_READY'
      : 'MAP_MATCHING_ADAPTER_REQUIRED',
    phases,
    decisionFrameworkNote:
      'Prefer fewer requests when reconstruction quality is materially equivalent; use gap distribution, worst-case gaps, settlement maturation, and reconstruction — not bucket count alone.',
    mapMatchingIntegrationGap:
      'Read-only adapter over trip-route chunked matcher (TripRouteChunkedMatcher) required for matched geometry continuity, stop detection continuity, and map-matching confidence/fallback classification per phase window.',
  };
}
