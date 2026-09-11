import { HF_AGGREGATE_BUCKET_INTERVAL_MS } from './reference-capture-hf-aggregate-bucket-analysis';
import { computeNativeTemporalCadenceStats } from './reference-capture-hf-calibration-phase.policy';
import {
  EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
  expectedInteriorTemporalBuckets,
  type NativeTemporalGap,
} from './reference-capture-exp021-gap-settlement-analyzer';
import type { Exp021NativeTemporalEvidenceV1 } from './reference-capture-native-temporal-evidence.lib';
import { canonicalizeOrderedNativeTemporalBucketStarts } from './reference-capture-native-temporal-evidence.lib';

export type NativeGapLedgerEntry = {
  gapId: string;
  phaseLabel: string;
  phaseProvenance: string | null;
  previousBucketTimestamp: string;
  nextBucketTimestamp: string;
  gapStart: string;
  gapEnd: string;
  gapDurationMs: number;
  interiorExpectedTimeRange: { startIso: string; endIso: string };
  interiorExpectedTemporalBuckets: string[];
};

export type NativeGapReconstructionReport = {
  nativeBucketCount: number;
  nativeGapsTotal: number;
  medianNativeDtMs: number | null;
  p95NativeDtMs: number | null;
  maxNativeDtMs: number | null;
  gapsGe10s: number;
  gapsGe30s: number;
  gapsGe60s: number;
  gaps: NativeGapLedgerEntry[];
};

function formatPhaseLabel(pollIntervalMs: number): string {
  return `${pollIntervalMs / 1000}s`;
}

function percentileFromGaps(gaps: number[], p: number): number | null {
  if (gaps.length === 0) return null;
  const sorted = [...gaps].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

export function extractNativeGapsFromOrderedTimestamps(args: {
  phaseLabel: string;
  phaseProvenance: string | null;
  orderedNativeTemporalBucketStarts: string[];
  minGapMs: number;
}): NativeGapLedgerEntry[] {
  const gaps = extractNativeTemporalGapsForReconstruction({
    phaseLabel: args.phaseLabel,
    nativeTemporalBucketStarts: args.orderedNativeTemporalBucketStarts,
    minGapMs: args.minGapMs,
  });

  return gaps.map((gap, index) => {
    const interiors = expectedInteriorTemporalBuckets(gap);
    const interiorStart = interiors[0] ?? gap.gapEndIso;
    const interiorEnd =
      interiors.length > 0
        ? interiors[interiors.length - 1]
        : gap.gapEndIso;
    return {
      gapId: `${args.phaseLabel}|${gap.gapStartIso}|${gap.gapEndIso}|${index}`,
      phaseLabel: args.phaseLabel,
      phaseProvenance: args.phaseProvenance,
      previousBucketTimestamp: gap.previousBucketTemporalIso,
      nextBucketTimestamp: gap.nextBucketTemporalIso,
      gapStart: gap.gapStartIso,
      gapEnd: gap.gapEndIso,
      gapDurationMs: gap.gapDurationMs,
      interiorExpectedTimeRange: { startIso: interiorStart, endIso: interiorEnd },
      interiorExpectedTemporalBuckets: interiors,
    };
  });
}

function extractNativeTemporalGapsForReconstruction(args: {
  phaseLabel: string;
  nativeTemporalBucketStarts: string[];
  minGapMs: number;
}): NativeTemporalGap[] {
  const sorted = canonicalizeOrderedNativeTemporalBucketStarts(args.nativeTemporalBucketStarts);
  const gaps: NativeTemporalGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevMs = Date.parse(sorted[i - 1]);
    const nextMs = Date.parse(sorted[i]);
    const durationMs = nextMs - prevMs;
    if (durationMs < args.minGapMs) continue;
    gaps.push({
      phaseLabel: args.phaseLabel,
      gapIndex: gaps.length,
      gapStartIso: sorted[i - 1],
      gapEndIso: sorted[i],
      gapDurationMs: durationMs,
      previousBucketTemporalIso: sorted[i - 1],
      nextBucketTemporalIso: sorted[i],
    });
  }
  return gaps;
}

export function reconstructNativeGapReportFromEvidence(
  evidence: Exp021NativeTemporalEvidenceV1,
  minGapMs: number = EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
): NativeGapReconstructionReport {
  const ordered = canonicalizeOrderedNativeTemporalBucketStarts(
    evidence.orderedNativeTemporalBucketStarts,
  );
  const phaseLabel = formatPhaseLabel(evidence.effectivePollIntervalMs);
  const gaps = extractNativeGapsFromOrderedTimestamps({
    phaseLabel,
    phaseProvenance: evidence.phaseProvenance,
    orderedNativeTemporalBucketStarts: ordered,
    minGapMs,
  });

  const cadence = computeNativeTemporalCadenceStats(ordered);
  const dts: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    dts.push(Date.parse(ordered[i]) - Date.parse(ordered[i - 1]));
  }

  return {
    nativeBucketCount: ordered.length,
    nativeGapsTotal: gaps.length,
    medianNativeDtMs: cadence.nativeMedianTemporalCadenceMs,
    p95NativeDtMs: percentileFromGaps(dts, 0.95),
    maxNativeDtMs: cadence.nativeMaxTemporalGapMs,
    gapsGe10s: gaps.filter((g) => g.gapDurationMs >= 10_000).length,
    gapsGe30s: gaps.filter((g) => g.gapDurationMs >= 30_000).length,
    gapsGe60s: gaps.filter((g) => g.gapDurationMs >= 60_000).length,
    gaps,
  };
}

export { HF_AGGREGATE_BUCKET_INTERVAL_MS };
