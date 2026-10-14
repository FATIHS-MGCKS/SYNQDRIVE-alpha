import { evaluateDiV0SpeedQcInterval } from '../speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_REASON } from '../speed-qc/di-v0-speed-qc-reason-codes';
import {
  bucketLabelMinusSeconds,
  bucketLabelPlusSeconds,
  haversineMeters,
} from '../speed-qc/di-v0-speed-qc-geo';
import type { DiV0TripSpeedQualityShadowRow } from './build-di-v0-trip-speed-quality-projection.v1';
import type { DiV0TripSpeedQualityEvidenceBundle } from './di-v0-trip-speed-quality-evidence';
import type { DiV0TripSpeedQualityProjectionV1 } from './di-v0-trip-speed-quality-projection.types';
import {
  buildTimeSegmentStats,
  classifyHoldTransitionDetail,
  classifyNoNumericDisjointV1,
  classifyNoNumericDisjointV2,
  countPositionBucketAvailability,
  crossTabKey,
  dateToBucketLabel,
  diagnosePositionGapAtLabel,
  isConsecutiveSecond,
  type AcquisitionWindow,
  type PositionBucketSample,
} from './di-v0-p21-r3-forensic-classify';

export type ForensicReplayMode = 'ACTIVE_PRIMARY' | 'HISTORICAL_PINNED';

export function buildP21R3ForensicReport(input: {
  replayMode: ForensicReplayMode;
  workItemStatus: string;
  activePrimaryWorkItemId: string | null;
  requestedWorkItemId: string;
  shadowRun: {
    id: string;
    calibrationVersion: string;
    inputEvidenceVersion: string | null;
  };
  acquisitionWindow: AcquisitionWindow;
  evidence: DiV0TripSpeedQualityEvidenceBundle;
  shadowIntervals: DiV0TripSpeedQualityShadowRow[];
  projection: DiV0TripSpeedQualityProjectionV1;
  pinnedSnapshotHash: string;
}): Record<string, unknown> {
  const posByLabel = new Map(input.evidence.positions.map((p) => [p.bucketLabel, p]));
  const window = input.acquisitionWindow;

  const bucketStats = countPositionBucketAvailability(posByLabel, window);
  let edgeOutsideSupportHits = 0;
  for (const row of input.shadowIntervals) {
    const center = dateToBucketLabel(row.referenceTime);
    const prev = bucketLabelMinusSeconds(center, 1);
    const next = bucketLabelPlusSeconds(center, 1);
    for (const label of [prev, center, next]) {
      if (diagnosePositionGapAtLabel(label, posByLabel, window) === 'WINDOW_EDGE_OUTSIDE_ACQUISITION') {
        edgeOutsideSupportHits += 1;
        break;
      }
    }
  }
  bucketStats.edgeOutsideWindowSupportHits = edgeOutsideSupportHits;

  const noNumericRows = input.shadowIntervals.filter(
    (r) => r.estimatedSpeedKmh == null || !Number.isFinite(r.estimatedSpeedKmh),
  );

  const v1: Record<string, number> = {};
  const v2: Record<string, number> = {};
  const holdDetail: Record<string, number> = {};
  const crossTab: Record<string, number> = {};

  for (const r of noNumericRows) {
    const g1 = classifyNoNumericDisjointV1(r, posByLabel);
    v1[g1] = (v1[g1] ?? 0) + 1;
    const g2 = classifyNoNumericDisjointV2(r, posByLabel, window);
    v2[g2] = (v2[g2] ?? 0) + 1;
    const hd = classifyHoldTransitionDetail(r, posByLabel);
    holdDetail[hd] = (holdDetail[hd] ?? 0) + 1;
    const ct = crossTabKey(r, posByLabel, window);
    crossTab[ct] = (crossTab[ct] ?? 0) + 1;
  }

  const v1Segments: Record<string, ReturnType<typeof buildTimeSegmentStats>> = {};
  const v2Segments: Record<string, ReturnType<typeof buildTimeSegmentStats>> = {};
  const holdSegments: Record<string, ReturnType<typeof buildTimeSegmentStats>> = {};

  const sorted = [...input.shadowIntervals].sort(
    (a, b) => a.referenceTime.getTime() - b.referenceTime.getTime(),
  );

  function accumulateSegments(
    map: Record<string, ReturnType<typeof buildTimeSegmentStats>>,
    classFn: (r: DiV0TripSpeedQualityShadowRow) => string,
  ): void {
    const labeled: Array<{ referenceTime: Date; classLabel: string }> = [];
    for (const r of sorted) {
      if (r.estimatedSpeedKmh != null && Number.isFinite(r.estimatedSpeedKmh)) continue;
      labeled.push({ referenceTime: r.referenceTime, classLabel: classFn(r) });
    }
    let i = 0;
    while (i < labeled.length) {
      const classLabel = labeled[i].classLabel;
      let j = i + 1;
      while (
        j < labeled.length &&
        labeled[j].classLabel === classLabel &&
        isConsecutiveSecond(labeled[j - 1].referenceTime, labeled[j].referenceTime)
      ) {
        j += 1;
      }
      const runLen = j - i;
      const prev = map[classLabel] ?? { segmentCount: 0, longestRunSeconds: 0, totalSeconds: 0 };
      map[classLabel] = {
        segmentCount: prev.segmentCount + 1,
        longestRunSeconds: Math.max(prev.longestRunSeconds, runLen),
        totalSeconds: prev.totalSeconds + runLen,
      };
      i = j;
    }
  }

  accumulateSegments(v1Segments, (r) => classifyNoNumericDisjointV1(r, posByLabel));
  accumulateSegments(v2Segments, (r) => classifyNoNumericDisjointV2(r, posByLabel, window));
  accumulateSegments(holdSegments, (r) => classifyHoldTransitionDetail(r, posByLabel));

  const intervalsWithInternalGap = noNumericRows.filter((r) => {
    const g2 = classifyNoNumericDisjointV2(r, posByLabel, window);
    return g2.startsWith('POS_GAP_') && !g2.includes('WINDOW_EDGE');
  }).length;

  const intervalsWithEdgeGap = noNumericRows.filter((r) => {
    const g2 = classifyNoNumericDisjointV2(r, posByLabel, window);
    return g2.includes('WINDOW_EDGE_OUTSIDE_ACQUISITION');
  }).length;

  const longestHoldRun = findLongestContiguousRun(
    sorted,
    (r) =>
      (r.estimatedSpeedKmh == null || !Number.isFinite(r.estimatedSpeedKmh)) &&
      classifyNoNumericDisjointV1(r, posByLabel) === 'TRANSITION_RELEASE_OR_UNRESOLVED_HOLD',
  );

  let postGapReachable = 0;
  let postGapOvershadowed = 0;
  for (const r of input.shadowIntervals) {
    if (r.estimatedSpeedKmh == null) continue;
    const center = dateToBucketLabel(r.referenceTime);
    const verdict = evaluateDiV0SpeedQcInterval({
      centerBucketLabel: center,
      shadow: shadowToQc(r, center),
      positions: input.evidence.positions,
      r1Obd: input.evidence.r1Obd,
      evidenceIdentity: { pinnedSnapshotHash: input.pinnedSnapshotHash },
    });
    if (verdict.reasonCodes.includes(DI_V0_SPEED_QC_REASON.POST_GAP_REACQUIRE)) {
      postGapReachable += 1;
    } else if (
      r.sourceQualityFlags.includes('L3_SUPPORT_CROSSES_GAP') &&
      verdict.reasonCodes.includes(DI_V0_SPEED_QC_REASON.GEOMETRY_JUMP)
    ) {
      postGapOvershadowed += 1;
    }
  }

  const stationary144 = noNumericRows.filter(
    (r) => r.motionState === 'STATIONARY_SUPPORTED' && r.speedEvidenceState === 'STATIONARY_BAND',
  );
  const stationaryInV1Fresh = stationary144.filter(
    (r) => classifyNoNumericDisjointV1(r, posByLabel) === 'STATIONARY_WITH_FRESH_POSITIONS',
  ).length;
  const movingUnknown33 = noNumericRows.filter((r) => r.motionState === 'MOVING_SPEED_UNKNOWN').length;

  return {
    schema: 'EXP021_P21_R3A_FORENSIC_V2',
    replayMode: input.replayMode,
    workItemStatus: input.workItemStatus,
    activePrimaryWorkItemId: input.activePrimaryWorkItemId,
    requestedWorkItemId: input.requestedWorkItemId,
    shadowRun: input.shadowRun,
    intervalCount: input.shadowIntervals.length,
    reproducedQuality: input.projection.quality,
    reproducedSpeed: {
      shadowRawMaxKmh: input.projection.speed.shadowRawMaxKmh,
      qcTrustedMaxKmh: input.projection.speed.qcTrustedMaxKmh,
    },
    positionBucketStats: bucketStats,
    noNumericTotal: noNumericRows.length,
    noNumericDisjointV1: v1,
    noNumericDisjointV1Sum: Object.values(v1).reduce((a, b) => a + b, 0),
    noNumericDisjointV2: v2,
    noNumericDisjointV2Sum: Object.values(v2).reduce((a, b) => a + b, 0),
    holdTransitionDetailBreakdown: holdDetail,
    holdTransitionDetailSegmentStats: holdSegments,
    noNumericV1SegmentStats: v1Segments,
    noNumericV2SegmentStats: v2Segments,
    crossTabTop: topEntries(crossTab, 25),
    crossTabDistinctKeys: Object.keys(crossTab).length,
    intervalsAffectedByInternalPositionGaps: intervalsWithInternalGap,
    intervalsWithAcquisitionEdgeSupportGap: intervalsWithEdgeGap,
    stationary144Crosscheck: {
      total: stationary144.length,
      inV1StationaryWithFreshPositions: stationaryInV1Fresh,
      inV1TransitionDueToNeighborHold: stationary144.length - stationaryInV1Fresh,
      holdDetailCounts: countBy(stationary144, (r) => classifyHoldTransitionDetail(r, posByLabel)),
    },
    movingSpeedUnknownInNoNumeric: movingUnknown33,
    longestTransitionV1Segment: longestHoldRun
      ? analyzeSegment(longestHoldRun, posByLabel, input.evidence.r1Obd)
      : null,
    postGapControlFlow: {
      reachableOnThisTripNumericIntervals: postGapReachable,
      overshadowedByEarlierGeometryJumpWithCrossesGapFlag: postGapOvershadowed,
      verdict:
        postGapReachable === 0
          ? 'STRUCTURALLY_OVERSHADOWED_IN_POLICY_V1_L3_SUPPORT_CROSSES_GAP_TRIGGERS_SUPPORT_WINDOW_COMPROMISED_BEFORE_POST_GAP_BRANCH_GEOMETRY_JUMP_ALSO_PRECEDES_DUPLICATE_LEG_THRESHOLD'
          : 'OBSERVED',
    },
    acquisitionWindow: window,
    r1BucketCount: input.evidence.r1Obd.length,
  };
}

function countBy<T>(rows: T[], fn: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = fn(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function topEntries(map: Record<string, number>, n: number): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function shadowToQc(r: DiV0TripSpeedQualityShadowRow, center: string) {
  return {
    intervalStart: center,
    intervalEnd: center,
    referenceTime: center,
    estimatedSpeedKmh: r.estimatedSpeedKmh,
    speedEvidenceState: (r.speedEvidenceState ?? 'NONE') as 'NONE',
    valueConfidence: r.valueConfidence as 'HIGH',
    sourceRelation: r.sourceRelation as never,
    motionState: r.motionState as never,
    positionState: r.positionState as never,
    abstentionReason: r.abstentionReason,
    sourceQualityFlags: Array.isArray(r.sourceQualityFlags) ? r.sourceQualityFlags.map(String) : [],
    evidenceSources: [],
  };
}

function findLongestContiguousRun(
  sorted: DiV0TripSpeedQualityShadowRow[],
  include: (r: DiV0TripSpeedQualityShadowRow) => boolean,
): DiV0TripSpeedQualityShadowRow[] | null {
  let best: DiV0TripSpeedQualityShadowRow[] = [];
  let cur: DiV0TripSpeedQualityShadowRow[] = [];
  for (const r of sorted) {
    if (!include(r)) {
      if (cur.length > best.length) best = cur;
      cur = [];
      continue;
    }
    if (
      cur.length === 0 ||
      r.referenceTime.getTime() - cur[cur.length - 1].referenceTime.getTime() === 1000
    ) {
      cur.push(r);
    } else {
      if (cur.length > best.length) best = cur;
      cur = [r];
    }
  }
  if (cur.length > best.length) best = cur;
  return best.length > 0 ? best : null;
}

function analyzeSegment(
  rows: DiV0TripSpeedQualityShadowRow[],
  posByLabel: Map<string, PositionBucketSample>,
  r1Obd: { bucketLabel: string; speedKmh: number | null }[],
): Record<string, unknown> {
  const start = dateToBucketLabel(rows[0].referenceTime);
  const end = dateToBucketLabel(rows[rows.length - 1].referenceTime);
  const startBerlin = formatBerlin(start);
  const endBerlin = formatBerlin(end);
  const coordKeys = new Set<string>();
  let maxIdenticalRun = 0;
  let curIdentical = 0;
  let prevKey: string | null = null;
  const positionStateSeq: string[] = [];
  const motionSeq: string[] = [];
  let releaseJumps: Array<{ label: string; meters: number }> = [];

  for (const r of rows) {
    const label = dateToBucketLabel(r.referenceTime);
    positionStateSeq.push(`${label}:${r.positionState}`);
    motionSeq.push(`${label}:${r.motionState}`);
    const p = posByLabel.get(label);
    const key =
      p?.latitude != null && p?.longitude != null
        ? `${p.latitude.toFixed(7)},${p.longitude.toFixed(7)}`
        : 'NO_COORD';
    coordKeys.add(key);
    if (key === prevKey) {
      curIdentical += 1;
      maxIdenticalRun = Math.max(maxIdenticalRun, curIdentical);
    } else {
      curIdentical = 1;
      prevKey = key;
    }
    if (r.positionState === 'RELEASE' && p?.latitude != null && p?.longitude != null) {
      const prev = posByLabel.get(bucketLabelMinusSeconds(label, 1));
      if (prev?.latitude != null && prev?.longitude != null) {
        releaseJumps.push({
          label,
          meters: Math.round(haversineMeters(prev.latitude, prev.longitude, p.latitude, p.longitude)),
        });
      }
    }
  }

  const r1InSegment = r1Obd.filter((x) => {
    const ms = Date.parse(x.bucketLabel);
    return ms >= rows[0].referenceTime.getTime() && ms <= rows[rows.length - 1].referenceTime.getTime();
  });

  const centerSample = rows[Math.floor(rows.length / 2)];
  const abstentionSample = centerSample.abstentionReason;

  return {
    durationSeconds: rows.length,
    utcStart: start,
    utcEnd: end,
    europeBerlinStart: startBerlin,
    europeBerlinEnd: endBerlin,
    distinctCoordinateKeys: coordKeys.size,
    longestIdenticalCoordinateRunSeconds: maxIdenticalRun,
    releaseDisplacementSamples: releaseJumps.slice(0, 5),
    r1BucketsInSegment: r1InSegment.length,
    r1SpeedSample: r1InSegment.slice(0, 5),
    dominantMotionStates: summarizeCounts(rows.map((r) => r.motionState)),
    dominantPositionStates: summarizeCounts(rows.map((r) => r.positionState)),
    sampleAbstentionReason: abstentionSample,
    s1NumericSpeedRule:
      'estimatedSpeedKmh only when motionState=MOVING_SPEED_ESTIMATED and L3 eligible; hold/frozen/release/transition → null',
    interpretationNote:
      'Identical coordinates are an observed position property; physical stop vs provider fault not inferred without independent ground truth.',
    motionPositionSample: {
      first: { motion: rows[0].motionState, position: rows[0].positionState },
      mid: { motion: centerSample.motionState, position: centerSample.positionState },
      last: { motion: rows[rows.length - 1].motionState, position: rows[rows.length - 1].positionState },
    },
  };
}

function summarizeCounts(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function formatBerlin(isoZ: string): string {
  return new Date(isoZ).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin', hour12: false }) + ' Europe/Berlin';
}
