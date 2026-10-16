import { DI_V0_SPEED_QC_POLICY_V2 } from '../speed-qc/di-v0-speed-qc-policy.version';
import { evaluateDiV0SpeedQcInterval } from '../speed-qc/evaluate-di-v0-speed-qc-interval';
import type { DiV0TripSpeedQualityShadowRow } from './build-di-v0-trip-speed-quality-projection.v1';
import {
  bucketLabelMinusSeconds,
  bucketLabelPlusSeconds,
} from '../speed-qc/di-v0-speed-qc-geo';
import {
  classifyNoNumericDisjointV2,
  classifySupportWindowGaps,
  dateToBucketLabel,
  diagnosePositionGapAtLabel,
  enumerateAcquisitionBucketLabels,
  isConsecutiveSecond,
  type AcquisitionWindow,
  type PositionBucketSample,
  type PositionGapKind,
} from './di-v0-p21-r3-forensic-classify';
import { DI_V0_SPEED_QC_REASON } from '../speed-qc/di-v0-speed-qc-reason-codes';
import { classifyHoldTransitionDetail } from './di-v0-p21-r3-forensic-classify';

/** Mirrors coverage diagnostic `mapUnassessableCause` priority: conflict → SWC → POS_GAP* → hold → movement. */
export function mapUnassessableCauseFromVerdict(
  row: DiV0TripSpeedQualityShadowRow,
  v2ReasonCodes: string[],
  posByLabel: Map<string, PositionBucketSample>,
  window: AcquisitionWindow,
): string {
  if (v2ReasonCodes.includes(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT)) return 'CROSS_SOURCE_CONFLICT';
  if (v2ReasonCodes.includes(DI_V0_SPEED_QC_REASON.SUPPORT_WINDOW_COMPROMISED)) return 'SUPPORT_WINDOW_COMPROMISED';
  const v2Class = classifyNoNumericDisjointV2(row, posByLabel, window);
  if (v2Class.startsWith('POS_GAP_WINDOW_EDGE_OUTSIDE_ACQUISITION')) return 'ACQUISITION_EDGE_SUPPORT';
  if (v2Class.startsWith('POS_GAP_')) return 'POSITION_GAP';
  const hold = classifyHoldTransitionDetail(row, posByLabel);
  if (
    hold === 'CENTER_FROZEN_UNRESOLVED' ||
    hold === 'CENTER_FROZEN_MOVEMENT_SUPPORTED' ||
    hold === 'CENTER_FROZEN_STOP_SUPPORTED'
  ) {
    return 'FROZEN_OR_UNRESOLVED_HOLD';
  }
  if (
    hold === 'CENTER_RELEASE' ||
    hold === 'NEIGHBOR_HOLD_OR_RELEASE_FRESH_CENTER' ||
    hold === 'TRANSITION_UNCERTAIN_FRESH_L3_SUPPORT'
  ) {
    return 'RELEASE_OR_TRANSITION';
  }
  if (hold === 'MOVING_SPEED_UNKNOWN' || row.motionState === 'MOVING_SPEED_UNKNOWN') {
    return 'MOVEMENT_SPEED_UNKNOWN';
  }
  return 'OTHER';
}

export type PositionBucketStage =
  | 'EXPECTED_BUCKET_ABSENT_FROM_SNAPSHOT_MAP'
  | 'ROW_ABSENT_EXPLICIT'
  | 'SIGNAL_NULL_EXPLICIT'
  | 'INVALID_COORDINATES'
  | 'PRESENT_VALID_COORDINATES'
  | 'WINDOW_EDGE_OUTSIDE_ACQUISITION';

export function classifyBucketStage(
  label: string,
  posByLabel: Map<string, PositionBucketSample>,
  window: AcquisitionWindow,
): PositionBucketStage {
  const gap = diagnosePositionGapAtLabel(label, posByLabel, window);
  switch (gap) {
    case 'WINDOW_EDGE_OUTSIDE_ACQUISITION':
      return 'WINDOW_EDGE_OUTSIDE_ACQUISITION';
    case 'MISSING_BUCKET_INSIDE_WINDOW':
      return 'EXPECTED_BUCKET_ABSENT_FROM_SNAPSHOT_MAP';
    case 'ROW_ABSENT_EXPLICIT':
      return 'ROW_ABSENT_EXPLICIT';
    case 'SIGNAL_NULL_EXPLICIT':
      return 'SIGNAL_NULL_EXPLICIT';
    case 'INVALID_COORDINATES':
      return 'INVALID_COORDINATES';
    case 'PRESENT_OK':
      return 'PRESENT_VALID_COORDINATES';
    default:
      return 'EXPECTED_BUCKET_ABSENT_FROM_SNAPSHOT_MAP';
  }
}

export type IntervalPositionGapDetail = {
  referenceTimeIso: string;
  centerGapKinds: PositionGapKind[];
  prevGapKinds: PositionGapKind[];
  nextGapKinds: PositionGapKind[];
  v2DisjointClass: string;
  coverageCause: string;
  centerBucketStage: PositionBucketStage;
  shadowNumeric: boolean;
  centerPositionState: string | null;
};

function shadowToQc(row: DiV0TripSpeedQualityShadowRow, center: string) {
  return {
    intervalStart: center,
    intervalEnd: center,
    referenceTime: center,
    estimatedSpeedKmh: row.estimatedSpeedKmh,
    speedEvidenceState: (row.speedEvidenceState ?? 'NONE') as 'NONE',
    valueConfidence: row.valueConfidence as 'HIGH',
    sourceRelation: row.sourceRelation as never,
    motionState: row.motionState as never,
    positionState: row.positionState as never,
    abstentionReason: row.abstentionReason as never,
    sourceQualityFlags: Array.isArray(row.sourceQualityFlags) ? row.sourceQualityFlags.map(String) : [],
    evidenceSources: [],
  };
}

export function analyzePositionGapForensic(input: {
  shadowIntervals: DiV0TripSpeedQualityShadowRow[];
  positions: PositionBucketSample[];
  r1Obd: { bucketLabel: string; speedKmh: number | null }[];
  pinnedSnapshotHash: string;
  acquisitionWindow: AcquisitionWindow;
}): {
  acquisitionWindow: AcquisitionWindow;
  expectedBucketCount: number;
  bucketStageCounts: Record<PositionBucketStage, number>;
  intervalPositionGapSeconds: number;
  intervalsWithCenterGap: number;
  intervalsNeighborSupportOnly: number;
  intervalGapDetailByClass: Record<string, number>;
  longestPositionGapRun: { seconds: number; startIso: string | null; endIso: string | null; dominantCenterStage: string | null };
  longestPositionGapRunBucketStages: Record<string, number>;
  sampleIntervals: IntervalPositionGapDetail[];
} {
  const posByLabel = new Map(input.positions.map((p) => [p.bucketLabel, p]));
  const window = input.acquisitionWindow;
  const expected = enumerateAcquisitionBucketLabels(window);

  const bucketStageCounts: Record<PositionBucketStage, number> = {
    EXPECTED_BUCKET_ABSENT_FROM_SNAPSHOT_MAP: 0,
    ROW_ABSENT_EXPLICIT: 0,
    SIGNAL_NULL_EXPLICIT: 0,
    INVALID_COORDINATES: 0,
    PRESENT_VALID_COORDINATES: 0,
    WINDOW_EDGE_OUTSIDE_ACQUISITION: 0,
  };
  for (const label of expected) {
    const stage = classifyBucketStage(label, posByLabel, window);
    bucketStageCounts[stage] += 1;
  }

  const gapIntervals: IntervalPositionGapDetail[] = [];
  let intervalsWithCenterGap = 0;
  let intervalsNeighborSupportOnly = 0;
  const intervalGapDetailByClass: Record<string, number> = {};

  for (const row of input.shadowIntervals) {
    const center = dateToBucketLabel(row.referenceTime);
    const v2 = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: shadowToQc(row, center),
      positions: input.positions,
      r1Obd: input.r1Obd,
      evidenceIdentity: { pinnedSnapshotHash: input.pinnedSnapshotHash },
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
    });
    const cause = mapUnassessableCauseFromVerdict(row, v2.reasonCodes, posByLabel, window);
    if (cause !== 'POSITION_GAP') continue;

    const centerGaps = classifySupportWindowGaps(center, posByLabel, window);
    const prev = bucketLabelMinusSeconds(center, 1);
    const next = bucketLabelPlusSeconds(center, 1);
    const prevGaps = classifySupportWindowGaps(prev, posByLabel, window);
    const nextGaps = classifySupportWindowGaps(next, posByLabel, window);
    const v2Class = classifyNoNumericDisjointV2(row, posByLabel, window);
    intervalGapDetailByClass[v2Class] = (intervalGapDetailByClass[v2Class] ?? 0) + 1;

    const centerStage = classifyBucketStage(center, posByLabel, window);
    const centerHasGap = centerGaps.length > 0;
    if (centerHasGap) intervalsWithCenterGap += 1;
    else if (prevGaps.length > 0 || nextGaps.length > 0) intervalsNeighborSupportOnly += 1;

    gapIntervals.push({
      referenceTimeIso: row.referenceTime.toISOString(),
      centerGapKinds: centerGaps,
      prevGapKinds: prevGaps,
      nextGapKinds: nextGaps,
      v2DisjointClass: v2Class,
      coverageCause: cause,
      centerBucketStage: centerStage,
      shadowNumeric: row.estimatedSpeedKmh != null && Number.isFinite(row.estimatedSpeedKmh),
      centerPositionState: posByLabel.get(center)?.positionState ?? null,
    });
  }

  const sorted = [...input.shadowIntervals].sort((a, b) => a.referenceTime.getTime() - b.referenceTime.getTime());
  const causeByIso = new Map(
    gapIntervals.map((g) => [g.referenceTimeIso, g] as const),
  );

  let longest = 0;
  let startIso: string | null = null;
  let endIso: string | null = null;
  let dominantStage: string | null = null;
  let longestRunStages: Record<string, number> = {};

  let i = 0;
  while (i < sorted.length) {
    const iso = sorted[i].referenceTime.toISOString();
    if (!causeByIso.has(iso)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (
      j < sorted.length &&
      isConsecutiveSecond(sorted[j - 1].referenceTime, sorted[j].referenceTime) &&
      causeByIso.has(sorted[j].referenceTime.toISOString())
    ) {
      j += 1;
    }
    const runLen = j - i;
    if (runLen > longest) {
      longest = runLen;
      startIso = sorted[i].referenceTime.toISOString();
      endIso = sorted[j - 1].referenceTime.toISOString();
      const stages: Record<string, number> = {};
      for (let k = i; k < j; k += 1) {
        const d = causeByIso.get(sorted[k].referenceTime.toISOString());
        const st = d?.centerBucketStage ?? 'unknown';
        stages[st] = (stages[st] ?? 0) + 1;
      }
      longestRunStages = stages;
      dominantStage = Object.entries(stages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
    i = j;
  }

  const sampleIntervals = gapIntervals.slice(0, 5);

  return {
    acquisitionWindow: window,
    expectedBucketCount: expected.length,
    bucketStageCounts,
    intervalPositionGapSeconds: gapIntervals.length,
    intervalsWithCenterGap,
    intervalsNeighborSupportOnly,
    intervalGapDetailByClass,
    longestPositionGapRun: {
      seconds: longest,
      startIso,
      endIso,
      dominantCenterStage: dominantStage,
    },
    longestPositionGapRunBucketStages: longestRunStages,
    sampleIntervals,
  };
}
