import { haversineMeters } from '../geo/haversine';
import {
  availabilityByLabel,
  bucketLabelPlusSeconds,
  orderMotionCoreGrid,
  presentBucketMap,
  type MotionCorePositionBucket,
} from './motion-core-grid';

/** Declared pre-hoc in EXP021 motion-core design (not tuned on Tesla trips). */
export const MOTION_CORE_JITTER_RATIO = 1.5;
export const MOTION_CORE_MIN_SPEED_FOR_JITTER_KMH = 5.0;
export const MOTION_CORE_OUTLIER_CHORD_DEVIATION_M = 8.0;
export const MOTION_CORE_LEG_CONSISTENCY_VERSION = 'MOTION_CORE_LEG_CONSISTENCY_V0_1_DEV';

/**
 * Neighbour legs used for the local median in {@link detectTimingJitterSuspectLegs}.
 * A leg assessment at calendar second t requires present endpoints for legs starting at
 * t-3..t+3 (inclusive of the leg itself at t) — i.e. up to **3 s lookahead** on the label axis.
 * This is a **centered** diagnostic, not a causal live filter.
 */
export const MOTION_CORE_JITTER_NEIGHBOUR_OFFSETS_S = [-3, -2, -1, 1, 2, 3] as const;

export type LegConsistencyAssessment =
  | 'PLAUSIBLE'
  | 'TIMING_JITTER_SIGNATURE'
  | 'INSUFFICIENT_NEIGHBOUR_LEGS'
  | 'BELOW_JITTER_SPEED_FLOOR';

export interface TimingJitterSignatureDetail {
  /** Detected spike pattern — not a proven bucket timestamp error. */
  signatureKind: 'TIMING_JITTER_SPIKE_PATTERN';
  legSpeedKmh: number;
  localMedianLegSpeedKmh: number;
  ratio: number;
  adjacentAbsentBucket: boolean;
  shortNeighbourLeg: boolean;
}

export interface OneSecondLegRecord {
  legStartLabel: string;
  legEndLabel: string;
  legSpanS: 1;
  legSpeedKmh: number | null;
  assessment: LegConsistencyAssessment;
  reasons: string[];
  supportPresentLabels: string[];
  neighbourLegSpeedsKmh: Array<{ legStartLabel: string; legSpeedKmh: number }>;
  timingJitterSignature: TimingJitterSignatureDetail | null;
}

export interface PositionOutlierDetail {
  signatureKind: 'CHORD_DEVIATION_FROM_NEIGHBOUR_MIDPOINT';
  chordDeviationM: number;
  chordSpeedKmh: number;
  localMedianLegSpeedKmh: number | null;
  /** Deviation observed — cause (GPS jump vs map error) not proven here. */
  provenCause: false;
}

function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error('median of empty set');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function legSpeedKmh(a: MotionCorePositionBucket, b: MotionCorePositionBucket): number {
  return haversineMeters(a.latitude!, a.longitude!, b.latitude!, b.longitude!) * 3.6;
}

function buildLegSpeedMap(buckets: MotionCorePositionBucket[]): Map<string, number> {
  const ordered = orderMotionCoreGrid(buckets);
  const pm = presentBucketMap(ordered);
  const legs = new Map<string, number>();
  for (const b of ordered) {
    const end = bucketLabelPlusSeconds(b.bucketLabelUtc, 1);
    const a = pm.get(b.bucketLabelUtc);
    const c = pm.get(end);
    if (a && c) {
      legs.set(b.bucketLabelUtc, legSpeedKmh(a, c));
    }
  }
  return legs;
}

/**
 * Timing-jitter **signature** per 1 s leg (keyed by leg start label).
 * A leg is flagged when speed >= ratio × local median of neighbouring legs AND the pattern is
 * spike-like (adjacent ROW_ABSENT bucket or compensating short neighbour leg), not a monotone ramp.
 */
export function detectTimingJitterSuspectLegs(
  buckets: MotionCorePositionBucket[],
  ratio = MOTION_CORE_JITTER_RATIO,
): Map<string, TimingJitterSignatureDetail> {
  const ordered = orderMotionCoreGrid(buckets);
  const avail = availabilityByLabel(ordered);
  const legs = buildLegSpeedMap(ordered);
  const out = new Map<string, TimingJitterSignatureDetail>();

  for (const [lab, v] of legs) {
    const neigh: number[] = [];
    for (const k of MOTION_CORE_JITTER_NEIGHBOUR_OFFSETS_S) {
      const n = legs.get(bucketLabelPlusSeconds(lab, k));
      if (n != null) {
        neigh.push(n);
      }
    }
    if (neigh.length < 2 || v < MOTION_CORE_MIN_SPEED_FOR_JITTER_KMH) {
      continue;
    }
    const med = median(neigh);
    if (med <= 0 || v / med < ratio) {
      continue;
    }
    const adjAbsent =
      avail.get(bucketLabelPlusSeconds(lab, -1)) !== 'PRESENT' ||
      avail.get(bucketLabelPlusSeconds(lab, 2)) !== 'PRESENT';
    const prevLeg = legs.get(bucketLabelPlusSeconds(lab, -1));
    const nextLeg = legs.get(bucketLabelPlusSeconds(lab, 1));
    const shortNeighbour =
      (prevLeg != null && prevLeg / med <= 1.0 / ratio) ||
      (nextLeg != null && nextLeg / med <= 1.0 / ratio);
    if (adjAbsent || shortNeighbour) {
      out.set(lab, {
        signatureKind: 'TIMING_JITTER_SPIKE_PATTERN',
        legSpeedKmh: Math.round(v * 10) / 10,
        localMedianLegSpeedKmh: Math.round(med * 10) / 10,
        ratio: Math.round((v / med) * 100) / 100,
        adjacentAbsentBucket: adjAbsent,
        shortNeighbourLeg: shortNeighbour,
      });
    }
  }
  return out;
}

/** Single-point chord outlier at label t (requires present neighbours at t±1 s). */
export function detectPositionOutliers(
  buckets: MotionCorePositionBucket[],
): Map<string, PositionOutlierDetail> {
  const ordered = orderMotionCoreGrid(buckets);
  const pm = presentBucketMap(ordered);
  const out = new Map<string, PositionOutlierDetail>();

  for (const b of ordered) {
    const lab = b.bucketLabelUtc;
    const prev = pm.get(bucketLabelPlusSeconds(lab, -1));
    const center = pm.get(lab);
    const next = pm.get(bucketLabelPlusSeconds(lab, 1));
    if (!prev || !center || !next) {
      continue;
    }
    const midLat = (prev.latitude! + next.latitude!) / 2;
    const midLon = (prev.longitude! + next.longitude!) / 2;
    const dev = haversineMeters(center.latitude!, center.longitude!, midLat, midLon);
    if (dev < MOTION_CORE_OUTLIER_CHORD_DEVIATION_M) {
      continue;
    }
    const chordSpeed = haversineMeters(prev.latitude!, prev.longitude!, next.latitude!, next.longitude!) / 2 * 3.6;
    const neigh: number[] = [];
    for (const k of [-3, -2, 2, 3] as const) {
      const a = pm.get(bucketLabelPlusSeconds(lab, k));
      const c = pm.get(bucketLabelPlusSeconds(lab, k + 1));
      if (a && c) {
        neigh.push(legSpeedKmh(a, c));
      }
    }
    const med = neigh.length > 0 ? median(neigh) : null;
    const lo = Math.max(med ?? 1, 1) / 1.5;
    const hi = 1.5 * Math.max(med ?? 1, 1);
    if (med == null || (chordSpeed >= lo && chordSpeed <= hi)) {
      out.set(lab, {
        signatureKind: 'CHORD_DEVIATION_FROM_NEIGHBOUR_MIDPOINT',
        chordDeviationM: Math.round(dev * 10) / 10,
        chordSpeedKmh: Math.round(chordSpeed * 10) / 10,
        localMedianLegSpeedKmh: med == null ? null : Math.round(med * 10) / 10,
        provenCause: false,
      });
    }
  }
  return out;
}

export function analyzeOneSecondLegs(buckets: MotionCorePositionBucket[]): OneSecondLegRecord[] {
  const ordered = orderMotionCoreGrid(buckets);
  const legs = buildLegSpeedMap(ordered);
  const jitter = detectTimingJitterSuspectLegs(ordered);
  const records: OneSecondLegRecord[] = [];

  for (const [start, speed] of legs) {
    const end = bucketLabelPlusSeconds(start, 1);
    const neigh: Array<{ legStartLabel: string; legSpeedKmh: number }> = [];
    for (const k of MOTION_CORE_JITTER_NEIGHBOUR_OFFSETS_S) {
      const lab = bucketLabelPlusSeconds(start, k);
      const v = legs.get(lab);
      if (v != null) {
        neigh.push({ legStartLabel: lab, legSpeedKmh: v });
      }
    }
    const sig = jitter.get(start) ?? null;
    let assessment: LegConsistencyAssessment;
    const reasons: string[] = [];
    if (speed < MOTION_CORE_MIN_SPEED_FOR_JITTER_KMH) {
      assessment = 'BELOW_JITTER_SPEED_FLOOR';
      reasons.push('LEG_SPEED_BELOW_JITTER_FLOOR');
    } else if (neigh.length < 2) {
      assessment = 'INSUFFICIENT_NEIGHBOUR_LEGS';
      reasons.push('NEIGHBOUR_LEG_SAMPLE_COUNT_LT_2');
    } else if (sig) {
      assessment = 'TIMING_JITTER_SIGNATURE';
      reasons.push('TIMING_JITTER_SPIKE_PATTERN');
      if (sig.adjacentAbsentBucket) {
        reasons.push('ADJACENT_ROW_ABSENT_BUCKET');
      }
      if (sig.shortNeighbourLeg) {
        reasons.push('SHORT_NEIGHBOUR_LEG_COMPENSATION');
      }
    } else {
      assessment = 'PLAUSIBLE';
      reasons.push('NO_TIMING_JITTER_SIGNATURE');
    }
    records.push({
      legStartLabel: start,
      legEndLabel: end,
      legSpanS: 1,
      legSpeedKmh: speed,
      assessment,
      reasons,
      supportPresentLabels: [start, end],
      neighbourLegSpeedsKmh: neigh,
      timingJitterSignature: sig,
    });
  }
  return records;
}
