import { bucketLabelMinusSeconds, bucketLabelPlusSeconds, bucketLabelToMs } from '../speed-qc/di-v0-speed-qc-geo';
import { isValidGeoCoordinate } from '../speed-qc/di-v0-speed-qc-position-index';
import type { DiV0SpeedQcPositionSample } from '../speed-qc/di-v0-speed-qc.types';
import type { DiV0TripSpeedQualityShadowRow } from './build-di-v0-trip-speed-quality-projection.v1';

export type PositionBucketSample = DiV0SpeedQcPositionSample;

export type AcquisitionWindow = { startLabel: string; endLabel: string };

export type PositionGapKind =
  | 'WINDOW_EDGE_OUTSIDE_ACQUISITION'
  | 'MISSING_BUCKET_INSIDE_WINDOW'
  | 'ROW_ABSENT_EXPLICIT'
  | 'SIGNAL_NULL_EXPLICIT'
  | 'INVALID_COORDINATES';

export type NoNumericDisjointV1 =
  | 'ROW_ABSENT_OR_SIGNAL_NULL_GAP'
  | 'INVALID_POSITION_DATA'
  | 'INCOMPLETE_SUPPORT_WINDOW_EDGES'
  | 'TRANSITION_RELEASE_OR_UNRESOLVED_HOLD'
  | 'STATIONARY_WITH_FRESH_POSITIONS'
  | 'STATIONARY_HOLD_GEOMETRY_INDICATOR'
  | 'MOVEMENT_DETECTED_SPEED_NOT_ESTIMABLE'
  | 'OTHER_EXPLAINED';

export type HoldTransitionDetail =
  | 'CENTER_FROZEN_UNRESOLVED'
  | 'CENTER_FROZEN_MOVEMENT_SUPPORTED'
  | 'CENTER_FROZEN_STOP_SUPPORTED'
  | 'CENTER_RELEASE'
  | 'NEIGHBOR_HOLD_OR_RELEASE_FRESH_CENTER'
  | 'TRANSITION_UNCERTAIN_FRESH_L3_SUPPORT'
  | 'MOVING_SPEED_UNKNOWN'
  | 'STATIONARY_SUPPORTED_BAND'
  | 'NO_MOTION_EVIDENCE'
  | 'OTHER_S1_DOCUMENTED';

const FROZEN_OR_RELEASE = new Set([
  'FROZEN_UNRESOLVED',
  'FROZEN_MOVEMENT_SUPPORTED',
  'FROZEN_STOP_SUPPORTED',
  'RELEASE',
]);

export function labelInAcquisitionWindow(label: string, window: AcquisitionWindow): boolean {
  const ms = bucketLabelToMs(label);
  const start = bucketLabelToMs(window.startLabel);
  const end = bucketLabelToMs(window.endLabel);
  return ms >= start && ms <= end;
}

export function enumerateAcquisitionBucketLabels(window: AcquisitionWindow): string[] {
  const labels: string[] = [];
  let cur = window.startLabel;
  const endMs = bucketLabelToMs(window.endLabel);
  while (bucketLabelToMs(cur) <= endMs) {
    labels.push(cur);
    cur = bucketLabelPlusSeconds(cur, 1);
  }
  return labels;
}

export function diagnosePositionGapAtLabel(
  label: string,
  posByLabel: Map<string, PositionBucketSample>,
  window: AcquisitionWindow,
): PositionGapKind | 'PRESENT_OK' {
  if (!labelInAcquisitionWindow(label, window)) {
    return 'WINDOW_EDGE_OUTSIDE_ACQUISITION';
  }
  const row = posByLabel.get(label);
  if (!row) {
    return 'MISSING_BUCKET_INSIDE_WINDOW';
  }
  if (row.availability === 'ROW_ABSENT') {
    return 'ROW_ABSENT_EXPLICIT';
  }
  if (row.availability === 'SIGNAL_NULL') {
    return 'SIGNAL_NULL_EXPLICIT';
  }
  if (
    row.latitude == null ||
    row.longitude == null ||
    !isValidGeoCoordinate(row.latitude, row.longitude)
  ) {
    return 'INVALID_COORDINATES';
  }
  return 'PRESENT_OK';
}

export function classifySupportWindowGaps(
  centerLabel: string,
  posByLabel: Map<string, PositionBucketSample>,
  window: AcquisitionWindow,
): PositionGapKind[] {
  const prev = bucketLabelMinusSeconds(centerLabel, 1);
  const next = bucketLabelPlusSeconds(centerLabel, 1);
  const kinds: PositionGapKind[] = [];
  for (const label of [prev, centerLabel, next]) {
    const d = diagnosePositionGapAtLabel(label, posByLabel, window);
    if (d !== 'PRESENT_OK') {
      kinds.push(d);
    }
  }
  return kinds;
}

/** V1 taxonomy (R3); preserved for reconciliation. */
export function classifyNoNumericDisjointV1(
  row: Pick<
    DiV0TripSpeedQualityShadowRow,
    'motionState' | 'positionState' | 'speedEvidenceState' | 'abstentionReason' | 'referenceTime'
  >,
  posByLabel: Map<string, PositionBucketSample>,
): NoNumericDisjointV1 {
  const center = dateToBucketLabel(row.referenceTime);
  const prev = bucketLabelMinusSeconds(center, 1);
  const next = bucketLabelPlusSeconds(center, 1);
  const pPrev = posByLabel.get(prev);
  const pCenter = posByLabel.get(center);
  const pNext = posByLabel.get(next);

  const availGap = [pPrev, pCenter, pNext].some(
    (p) => !p || p.availability === 'ROW_ABSENT' || p.availability === 'SIGNAL_NULL',
  );
  if (availGap) return 'ROW_ABSENT_OR_SIGNAL_NULL_GAP';

  const invalidGeo = [pPrev, pCenter, pNext].some(
    (p) =>
      p &&
      (p.latitude == null ||
        p.longitude == null ||
        !isValidGeoCoordinate(p.latitude, p.longitude)),
  );
  if (invalidGeo) return 'INVALID_POSITION_DATA';

  if (!pPrev || !pCenter || !pNext) return 'INCOMPLETE_SUPPORT_WINDOW_EDGES';

  const frozenRelease = [pPrev, pCenter, pNext].some(
    (p) => p?.positionState != null && FROZEN_OR_RELEASE.has(p.positionState),
  );
  if (frozenRelease || row.positionState === 'RELEASE') {
    return 'TRANSITION_RELEASE_OR_UNRESOLVED_HOLD';
  }

  if (
    row.motionState === 'STATIONARY_SUPPORTED' &&
    row.speedEvidenceState === 'STATIONARY_BAND' &&
    pCenter.availability === 'PRESENT'
  ) {
    return 'STATIONARY_WITH_FRESH_POSITIONS';
  }

  if (
    row.positionState === 'FROZEN_STOP_SUPPORTED' ||
    (row.motionState === 'STATIONARY_SUPPORTED' && row.speedEvidenceState === 'STATIONARY_BAND')
  ) {
    return 'STATIONARY_HOLD_GEOMETRY_INDICATOR';
  }

  if (row.motionState === 'MOVING_SPEED_UNKNOWN') {
    return 'MOVEMENT_DETECTED_SPEED_NOT_ESTIMABLE';
  }

  if (row.motionState === 'TRANSITION_UNCERTAIN' || row.positionState === 'FROZEN_UNRESOLVED') {
    return 'TRANSITION_RELEASE_OR_UNRESOLVED_HOLD';
  }

  if (row.abstentionReason != null) {
    return 'MOVEMENT_DETECTED_SPEED_NOT_ESTIMABLE';
  }

  return 'OTHER_EXPLAINED';
}

/** V2: position-gap-first taxonomy for no-numeric intervals (disjoint). */
export function classifyNoNumericDisjointV2(
  row: Pick<
    DiV0TripSpeedQualityShadowRow,
    'motionState' | 'positionState' | 'speedEvidenceState' | 'abstentionReason' | 'referenceTime'
  >,
  posByLabel: Map<string, PositionBucketSample>,
  window: AcquisitionWindow,
): string {
  const center = dateToBucketLabel(row.referenceTime);
  const gaps = classifySupportWindowGaps(center, posByLabel, window);
  if (gaps.length > 0) {
    const priority: PositionGapKind[] = [
      'WINDOW_EDGE_OUTSIDE_ACQUISITION',
      'MISSING_BUCKET_INSIDE_WINDOW',
      'ROW_ABSENT_EXPLICIT',
      'SIGNAL_NULL_EXPLICIT',
      'INVALID_COORDINATES',
    ];
    for (const p of priority) {
      if (gaps.includes(p)) return `POS_GAP_${p}`;
    }
  }
  const detail = classifyHoldTransitionDetail(row, posByLabel);
  return `HOLD_TRANSITION_${detail}`;
}

export function classifyHoldTransitionDetail(
  row: Pick<
    DiV0TripSpeedQualityShadowRow,
    'motionState' | 'positionState' | 'speedEvidenceState' | 'abstentionReason' | 'referenceTime'
  >,
  posByLabel: Map<string, PositionBucketSample>,
): HoldTransitionDetail {
  const center = dateToBucketLabel(row.referenceTime);
  const prev = bucketLabelMinusSeconds(center, 1);
  const next = bucketLabelPlusSeconds(center, 1);
  const pCenter = posByLabel.get(center);
  const pPrev = posByLabel.get(prev);
  const pNext = posByLabel.get(next);

  if (row.motionState === 'NO_MOTION_EVIDENCE') {
    return 'NO_MOTION_EVIDENCE';
  }
  if (row.motionState === 'MOVING_SPEED_UNKNOWN') {
    return 'MOVING_SPEED_UNKNOWN';
  }
  if (
    row.motionState === 'STATIONARY_SUPPORTED' &&
    row.speedEvidenceState === 'STATIONARY_BAND'
  ) {
    return 'STATIONARY_SUPPORTED_BAND';
  }

  if (row.positionState === 'FROZEN_UNRESOLVED') return 'CENTER_FROZEN_UNRESOLVED';
  if (row.positionState === 'FROZEN_MOVEMENT_SUPPORTED') return 'CENTER_FROZEN_MOVEMENT_SUPPORTED';
  if (row.positionState === 'FROZEN_STOP_SUPPORTED') return 'CENTER_FROZEN_STOP_SUPPORTED';
  if (row.positionState === 'RELEASE') return 'CENTER_RELEASE';

  const neighborHold =
    (pPrev?.positionState != null && FROZEN_OR_RELEASE.has(pPrev.positionState)) ||
    (pNext?.positionState != null && FROZEN_OR_RELEASE.has(pNext.positionState));
  if (neighborHold && pCenter?.positionState === 'FRESH') {
    return 'NEIGHBOR_HOLD_OR_RELEASE_FRESH_CENTER';
  }

  if (
    row.motionState === 'TRANSITION_UNCERTAIN' &&
    pPrev?.positionState === 'FRESH' &&
    pCenter?.positionState === 'FRESH' &&
    pNext?.positionState === 'FRESH'
  ) {
    return 'TRANSITION_UNCERTAIN_FRESH_L3_SUPPORT';
  }

  return 'OTHER_S1_DOCUMENTED';
}

export function supportWindowConditionLabel(
  row: Pick<DiV0TripSpeedQualityShadowRow, 'referenceTime'>,
  posByLabel: Map<string, PositionBucketSample>,
  window: AcquisitionWindow,
): string {
  const center = dateToBucketLabel(row.referenceTime);
  const gaps = classifySupportWindowGaps(center, posByLabel, window);
  if (gaps.length > 0) {
    return gaps.join('+');
  }
  return 'L3_WINDOW_COMPLETE';
}

export function crossTabKey(
  row: Pick<
    DiV0TripSpeedQualityShadowRow,
    'motionState' | 'positionState' | 'speedEvidenceState' | 'abstentionReason' | 'referenceTime'
  >,
  posByLabel: Map<string, PositionBucketSample>,
  window: AcquisitionWindow,
): string {
  const abst = row.abstentionReason ?? 'NULL';
  const hold = classifyHoldTransitionDetail(row, posByLabel);
  const support = supportWindowConditionLabel(row, posByLabel, window);
  return `${row.motionState}|${row.positionState}|${abst}|${support}|${hold}`;
}

export type TimeSegmentStats = {
  segmentCount: number;
  longestRunSeconds: number;
  totalSeconds: number;
};

export function isConsecutiveSecond(a: Date, b: Date): boolean {
  return bucketLabelToMs(dateToBucketLabel(b)) - bucketLabelToMs(dateToBucketLabel(a)) === 1000;
}

/** Segment by UTC second continuity and matching classification label. */
export function buildTimeSegmentStats(
  rows: Array<{ referenceTime: Date; classLabel: string }>,
): TimeSegmentStats {
  if (rows.length === 0) {
    return { segmentCount: 0, longestRunSeconds: 0, totalSeconds: 0 };
  }
  let segments = 1;
  let longest = 1;
  let cur = 1;
  for (let i = 1; i < rows.length; i += 1) {
    const contiguous =
      isConsecutiveSecond(rows[i - 1].referenceTime, rows[i].referenceTime) &&
      rows[i].classLabel === rows[i - 1].classLabel;
    if (contiguous) {
      cur += 1;
      longest = Math.max(longest, cur);
    } else {
      segments += 1;
      cur = 1;
    }
  }
  return { segmentCount: segments, longestRunSeconds: longest, totalSeconds: rows.length };
}

export function countPositionBucketAvailability(
  posByLabel: Map<string, PositionBucketSample>,
  window: AcquisitionWindow,
): {
  expectedBuckets: number;
  presentInMap: number;
  rowAbsentBuckets: number;
  signalNullBuckets: number;
  presentWithCoords: number;
  invalidCoordinateBuckets: number;
  missingInsideWindowBuckets: number;
  edgeOutsideWindowSupportHits: number;
} {
  const expected = enumerateAcquisitionBucketLabels(window);
  let rowAbsentBuckets = 0;
  let signalNullBuckets = 0;
  let presentWithCoords = 0;
  let invalidCoordinateBuckets = 0;
  let missingInsideWindowBuckets = 0;
  let presentInMap = 0;
  for (const label of expected) {
    const row = posByLabel.get(label);
    if (!row) {
      missingInsideWindowBuckets += 1;
      continue;
    }
    presentInMap += 1;
    if (row.availability === 'ROW_ABSENT') rowAbsentBuckets += 1;
    else if (row.availability === 'SIGNAL_NULL') signalNullBuckets += 1;
    else if (
      row.latitude != null &&
      row.longitude != null &&
      isValidGeoCoordinate(row.latitude, row.longitude)
    ) {
      presentWithCoords += 1;
    } else {
      invalidCoordinateBuckets += 1;
    }
  }
  return {
    expectedBuckets: expected.length,
    presentInMap,
    rowAbsentBuckets,
    signalNullBuckets,
    presentWithCoords,
    invalidCoordinateBuckets,
    missingInsideWindowBuckets,
    edgeOutsideWindowSupportHits: 0,
  };
}

export function dateToBucketLabel(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
