import { haversineMeters } from '../geo/haversine';
import { detectTimingJitterSuspectLegs } from './leg-consistency';
import {
  bucketLabelPlusSeconds,
  orderMotionCoreGrid,
  presentBucketMap,
  type MotionCorePositionBucket,
} from './motion-core-grid';
import type { MotionCoreSpeedSample } from './speed-sample.types';
import { MOTION_CORE_C4_C1_WINDOW_HALF_S } from './c4-time-semantics';

export const MOTION_CORE_SPEED_C1_VERSION = 'MOTION_CORE_SPEED_C1_V0_1_DEV';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function legDistanceM(a: MotionCorePositionBucket, b: MotionCorePositionBucket): number {
  return haversineMeters(a.latitude!, a.longitude!, b.latitude!, b.longitude!);
}

function windowPoints(
  pm: Map<string, MotionCorePositionBucket>,
  centerLabel: string,
  half: number,
): Array<{ k: number; bucket: MotionCorePositionBucket }> {
  const pts: Array<{ k: number; bucket: MotionCorePositionBucket }> = [];
  for (let k = -half; k <= half; k++) {
    const b = pm.get(bucketLabelPlusSeconds(centerLabel, k));
    if (b) {
      pts.push({ k, bucket: b });
    }
  }
  return pts;
}

/**
 * Theil–Sen style robust path slope over ±`half` labels (C1 fallback for C4).
 * Emits only at labels with a PRESENT position row (no speed on ROW_ABSENT labels).
 */
export function robustPathSlopeC1(
  buckets: MotionCorePositionBucket[],
  options?: { half?: number; rejectedLabels?: Set<string> },
): MotionCoreSpeedSample[] {
  const half = options?.half ?? MOTION_CORE_C4_C1_WINDOW_HALF_S;
  const rejected = options?.rejectedLabels ?? new Set<string>();
  const ordered = orderMotionCoreGrid(buckets);
  const pm = presentBucketMap(ordered);
  for (const lab of rejected) {
    pm.delete(lab);
  }
  const suspect = detectTimingJitterSuspectLegs(ordered);
  const out: MotionCoreSpeedSample[] = [];

  for (const b of ordered) {
    const lab = b.bucketLabelUtc;
    if (rejected.has(lab)) {
      out.push({
        label: lab,
        valueKmh: null,
        quality: 'NO_POSITION',
        supportLabels: [],
        supportSpanS: null,
        flags: [],
        estimator: MOTION_CORE_SPEED_C1_VERSION,
      });
      continue;
    }
    const center = pm.get(lab);
    if (!center) {
      out.push({
        label: lab,
        valueKmh: null,
        quality: 'NO_POSITION',
        supportLabels: [],
        supportSpanS: null,
        flags: [],
        estimator: MOTION_CORE_SPEED_C1_VERSION,
      });
      continue;
    }
    const pts = windowPoints(pm, lab, half);
    const hasLeft = pts.some((p) => p.k < 0);
    const hasRight = pts.some((p) => p.k > 0);
    if (pts.length < 3 || !hasLeft || !hasRight) {
      out.push({
        label: lab,
        valueKmh: null,
        quality: 'NO_SUPPORT',
        supportLabels: pts.map((p) => p.bucket.bucketLabelUtc),
        supportSpanS: null,
        flags: ['INSUFFICIENT_WINDOW_SUPPORT'],
        estimator: MOTION_CORE_SPEED_C1_VERSION,
      });
      continue;
    }
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1]! + legDistanceM(pts[i - 1]!.bucket, pts[i]!.bucket));
    }
    const ks = pts.map((p) => p.k);
    const slopes: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dt = ks[j]! - ks[i]!;
        if (dt > 0) {
          slopes.push((cum[j]! - cum[i]!) / dt);
        }
      }
    }
    const valueKmh = median(slopes) * 3.6;
    const flags: string[] = [];
    let quality: MotionCoreSpeedSample['quality'] = 'OK';
    // Match Python: range(-half, half) — excludes +half (e.g. k=2 when half=2).
    let jitterInWindow = false;
    for (let k = -half; k < half; k++) {
      if (suspect.has(bucketLabelPlusSeconds(lab, k))) {
        jitterInWindow = true;
        break;
      }
    }
    if (jitterInWindow) {
      flags.push('TIMING_JITTER_SUSPECT_IN_WINDOW');
      quality = 'JITTER_SUSPECT';
    }
    if (pts.length === 3) {
      flags.push('MIN_SUPPORT_3_POINTS');
      if (quality === 'OK') {
        quality = 'SPARSE_SUPPORT';
      }
    }
    const span = ks[ks.length - 1]! - ks[0]!;
    out.push({
      label: lab,
      valueKmh,
      quality,
      supportLabels: pts.map((p) => p.bucket.bucketLabelUtc),
      supportSpanS: span,
      flags,
      estimator: MOTION_CORE_SPEED_C1_VERSION,
    });
  }
  return out;
}
