import { DI_V0_SPEED_QC_POLICY_V2 } from '../speed-qc/di-v0-speed-qc-policy.version';
import { DI_V0_SPEED_QC_REASON } from '../speed-qc/di-v0-speed-qc-reason-codes';
import { evaluateDiV0SpeedQcInterval } from '../speed-qc/evaluate-di-v0-speed-qc-interval';
import type { DiV0SpeedQcIntervalVerdict } from '../speed-qc/di-v0-speed-qc.types';
import type { DiV0TripSpeedQualityShadowRow } from './build-di-v0-trip-speed-quality-projection.v1';
import {
  classifyHoldTransitionDetail,
  classifyNoNumericDisjointV2,
  dateToBucketLabel,
  isConsecutiveSecond,
  type AcquisitionWindow,
  type PositionBucketSample,
} from './di-v0-p21-r3-forensic-classify';
function isContractualStationaryNullPath(row: DiV0TripSpeedQualityShadowRow): boolean {
  return (
    row.motionState === 'STATIONARY_SUPPORTED' &&
    row.speedEvidenceState === 'STATIONARY_BAND' &&
    row.estimatedSpeedKmh === null
  );
}

export type CoveragePrimaryPartition =
  | 'TRUSTED_NUMERIC'
  | 'NUMERIC_QC_WITHHELD'
  | 'ACCEPTED_STATIONARY_NULL'
  | 'NO_NUMERIC_SPEED';

export type UnassessableCauseBucket =
  | 'FROZEN_OR_UNRESOLVED_HOLD'
  | 'RELEASE_OR_TRANSITION'
  | 'MOVEMENT_SPEED_UNKNOWN'
  | 'POSITION_GAP'
  | 'ACQUISITION_EDGE_SUPPORT'
  | 'SUPPORT_WINDOW_COMPROMISED'
  | 'CROSS_SOURCE_CONFLICT'
  | 'OTHER';

export type PartitionedInterval = {
  referenceTimeIso: string;
  primary: CoveragePrimaryPartition;
  unassessableCause: UnassessableCauseBucket | null;
  overlapFlags: string[];
  shadowNumeric: boolean;
  v2TrustLevel: DiV0SpeedQcIntervalVerdict['trustLevel'];
  v2ReasonCodes: string[];
};

export type TripIntervalPartitionSummary = {
  intervalCount: number;
  /** 1-second grid assumption when shadow rows are one per UTC second. */
  gridAssumption: 'ONE_ROW_PER_UTC_SECOND';
  primarySeconds: Record<CoveragePrimaryPartition, number>;
  primaryPercent: Record<CoveragePrimaryPartition, number | null>;
  unassessableCauseSeconds: Record<UnassessableCauseBucket, number>;
  overlapFlagCounts: Record<string, number>;
  numericCoveragePercent: number | null;
  trustedNumericCoveragePercent: number | null;
  acceptedStationarySeconds: number;
  longestUnassessableRunSeconds: number;
  longestUnassessableCause: UnassessableCauseBucket | 'MIXED' | null;
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

function mapUnassessableCause(
  row: DiV0TripSpeedQualityShadowRow,
  v2: DiV0SpeedQcIntervalVerdict,
  posByLabel: Map<string, PositionBucketSample>,
  window: AcquisitionWindow,
): UnassessableCauseBucket {
  if (v2.reasonCodes.includes(DI_V0_SPEED_QC_REASON.CROSS_SOURCE_CONFLICT)) {
    return 'CROSS_SOURCE_CONFLICT';
  }
  if (v2.reasonCodes.includes(DI_V0_SPEED_QC_REASON.SUPPORT_WINDOW_COMPROMISED)) {
    return 'SUPPORT_WINDOW_COMPROMISED';
  }
  const v2Class = classifyNoNumericDisjointV2(row, posByLabel, window);
  if (v2Class.startsWith('POS_GAP_WINDOW_EDGE_OUTSIDE_ACQUISITION')) {
    return 'ACQUISITION_EDGE_SUPPORT';
  }
  if (v2Class.startsWith('POS_GAP_')) {
    return 'POSITION_GAP';
  }
  const hold = classifyHoldTransitionDetail(row, posByLabel);
  if (hold === 'CENTER_FROZEN_UNRESOLVED' || hold === 'CENTER_FROZEN_MOVEMENT_SUPPORTED' || hold === 'CENTER_FROZEN_STOP_SUPPORTED') {
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

function classifyPrimary(
  row: DiV0TripSpeedQualityShadowRow,
  v2: DiV0SpeedQcIntervalVerdict,
): CoveragePrimaryPartition {
  const shadowNumeric = row.estimatedSpeedKmh != null && Number.isFinite(row.estimatedSpeedKmh);
  const acceptedStationary =
    v2.reasonCodes.includes(DI_V0_SPEED_QC_REASON.OK_STATIONARY_NULL_SPEED) &&
    isContractualStationaryNullPath(row);
  if (v2.trustLevel === 'TRUSTED' && v2.qcTrustedSpeedKmh != null && Number.isFinite(v2.qcTrustedSpeedKmh)) {
    return 'TRUSTED_NUMERIC';
  }
  if (acceptedStationary) {
    return 'ACCEPTED_STATIONARY_NULL';
  }
  if (shadowNumeric) {
    return 'NUMERIC_QC_WITHHELD';
  }
  return 'NO_NUMERIC_SPEED';
}

function overlapFlags(row: DiV0TripSpeedQualityShadowRow, v2: DiV0SpeedQcIntervalVerdict): string[] {
  const flags: string[] = [];
  if (row.sourceRelation === 'CONFLICTING' || row.sourceRelation === 'CONFLICT_EXPLAINED') {
    flags.push('SHADOW_SOURCE_CONFLICT_MARKED');
  }
  if (v2.trustLevel === 'TRUSTED_LIMITED' && v2.qcTrustedSpeedKmh != null) {
    flags.push('TRUSTED_LIMITED_NON_STATIONARY_NUMERIC');
  }
  if (row.positionState === 'FROZEN_UNRESOLVED' && v2.trustLevel === 'TRUSTED') {
    flags.push('FROZEN_CENTER_WITH_TRUSTED_NUMERIC');
  }
  return flags;
}

export function partitionTripIntervalsV2(input: {
  shadowIntervals: DiV0TripSpeedQualityShadowRow[];
  positions: PositionBucketSample[];
  r1Obd: { bucketLabel: string; speedKmh: number | null }[];
  pinnedSnapshotHash: string;
  acquisitionWindow: AcquisitionWindow;
}): { intervals: PartitionedInterval[]; summary: TripIntervalPartitionSummary } {
  const posByLabel = new Map(input.positions.map((p) => [p.bucketLabel, p]));
  const intervals: PartitionedInterval[] = [];

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
    const primary = classifyPrimary(row, v2);
    const unassessableCause =
      primary === 'TRUSTED_NUMERIC' || primary === 'ACCEPTED_STATIONARY_NULL'
        ? null
        : mapUnassessableCause(row, v2, posByLabel, input.acquisitionWindow);
    intervals.push({
      referenceTimeIso: row.referenceTime.toISOString(),
      primary,
      unassessableCause,
      overlapFlags: overlapFlags(row, v2),
      shadowNumeric: row.estimatedSpeedKmh != null && Number.isFinite(row.estimatedSpeedKmh),
      v2TrustLevel: v2.trustLevel,
      v2ReasonCodes: [...v2.reasonCodes],
    });
  }

  const n = intervals.length;
  const primarySeconds: Record<CoveragePrimaryPartition, number> = {
    TRUSTED_NUMERIC: 0,
    NUMERIC_QC_WITHHELD: 0,
    ACCEPTED_STATIONARY_NULL: 0,
    NO_NUMERIC_SPEED: 0,
  };
  const unassessableCauseSeconds: Record<UnassessableCauseBucket, number> = {
    FROZEN_OR_UNRESOLVED_HOLD: 0,
    RELEASE_OR_TRANSITION: 0,
    MOVEMENT_SPEED_UNKNOWN: 0,
    POSITION_GAP: 0,
    ACQUISITION_EDGE_SUPPORT: 0,
    SUPPORT_WINDOW_COMPROMISED: 0,
    CROSS_SOURCE_CONFLICT: 0,
    OTHER: 0,
  };
  const overlapFlagCounts: Record<string, number> = {};
  let numericCount = 0;
  let trustedNumericCount = 0;

  for (const it of intervals) {
    primarySeconds[it.primary] += 1;
    if (it.shadowNumeric) numericCount += 1;
    if (it.primary === 'TRUSTED_NUMERIC') trustedNumericCount += 1;
    if (it.unassessableCause) unassessableCauseSeconds[it.unassessableCause] += 1;
    for (const f of it.overlapFlags) {
      overlapFlagCounts[f] = (overlapFlagCounts[f] ?? 0) + 1;
    }
  }

  const pct = (x: number) => (n > 0 ? Math.round((x / n) * 1000) / 10 : null);
  const primaryPercent: Record<CoveragePrimaryPartition, number | null> = {
    TRUSTED_NUMERIC: pct(primarySeconds.TRUSTED_NUMERIC),
    NUMERIC_QC_WITHHELD: pct(primarySeconds.NUMERIC_QC_WITHHELD),
    ACCEPTED_STATIONARY_NULL: pct(primarySeconds.ACCEPTED_STATIONARY_NULL),
    NO_NUMERIC_SPEED: pct(primarySeconds.NO_NUMERIC_SPEED),
  };

  const sorted = [...input.shadowIntervals].sort((a, b) => a.referenceTime.getTime() - b.referenceTime.getTime());
  const byTime = new Map(intervals.map((i) => [i.referenceTimeIso, i]));
  let longest = 0;
  let longestCause: UnassessableCauseBucket | 'MIXED' | null = null;
  let i = 0;
  while (i < sorted.length) {
    const t0 = sorted[i].referenceTime.toISOString();
    const part = byTime.get(t0);
    const isUnassessable =
      part &&
      (part.primary === 'NO_NUMERIC_SPEED' || part.primary === 'NUMERIC_QC_WITHHELD');
    if (!isUnassessable || !part) {
      i += 1;
      continue;
    }
    const cause0 = part.unassessableCause ?? 'OTHER';
    let j = i + 1;
    let mixed = false;
    while (j < sorted.length) {
      const prev = sorted[j - 1];
      const cur = sorted[j];
      if (!isConsecutiveSecond(prev.referenceTime, cur.referenceTime)) break;
      const p = byTime.get(cur.referenceTime.toISOString());
      if (!p || (p.primary !== 'NO_NUMERIC_SPEED' && p.primary !== 'NUMERIC_QC_WITHHELD')) break;
      if (p.unassessableCause !== cause0) mixed = true;
      j += 1;
    }
    const runLen = j - i;
    if (runLen > longest) {
      longest = runLen;
      longestCause = mixed ? 'MIXED' : cause0;
    }
    i = j;
  }

  const summary: TripIntervalPartitionSummary = {
    intervalCount: n,
    gridAssumption: 'ONE_ROW_PER_UTC_SECOND',
    primarySeconds,
    primaryPercent,
    unassessableCauseSeconds,
    overlapFlagCounts,
    numericCoveragePercent: pct(numericCount),
    trustedNumericCoveragePercent: pct(trustedNumericCount),
    acceptedStationarySeconds: primarySeconds.ACCEPTED_STATIONARY_NULL,
    longestUnassessableRunSeconds: longest,
    longestUnassessableCause: longest > 0 ? longestCause : null,
  };

  return { intervals, summary };
}

export type AccelBrakeReadinessSummary = {
  trustedNumericSeconds: number;
  longestTrustedNumericRunSeconds: number;
  trustedRunsGte30s: number;
  /** Adjacent TRUSTED samples on 1s grid — not independent estimates. */
  independenceCaveat: string;
  gapsBreakingTrustedRuns: number;
};

export function summarizeAccelBrakeReadiness(
  shadowIntervals: DiV0TripSpeedQualityShadowRow[],
  partitioned: PartitionedInterval[],
): AccelBrakeReadinessSummary {
  const byTime = new Map(partitioned.map((p) => [p.referenceTimeIso, p]));
  const sorted = [...shadowIntervals].sort((a, b) => a.referenceTime.getTime() - b.referenceTime.getTime());
  let trustedSeconds = 0;
  let longest = 0;
  let cur = 0;
  let runsGte30 = 0;
  let gapsBreaking = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const iso = sorted[i].referenceTime.toISOString();
    const part = byTime.get(iso);
    const trusted = part?.primary === 'TRUSTED_NUMERIC';
    if (trusted) {
      trustedSeconds += 1;
      if (i > 0 && !isConsecutiveSecond(sorted[i - 1].referenceTime, sorted[i].referenceTime)) {
        gapsBreaking += 1;
        if (cur >= 30) runsGte30 += 1;
        longest = Math.max(longest, cur);
        cur = 1;
      } else {
        cur += 1;
      }
    } else if (cur > 0) {
      if (cur >= 30) runsGte30 += 1;
      longest = Math.max(longest, cur);
      cur = 0;
    }
  }
  if (cur > 0) {
    if (cur >= 30) runsGte30 += 1;
    longest = Math.max(longest, cur);
  }
  return {
    trustedNumericSeconds: trustedSeconds,
    longestTrustedNumericRunSeconds: longest,
    trustedRunsGte30s: runsGte30,
    independenceCaveat:
      'Speed estimates on consecutive 1s shadow rows share L3 support windows; do not treat adjacent TRUSTED numeric seconds as independent for acceleration.',
    gapsBreakingTrustedRuns: gapsBreaking,
  };
}
