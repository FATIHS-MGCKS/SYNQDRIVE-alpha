import { haversineMeters } from '../geo/haversine';
import type { ClassifiedPositionRow } from '../position/hold-release';
import {
  availabilityBlocksL3,
  isFrozenPositionState,
  isL3SupportPositionState,
  labelIndexByBucket,
} from '../position/hold-release';
import type { AbstentionReason } from '../types';

const MS_PER_SECOND = 1000;

function labelMs(label: string): number {
  const ms = Date.parse(label);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid bucketLabel: ${label}`);
  }
  return ms;
}

function supportLabelsAreCalendarSecondsApart(prevLabel: string, centerLabel: string, nextLabel: string): boolean {
  const prevMs = labelMs(prevLabel);
  const centerMs = labelMs(centerLabel);
  const nextMs = labelMs(nextLabel);
  return centerMs - prevMs === MS_PER_SECOND && nextMs - centerMs === MS_PER_SECOND;
}

function bucketLabelMinusSeconds(label: string, seconds: number): string {
  return new Date(labelMs(label) - seconds * MS_PER_SECOND).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function bucketLabelPlusSeconds(label: string, seconds: number): string {
  return new Date(labelMs(label) + seconds * MS_PER_SECOND).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface L3EligibilityResult {
  eligible: boolean;
  speedKmh: number | null;
  abstentionReason: AbstentionReason | null;
  supportIntervalStart: string | null;
  supportIntervalEnd: string | null;
  flags: string[];
}

/**
 * Frozen pilot L3: mean of adjacent leg speeds at centre label t.
 * Support labels are **calendar** t−1 s, t, t+1 (C1D analysis), not adjacent array rows.
 */
export function evaluateL3AtCenter(
  rows: ClassifiedPositionRow[],
  centerIndex: number,
): L3EligibilityResult {
  const flags: string[] = [];
  const center = rows[centerIndex];
  const labelMap = labelIndexByBucket(rows);
  const prevLabel = bucketLabelMinusSeconds(center.observation.bucketLabel, 1);
  const nextLabel = bucketLabelPlusSeconds(center.observation.bucketLabel, 1);
  const prevIndex = labelMap.get(prevLabel);
  const nextIndex = labelMap.get(nextLabel);

  if (prevIndex === undefined || nextIndex === undefined) {
    return {
      eligible: false,
      speedKmh: null,
      abstentionReason: 'INCOMPLETE_SUPPORT',
      supportIntervalStart: null,
      supportIntervalEnd: null,
      flags: ['L3_SUPPORT_CROSSES_GAP'],
    };
  }

  if (prevIndex === centerIndex || centerIndex === nextIndex || prevIndex === nextIndex) {
    return {
      eligible: false,
      speedKmh: null,
      abstentionReason: 'TEMPORAL_SEMANTICS_INSUFFICIENT',
      supportIntervalStart: null,
      supportIntervalEnd: null,
      flags: ['L3_SUPPORT_NONPOSITIVE_TIME_DELTA'],
    };
  }

  const prev = rows[prevIndex];
  const next = rows[nextIndex];
  const supportRows = [prev, center, next];

  if (
    !supportLabelsAreCalendarSecondsApart(
      prev.observation.bucketLabel,
      center.observation.bucketLabel,
      next.observation.bucketLabel,
    )
  ) {
    return {
      eligible: false,
      speedKmh: null,
      abstentionReason: 'ROW_GAP_IN_SUPPORT',
      supportIntervalStart: prev.observation.intervalStart,
      supportIntervalEnd: next.observation.intervalEnd,
      flags: ['L3_SUPPORT_CROSSES_GAP'],
    };
  }

  for (const row of supportRows) {
    if (row.gridFlag === 'DUPLICATE_BUCKET_LABEL') {
      return {
        eligible: false,
        speedKmh: null,
        abstentionReason: 'TEMPORAL_SEMANTICS_INSUFFICIENT',
        supportIntervalStart: prev.observation.intervalStart,
        supportIntervalEnd: next.observation.intervalEnd,
        flags: ['L3_SUPPORT_DUPLICATE_BUCKET_LABEL'],
      };
    }
    if (row.observation.availability === 'ROW_ABSENT') {
      return {
        eligible: false,
        speedKmh: null,
        abstentionReason: 'ROW_ABSENT',
        supportIntervalStart: prev.observation.intervalStart,
        supportIntervalEnd: next.observation.intervalEnd,
        flags: ['L3_SUPPORT_CROSSES_GAP'],
      };
    }
    if (row.observation.availability === 'SIGNAL_NULL') {
      return {
        eligible: false,
        speedKmh: null,
        abstentionReason: 'SIGNAL_NULL_IN_SUPPORT',
        supportIntervalStart: prev.observation.intervalStart,
        supportIntervalEnd: next.observation.intervalEnd,
        flags: [],
      };
    }
    if (availabilityBlocksL3(row.observation.availability)) {
      return {
        eligible: false,
        speedKmh: null,
        abstentionReason: 'ROW_ABSENT',
        supportIntervalStart: null,
        supportIntervalEnd: null,
        flags,
      };
    }
    if (row.coord == null) {
      return {
        eligible: false,
        speedKmh: null,
        abstentionReason: 'INVALID_POSITION',
        supportIntervalStart: null,
        supportIntervalEnd: null,
        flags: [],
      };
    }
    if (row.positionState === 'RELEASE') {
      return {
        eligible: false,
        speedKmh: null,
        abstentionReason: 'POSITION_RELEASE',
        supportIntervalStart: prev.observation.intervalStart,
        supportIntervalEnd: next.observation.intervalEnd,
        flags: ['L3_SUPPORT_CROSSES_RELEASE'],
      };
    }
    if (isFrozenPositionState(row.positionState)) {
      return {
        eligible: false,
        speedKmh: null,
        abstentionReason: 'POSITION_FROZEN',
        supportIntervalStart: prev.observation.intervalStart,
        supportIntervalEnd: next.observation.intervalEnd,
        flags: ['L3_SUPPORT_CROSSES_HOLD'],
      };
    }
    if (row.gridFlag === 'FIRST_OR_AFTER_ROW_GAP') {
      return {
        eligible: false,
        speedKmh: null,
        abstentionReason: 'ROW_GAP_IN_SUPPORT',
        supportIntervalStart: prev.observation.intervalStart,
        supportIntervalEnd: next.observation.intervalEnd,
        flags: ['L3_SUPPORT_CROSSES_GAP'],
      };
    }
    if (!isL3SupportPositionState(row.positionState)) {
      return {
        eligible: false,
        speedKmh: null,
        abstentionReason: 'GEOMETRY_DISCONTINUITY',
        supportIntervalStart: null,
        supportIntervalEnd: null,
        flags,
      };
    }
  }

  const p0 = prev.coord!;
  const p1 = center.coord!;
  const p2 = next.coord!;

  const d1 = haversineMeters(p0.latitude, p0.longitude, p1.latitude, p1.longitude);
  const d2 = haversineMeters(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
  const speedKmh = ((d1 + d2) / 2) * 3.6;

  if (!Number.isFinite(speedKmh)) {
    return {
      eligible: false,
      speedKmh: null,
      abstentionReason: 'INVALID_POSITION',
      supportIntervalStart: null,
      supportIntervalEnd: null,
      flags,
    };
  }

  return {
    eligible: true,
    speedKmh,
    abstentionReason: null,
    supportIntervalStart: prev.observation.intervalStart,
    supportIntervalEnd: next.observation.intervalEnd,
    flags,
  };
}
