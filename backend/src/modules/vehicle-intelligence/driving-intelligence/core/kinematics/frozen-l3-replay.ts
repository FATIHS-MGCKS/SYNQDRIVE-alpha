import type { DiV0CalibrationBundle } from '../calibration/types';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../calibration/CALIBRATION_UNSET_V0';
import { classifyPositionRows } from '../position/hold-release';
import type { AbstentionReason, TelemetrySourceFamily } from '../types';
import { evaluateL3AtCenter } from './l3-eligibility';
import {
  motionCoreGridToObservations,
  orderMotionCoreGrid,
  type MotionCorePositionBucket,
} from './motion-core-grid';

export const MOTION_CORE_FROZEN_L3_REPLAY_VERSION = 'MOTION_CORE_FROZEN_L3_REPLAY_V0_1';

export interface FrozenL3ReplayLabel {
  bucketLabelUtc: string;
  l3SpeedKmh: number | null;
  eligible: boolean;
  abstentionReason: AbstentionReason | null;
  flags: string[];
  supportIntervalStart: string | null;
  supportIntervalEnd: string | null;
}

export interface FrozenL3ReplaySummary {
  labelCount: number;
  eligibleCount: number;
  version: string;
}

/**
 * Replays the frozen pilot L3 ({@link evaluateL3AtCenter}) over a 1 Hz grid without changing runtime wiring.
 * Uses calendar t−1 / t / t+1 support labels identical to production DI V0.
 */
export function replayFrozenL3OnGrid(
  buckets: MotionCorePositionBucket[],
  options?: {
    sourceFamily?: TelemetrySourceFamily;
    calibration?: DiV0CalibrationBundle;
  },
): FrozenL3ReplayLabel[] {
  const sourceFamily = options?.sourceFamily ?? 'API_SYNTHETIC';
  const calibration = options?.calibration ?? CALIBRATION_UNSET_V0_BUNDLE;
  const ordered = orderMotionCoreGrid(buckets);
  const observations = motionCoreGridToObservations(ordered, sourceFamily);
  const classified = classifyPositionRows(observations, calibration);
  const indexByLabel = new Map(classified.map((row, i) => [row.observation.bucketLabel, i]));

  return ordered.map((bucket) => {
    const centerIndex = indexByLabel.get(bucket.bucketLabelUtc);
    if (centerIndex === undefined) {
      return {
        bucketLabelUtc: bucket.bucketLabelUtc,
        l3SpeedKmh: null,
        eligible: false,
        abstentionReason: 'INCOMPLETE_SUPPORT',
        flags: ['LABEL_NOT_IN_CLASSIFIED_ROWS'],
        supportIntervalStart: null,
        supportIntervalEnd: null,
      };
    }
    const l3 = evaluateL3AtCenter(classified, centerIndex);
    return {
      bucketLabelUtc: bucket.bucketLabelUtc,
      l3SpeedKmh: l3.eligible ? l3.speedKmh : null,
      eligible: l3.eligible,
      abstentionReason: l3.abstentionReason,
      flags: l3.flags,
      supportIntervalStart: l3.supportIntervalStart,
      supportIntervalEnd: l3.supportIntervalEnd,
    };
  });
}

export function summarizeFrozenL3Replay(rows: FrozenL3ReplayLabel[]): FrozenL3ReplaySummary {
  return {
    labelCount: rows.length,
    eligibleCount: rows.filter((r) => r.eligible && r.l3SpeedKmh != null).length,
    version: MOTION_CORE_FROZEN_L3_REPLAY_VERSION,
  };
}

/** Compare replay L3 to frozen shadow/export speeds (evaluation only — not an algorithm input). */
export function countFrozenL3ShadowMismatches(
  replay: FrozenL3ReplayLabel[],
  shadowSpeedByLabel: Map<string, number | null | undefined>,
  toleranceKmh = 0.05,
): number {
  let mism = 0;
  for (const row of replay) {
    const shadow = shadowSpeedByLabel.get(row.bucketLabelUtc);
    if (row.l3SpeedKmh != null && shadow != null && Math.abs(row.l3SpeedKmh - shadow) > toleranceKmh) {
      mism += 1;
    }
  }
  return mism;
}
