import type { DiV0TripSpeedQualityShadowRow } from './build-di-v0-trip-speed-quality-projection.v1';
import { bucketLabelMinusSeconds, bucketLabelPlusSeconds } from '../speed-qc/di-v0-speed-qc-geo';
import {
  classifySupportWindowGaps,
  dateToBucketLabel,
  enumerateAcquisitionBucketLabels,
  isConsecutiveSecond,
  labelInAcquisitionWindow,
  type AcquisitionWindow,
  type PositionBucketSample,
} from './di-v0-p21-r3-forensic-classify';
import {
  type IntervalPositionGapDetail,
  mapUnassessableCauseFromVerdict,
  classifyBucketStage,
} from './di-v0-exp021-position-gap-forensic';
import { evaluateDiV0SpeedQcInterval } from '../speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../speed-qc/di-v0-speed-qc-policy.version';
import { classifyNoNumericDisjointV2 } from './di-v0-p21-r3-forensic-classify';

export const EXP021_ROW_ABSENT_CREATION_RULE = {
  stage: 'S3A_position_normalization_at_acquisition',
  codePath:
    'normalizeDiV0PositionResponse → empty provider rows for grid index → availability ROW_ABSENT (EXPECTED_GRID_ROW_ABSENT)',
  pinnedReadPath:
    'parseDiV0PositionSnapshot → material.buckets[].availability (sealed in POSITION channel payload)',
  note:
    'Forensics observe ROW_ABSENT in pinned snapshot; upstream provider fetch is not re-executed in read-only analysis.',
};

export type PinPositionCounts = {
  halfOpenWindow: { startInclusive: string; endExclusive: string; inclusiveEndMark: string };
  expectedLabelsInWindow: number;
  presentValidCoordinates: number;
  rowAbsentExplicit: number;
  signalNullExplicit: number;
  invalidCoordinates: number;
  missingFromPositionMap: number;
  labelsOutsideAcquisitionWindow: number;
};

/** Inclusive last second mark → half-open `[start, endExclusive)`. */
export function halfOpenWindowFromInclusiveEnd(startInclusive: string, endInclusive: string): {
  startInclusive: string;
  endExclusive: string;
} {
  return {
    startInclusive,
    endExclusive: bucketLabelPlusSeconds(endInclusive, 1),
  };
}

export function countPinPositionStatesInWindow(
  positions: PositionBucketSample[],
  startInclusive: string,
  endInclusive: string,
  acquisitionWindow: AcquisitionWindow,
): PinPositionCounts {
  const { endExclusive } = halfOpenWindowFromInclusiveEnd(startInclusive, endInclusive);
  const subWindow: AcquisitionWindow = { startLabel: startInclusive, endLabel: endExclusive };
  const posByLabel = new Map(positions.map((p) => [p.bucketLabel, p]));
  const expected = enumerateAcquisitionBucketLabels(subWindow);
  let presentValidCoordinates = 0;
  let rowAbsentExplicit = 0;
  let signalNullExplicit = 0;
  let invalidCoordinates = 0;
  let missingFromPositionMap = 0;
  let labelsOutsideAcquisitionWindow = 0;
  for (const label of expected) {
    if (!labelInAcquisitionWindow(label, acquisitionWindow)) {
      labelsOutsideAcquisitionWindow += 1;
    }
    const stage = classifyBucketStage(label, posByLabel, acquisitionWindow);
    switch (stage) {
      case 'PRESENT_VALID_COORDINATES':
        presentValidCoordinates += 1;
        break;
      case 'ROW_ABSENT_EXPLICIT':
        rowAbsentExplicit += 1;
        break;
      case 'SIGNAL_NULL_EXPLICIT':
        signalNullExplicit += 1;
        break;
      case 'INVALID_COORDINATES':
        invalidCoordinates += 1;
        break;
      case 'EXPECTED_BUCKET_ABSENT_FROM_SNAPSHOT_MAP':
        missingFromPositionMap += 1;
        break;
      default:
        break;
    }
  }
  return {
    halfOpenWindow: {
      startInclusive,
      endExclusive,
      inclusiveEndMark: endInclusive,
    },
    expectedLabelsInWindow: expected.length,
    presentValidCoordinates,
    rowAbsentExplicit,
    signalNullExplicit,
    invalidCoordinates,
    missingFromPositionMap,
    labelsOutsideAcquisitionWindow,
  };
}

export type ShadowGridDiagnostics = {
  shadowIntervalCount: number;
  nonSecondAlignedReferenceTimes: number;
  duplicateCenterLabelCount: number;
  duplicateCenterLabelExtraRows: number;
  nonConsecutiveShadowPairs: number;
  shadowFirstLabel: string | null;
  shadowLastLabel: string | null;
  acquisitionExpectedBucketCount: number;
  shadowLabelsOutsideAcquisitionWindow: number;
};

export type BucketIntervalReconciliation = {
  rowAbsentBucketsInAcquisitionWindow: number;
  positionGapIntervalSeconds: number;
  uniqueCenterLabelsAmongPositionGapIntervals: number;
  positionGapIntervalsWithCenterRowAbsent: number;
  positionGapIntervalsWithPresentCenterNeighborRowAbsent: number;
  positionGapIntervalsWithPresentCenterOtherNeighborGap: number;
  duplicateIntervalRowsOnRowAbsentCenters: number;
  rowAbsentBucketsWithZeroPositionGapIntervals: number;
  rowAbsentBucketsWithMultiplePositionGapIntervals: number;
  maxPositionGapIntervalsPerRowAbsentBucket: number;
  positionGapIntervalsWithCenterOutsideAcquisition: number;
  exactReconciliationFormula: string;
  provenMechanismFor2966Vs3040: string | null;
};

export type PositionGapIntervalExportRow = IntervalPositionGapDetail & {
  intervalIndex: number;
  centerBucketLabel: string;
  supportBucketLabels: { prev: string; center: string; next: string };
  centerAvailabilityInPin: PositionBucketSample['availability'] | 'MAP_MISSING';
  diagnosisOrigin: {
    coverageCauseCodePath: 'di-v0-exp021-position-gap-forensic.mapUnassessableCauseFromVerdict';
    v2DisjointCodePath: 'di-v0-p21-r3-forensic-classify.classifyNoNumericDisjointV2';
    supportGapCodePath: 'di-v0-p21-r3-forensic-classify.classifySupportWindowGaps';
    bucketStageCodePath: 'di-v0-exp021-position-gap-forensic.classifyBucketStage';
  };
};

export type BucketIntervalAlignmentReport = {
  shadowGrid: ShadowGridDiagnostics;
  reconciliation: BucketIntervalReconciliation;
  positionGapIntervalExports: PositionGapIntervalExportRow[];
  intervalUniqueness: {
    intervalIdScheme: 'shadow_row_index_sorted_by_reference_time';
    centerLabelUnique: boolean;
    centerLabelsColliding: Array<{ centerLabel: string; intervalRowCount: number }>;
  };
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

export function buildBucketIntervalAlignmentReport(input: {
  shadowIntervals: DiV0TripSpeedQualityShadowRow[];
  positions: PositionBucketSample[];
  r1Obd: { bucketLabel: string; speedKmh: number | null }[];
  pinnedSnapshotHash: string;
  acquisitionWindow: AcquisitionWindow;
}): BucketIntervalAlignmentReport {
  const posByLabel = new Map(input.positions.map((p) => [p.bucketLabel, p]));
  const window = input.acquisitionWindow;
  const expected = enumerateAcquisitionBucketLabels(window);

  let rowAbsentBucketsInAcquisitionWindow = 0;
  for (const label of expected) {
    const row = posByLabel.get(label);
    if (row?.availability === 'ROW_ABSENT') rowAbsentBucketsInAcquisitionWindow += 1;
  }

  const sorted = [...input.shadowIntervals].sort((a, b) => a.referenceTime.getTime() - b.referenceTime.getTime());
  let nonSecondAligned = 0;
  const centerCounts = new Map<string, number>();
  let nonConsecutive = 0;
  let outsideAcq = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const center = dateToBucketLabel(sorted[i].referenceTime);
    if (center !== sorted[i].referenceTime.toISOString().replace(/\.\d{3}Z$/, 'Z')) {
      nonSecondAligned += 1;
    }
    centerCounts.set(center, (centerCounts.get(center) ?? 0) + 1);
    if (!labelInAcquisitionWindow(center, window)) outsideAcq += 1;
    if (i > 0 && !isConsecutiveSecond(sorted[i - 1].referenceTime, sorted[i].referenceTime)) {
      nonConsecutive += 1;
    }
  }

  let duplicateExtra = 0;
  let duplicateLabelKinds = 0;
  const colliding: Array<{ centerLabel: string; intervalRowCount: number }> = [];
  for (const [label, count] of centerCounts) {
    if (count > 1) {
      duplicateLabelKinds += 1;
      duplicateExtra += count - 1;
      colliding.push({ centerLabel: label, intervalRowCount: count });
    }
  }
  colliding.sort((a, b) => b.intervalRowCount - a.intervalRowCount);

  const positionGapIntervalExports: PositionGapIntervalExportRow[] = [];
  const gapCenterLabels = new Map<string, number>();
  const rowAbsentBucketToGapIntervals = new Map<string, number>();

  for (let idx = 0; idx < sorted.length; idx += 1) {
    const row = sorted[idx];
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
    const centerStage = classifyBucketStage(center, posByLabel, window);
    const centerRow = posByLabel.get(center);

    positionGapIntervalExports.push({
      intervalIndex: idx,
      referenceTimeIso: row.referenceTime.toISOString(),
      centerBucketLabel: center,
      supportBucketLabels: { prev, center, next },
      centerAvailabilityInPin: centerRow?.availability ?? 'MAP_MISSING',
      centerGapKinds: centerGaps,
      prevGapKinds: prevGaps,
      nextGapKinds: nextGaps,
      v2DisjointClass: v2Class,
      coverageCause: cause,
      centerBucketStage: centerStage,
      shadowNumeric: row.estimatedSpeedKmh != null && Number.isFinite(row.estimatedSpeedKmh),
      centerPositionState: centerRow?.positionState ?? null,
      diagnosisOrigin: {
        coverageCauseCodePath: 'di-v0-exp021-position-gap-forensic.mapUnassessableCauseFromVerdict',
        v2DisjointCodePath: 'di-v0-p21-r3-forensic-classify.classifyNoNumericDisjointV2',
        supportGapCodePath: 'di-v0-p21-r3-forensic-classify.classifySupportWindowGaps',
        bucketStageCodePath: 'di-v0-exp021-position-gap-forensic.classifyBucketStage',
      },
    });

    gapCenterLabels.set(center, (gapCenterLabels.get(center) ?? 0) + 1);
    if (centerRow?.availability === 'ROW_ABSENT' && labelInAcquisitionWindow(center, window)) {
      rowAbsentBucketToGapIntervals.set(center, (rowAbsentBucketToGapIntervals.get(center) ?? 0) + 1);
    }
  }

  let duplicateOnRowAbsent = 0;
  let bucketsWithMulti = 0;
  let bucketsWithZero = 0;
  let maxPerBucket = 0;
  for (const label of expected) {
    const row = posByLabel.get(label);
    if (row?.availability !== 'ROW_ABSENT') continue;
    const n = rowAbsentBucketToGapIntervals.get(label) ?? 0;
    if (n === 0) bucketsWithZero += 1;
    if (n > 1) {
      bucketsWithMulti += 1;
      duplicateOnRowAbsent += n - 1;
    }
    maxPerBucket = Math.max(maxPerBucket, n);
  }

  let gapOutsideAcq = 0;
  for (const g of positionGapIntervalExports) {
    if (!labelInAcquisitionWindow(g.centerBucketLabel, window)) gapOutsideAcq += 1;
  }

  const positionGapIntervalSeconds = positionGapIntervalExports.length;
  const uniqueCenters = gapCenterLabels.size;

  let withCenterRowAbsent = 0;
  let withPresentCenterNeighborRowAbsent = 0;
  let withPresentCenterOtherNeighborGap = 0;
  for (const g of positionGapIntervalExports) {
    if (g.centerAvailabilityInPin === 'ROW_ABSENT') {
      withCenterRowAbsent += 1;
      continue;
    }
    const neighborKinds = new Set([...g.prevGapKinds, ...g.nextGapKinds]);
    if (neighborKinds.has('ROW_ABSENT_EXPLICIT')) withPresentCenterNeighborRowAbsent += 1;
    else if (g.centerAvailabilityInPin === 'PRESENT') withPresentCenterOtherNeighborGap += 1;
  }

  let proven: string | null = null;
  if (
    positionGapIntervalSeconds === withCenterRowAbsent + withPresentCenterNeighborRowAbsent + withPresentCenterOtherNeighborGap &&
    withPresentCenterNeighborRowAbsent > 0 &&
    positionGapIntervalSeconds - rowAbsentBucketsInAcquisitionWindow === withPresentCenterNeighborRowAbsent
  ) {
    proven = `POSITION_GAP interval-seconds (${positionGapIntervalSeconds}) = center ROW_ABSENT intervals (${withCenterRowAbsent}) + intervals whose center bucket is PRESENT but t±1 support includes ROW_ABSENT (${withPresentCenterNeighborRowAbsent}). ROW_ABSENT acquisition buckets (${rowAbsentBucketsInAcquisitionWindow}) count grid labels only; they do not include neighbor-support-only POSITION_GAP seconds.`;
  } else if (
    positionGapIntervalSeconds > rowAbsentBucketsInAcquisitionWindow &&
    duplicateOnRowAbsent > 0
  ) {
    proven = `Extra POSITION_GAP interval-rows include ${duplicateOnRowAbsent} duplicate shadow rows on ROW_ABSENT center labels.`;
  } else if (positionGapIntervalSeconds === rowAbsentBucketsInAcquisitionWindow) {
    proven = 'One POSITION_GAP shadow interval per ROW_ABSENT acquisition bucket.';
  }

  const exactReconciliationFormula =
    'positionGapIntervalSeconds = intervals(centerAvailability=ROW_ABSENT) + intervals(center=PRESENT ∧ neighbor ROW_ABSENT in L3 support) + other POSITION_GAP (edge/null/invalid neighbor support)';

  return {
    shadowGrid: {
      shadowIntervalCount: sorted.length,
      nonSecondAlignedReferenceTimes: nonSecondAligned,
      duplicateCenterLabelCount: duplicateLabelKinds,
      duplicateCenterLabelExtraRows: duplicateExtra,
      nonConsecutiveShadowPairs: nonConsecutive,
      shadowFirstLabel: sorted[0] ? dateToBucketLabel(sorted[0].referenceTime) : null,
      shadowLastLabel: sorted.length
        ? dateToBucketLabel(sorted[sorted.length - 1].referenceTime)
        : null,
      acquisitionExpectedBucketCount: expected.length,
      shadowLabelsOutsideAcquisitionWindow: outsideAcq,
    },
    reconciliation: {
      rowAbsentBucketsInAcquisitionWindow,
      positionGapIntervalSeconds,
      uniqueCenterLabelsAmongPositionGapIntervals: uniqueCenters,
      positionGapIntervalsWithCenterRowAbsent: withCenterRowAbsent,
      positionGapIntervalsWithPresentCenterNeighborRowAbsent: withPresentCenterNeighborRowAbsent,
      positionGapIntervalsWithPresentCenterOtherNeighborGap: withPresentCenterOtherNeighborGap,
      duplicateIntervalRowsOnRowAbsentCenters: duplicateOnRowAbsent,
      rowAbsentBucketsWithZeroPositionGapIntervals: bucketsWithZero,
      rowAbsentBucketsWithMultiplePositionGapIntervals: bucketsWithMulti,
      maxPositionGapIntervalsPerRowAbsentBucket: maxPerBucket,
      positionGapIntervalsWithCenterOutsideAcquisition: gapOutsideAcq,
      exactReconciliationFormula,
      provenMechanismFor2966Vs3040: proven,
    },
    positionGapIntervalExports,
    intervalUniqueness: {
      intervalIdScheme: 'shadow_row_index_sorted_by_reference_time',
      centerLabelUnique: duplicateLabelKinds === 0,
      centerLabelsColliding: colliding.slice(0, 20),
    },
  };
}
