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
export const MOTION_CORE_SPEED_C1_K5_CANDIDATE_VERSION = 'MOTION_CORE_SPEED_C1_V0_2_CAND_DEV[excludeJitterLegPairs]';

/**
 * Review-round candidate switches for C1 (EXP021 Fable review). All `false` reproduces Fable C1.
 */
export interface RobustPathSlopeCandidateOptions {
  /**
   * K5 — Theil–Sen pairs whose time span contains a jitter-suspect 1 s leg are dropped when at least
   * `MOTION_CORE_C1_K5_MIN_PAIRS` pairs remain; otherwise the full pair set is used (flagged).
   * Quality stays `JITTER_SUSPECT` — this changes the value, not the confidence claim.
   */
  excludeJitterLegPairs: boolean;
  /**
   * K5b — treat the jitter leg together with its compensating neighbour (short 1 s leg, or the
   * multi-second leg across the adjacent ROW_ABSENT bucket) as one cluster; a pair is clean when it
   * spans none or all of the cluster (the cluster's total distance/time is unaffected by the stamp
   * shift). Only meaningful with `excludeJitterLegPairs`.
   */
  jitterClusterSpan: boolean;
}

export const ROBUST_PATH_SLOPE_FABLE_OPTIONS: Readonly<RobustPathSlopeCandidateOptions> = {
  excludeJitterLegPairs: false,
  jitterClusterSpan: false,
};

export const MOTION_CORE_C1_K5_MIN_PAIRS = 2;

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
  options?: {
    half?: number;
    rejectedLabels?: Set<string>;
    candidate?: Readonly<RobustPathSlopeCandidateOptions>;
  },
): MotionCoreSpeedSample[] {
  const half = options?.half ?? MOTION_CORE_C4_C1_WINDOW_HALF_S;
  const rejected = options?.rejectedLabels ?? new Set<string>();
  const cand = options?.candidate ?? ROBUST_PATH_SLOPE_FABLE_OPTIONS;
  const estimator = cand.excludeJitterLegPairs
    ? MOTION_CORE_SPEED_C1_K5_CANDIDATE_VERSION
    : MOTION_CORE_SPEED_C1_VERSION;
  const ordered = orderMotionCoreGrid(buckets);
  const pm = presentBucketMap(ordered);
  for (const lab of rejected) {
    pm.delete(lab);
  }
  const suspect = detectTimingJitterSuspectLegs(ordered);
  const out: MotionCoreSpeedSample[] = [];
  const pmAll = presentBucketMap(ordered);
  /** Cluster label spans [from, to) (leg start labels, as epoch seconds) for K5b. */
  const clusters: Array<[number, number]> = [];
  if (cand.jitterClusterSpan) {
    for (const [legLabel, detail] of suspect) {
      const t = Math.floor(Date.parse(legLabel) / 1000);
      let from = t;
      let to = t + 1;
      const med = Math.max(detail.localMedianLegSpeedKmh, 1);
      const prevPresent = pmAll.get(bucketLabelPlusSeconds(legLabel, -1));
      const nextPresent = pmAll.get(bucketLabelPlusSeconds(legLabel, 2));
      if (!prevPresent) {
        for (let k = 2; k <= 2 * half + 1; k++) {
          if (pmAll.get(bucketLabelPlusSeconds(legLabel, -k))) {
            from = t - k;
            break;
          }
        }
      } else {
        const prevLeg = legDistanceM(prevPresent, pmAll.get(legLabel)!) * 3.6;
        if (prevLeg / med <= 1 / 1.5) {
          from = t - 1;
        }
      }
      if (!nextPresent) {
        for (let k = 3; k <= 2 * half + 2; k++) {
          if (pmAll.get(bucketLabelPlusSeconds(legLabel, k))) {
            to = t + k;
            break;
          }
        }
      } else {
        const nextLeg = legDistanceM(pmAll.get(bucketLabelPlusSeconds(legLabel, 1))!, nextPresent) * 3.6;
        if (nextLeg / med <= 1 / 1.5) {
          to = t + 2;
        }
      }
      clusters.push([from, to]);
    }
  }
  const pairSpansSuspectLeg = (centerLabel: string, kFrom: number, kTo: number): boolean => {
    if (cand.jitterClusterSpan) {
      const c0 = Math.floor(Date.parse(centerLabel) / 1000);
      const a = c0 + kFrom;
      const b = c0 + kTo;
      for (const [from, to] of clusters) {
        const overlaps = a < to && from < b;
        const contains = a <= from && to <= b;
        if (overlaps && !contains) {
          return true;
        }
      }
      return false;
    }
    for (let k = kFrom; k < kTo; k++) {
      if (suspect.has(bucketLabelPlusSeconds(centerLabel, k))) {
        return true;
      }
    }
    return false;
  };

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
        estimator,
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
        estimator,
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
        estimator,
      });
      continue;
    }
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1]! + legDistanceM(pts[i - 1]!.bucket, pts[i]!.bucket));
    }
    const ks = pts.map((p) => p.k);
    const slopes: number[] = [];
    const cleanSlopes: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dt = ks[j]! - ks[i]!;
        if (dt > 0) {
          const slope = (cum[j]! - cum[i]!) / dt;
          slopes.push(slope);
          if (!pairSpansSuspectLeg(lab, ks[i]!, ks[j]!)) {
            cleanSlopes.push(slope);
          }
        }
      }
    }
    const flags: string[] = [];
    let valueKmh = median(slopes) * 3.6;
    if (cand.excludeJitterLegPairs && cleanSlopes.length < slopes.length) {
      if (cleanSlopes.length >= MOTION_CORE_C1_K5_MIN_PAIRS) {
        valueKmh = median(cleanSlopes) * 3.6;
        flags.push(`JITTER_LEG_PAIRS_EXCLUDED=${slopes.length - cleanSlopes.length}/${slopes.length}`);
      } else {
        flags.push('JITTER_LEG_PAIRS_KEPT_INSUFFICIENT_CLEAN_PAIRS');
      }
    }
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
      estimator,
    });
  }
  return out;
}
