import { coordsEqual } from '../position/coord-key';
import {
  detectImplausibleOneSecondLegEndpointLabels,
  detectImplausibleOneSecondLegStartLabels,
  detectPositionOutliers,
  detectTimingJitterSuspectLegs,
  type MotionCoreLegGateOptions,
} from './leg-consistency';
import { replayFrozenL3OnGrid } from './frozen-l3-replay';
import {
  bucketLabelPlusSeconds,
  orderMotionCoreGrid,
  presentBucketMap,
  type MotionCorePositionBucket,
} from './motion-core-grid';
import { robustPathSlopeC1 } from './robust-path-slope';
import type { MotionCoreSpeedSample } from './speed-sample.types';

export const MOTION_CORE_SPEED_C4_VERSION = 'MOTION_CORE_SPEED_C4_V0_4_DEV';

function sampleMap(samples: MotionCoreSpeedSample[]): Map<string, MotionCoreSpeedSample> {
  return new Map(samples.map((s) => [s.label, s]));
}

/**
 * C4 adaptive L3: frozen {@link evaluateL3AtCenter} where both adjacent 1 s legs exist and neither
 * carries the timing-jitter spike signature; otherwise C1 robust path slope fallback.
 * Unchanged L3-direct paths reuse the replayed production L3 numeric value (no duplicate haversine).
 */
export function computeC4AdaptiveL3(
  buckets: MotionCorePositionBucket[],
  legGate?: MotionCoreLegGateOptions,
): MotionCoreSpeedSample[] {
  const ordered = orderMotionCoreGrid(buckets);
  const outliers = detectPositionOutliers(ordered);
  const implausibleLeg = detectImplausibleOneSecondLegEndpointLabels(ordered, legGate);
  const blockedLegStarts = detectImplausibleOneSecondLegStartLabels(ordered, legGate);
  const rejected = new Set([...outliers.keys(), ...implausibleLeg]);
  const pm = presentBucketMap(ordered);
  for (const lab of rejected) {
    pm.delete(lab);
  }
  const suspect = detectTimingJitterSuspectLegs(ordered);
  const l3ByLabel = new Map(
    replayFrozenL3OnGrid(ordered).map((r) => [r.bucketLabelUtc, r]),
  );
  const c1 = sampleMap(
    robustPathSlopeC1(ordered, { rejectedLabels: rejected, blockedLegStartLabels: blockedLegStarts }),
  );
  const out: MotionCoreSpeedSample[] = [];

  for (const b of ordered) {
    const lab = b.bucketLabelUtc;
    if (rejected.has(lab)) {
      const flags: string[] = [];
      if (implausibleLeg.has(lab)) {
        flags.push('IMPLAUSIBLE_1S_LEG_ENDPOINT_UNCERTAIN');
      }
      if (outliers.has(lab)) {
        flags.push('POSITION_OUTLIER_CHORD_DEVIATION', JSON.stringify(outliers.get(lab)));
      }
      out.push({
        label: lab,
        valueKmh: null,
        quality: 'OUTLIER_REJECTED',
        supportLabels: [lab],
        supportSpanS: null,
        flags,
        estimator: MOTION_CORE_SPEED_C4_VERSION,
      });
      continue;
    }
    const prev = pm.get(bucketLabelPlusSeconds(lab, -1));
    const center = pm.get(lab);
    const next = pm.get(bucketLabelPlusSeconds(lab, 1));
    const legsOk = prev != null && center != null && next != null;
    const legIn = bucketLabelPlusSeconds(lab, -1);
    const legOut = lab;

    if (
      center &&
      center.latitude != null &&
      center.longitude != null &&
      ((prev &&
        prev.latitude != null &&
        prev.longitude != null &&
        coordsEqual(
          { latitude: prev.latitude, longitude: prev.longitude },
          { latitude: center.latitude, longitude: center.longitude },
        )) ||
        (next &&
          next.latitude != null &&
          next.longitude != null &&
          coordsEqual(
            { latitude: center.latitude, longitude: center.longitude },
            { latitude: next.latitude, longitude: next.longitude },
          )))
    ) {
      out.push({
        label: lab,
        valueKmh: null,
        quality: 'FROZEN_POSITION',
        supportLabels: [lab],
        supportSpanS: null,
        flags: ['IDENTICAL_COORDINATES_STALE_FIX_SUSPECT'],
        estimator: MOTION_CORE_SPEED_C4_VERSION,
      });
      continue;
    }

    if (legsOk && !suspect.has(legIn) && !suspect.has(legOut)) {
      const l3 = l3ByLabel.get(lab);
      const valueKmh = l3?.eligible ? l3.l3SpeedKmh : null;
      if (valueKmh == null) {
        const f = c1.get(lab)!;
        const flags = [...f.flags, 'L3_SUPPORT_MISSING_FALLBACK_ROBUST'];
        out.push({
          ...f,
          flags,
          estimator: MOTION_CORE_SPEED_C4_VERSION,
        });
        continue;
      }
      out.push({
        label: lab,
        valueKmh,
        quality: 'OK',
        supportLabels: [prev!.bucketLabelUtc, lab, next!.bucketLabelUtc],
        supportSpanS: 2,
        flags: ['L3_DIRECT'],
        estimator: MOTION_CORE_SPEED_C4_VERSION,
      });
      continue;
    }

    const f = c1.get(lab)!;
    const flags = [...f.flags];
    if (legsOk) {
      flags.push('L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST');
    } else {
      flags.push('L3_SUPPORT_MISSING_FALLBACK_ROBUST');
    }
    let quality = f.quality;
    if (f.valueKmh != null && quality === 'OK') {
      quality = legsOk ? 'REPAIRED' : 'SPARSE_SUPPORT';
    }
    out.push({
      label: lab,
      valueKmh: f.valueKmh,
      quality,
      supportLabels: f.supportLabels,
      supportSpanS: f.supportSpanS,
      flags,
      estimator: MOTION_CORE_SPEED_C4_VERSION,
    });
  }
  return out;
}

/** Labels where C4 value differs from replayed frozen L3 (both non-null). */
export function labelsWhereC4DiffersFromFrozenL3(
  buckets: MotionCorePositionBucket[],
  toleranceKmh = 1e-9,
): string[] {
  const l3 = replayFrozenL3OnGrid(buckets);
  const c4 = computeC4AdaptiveL3(buckets);
  const changed: string[] = [];
  for (let i = 0; i < l3.length; i++) {
    const a = l3[i]!.l3SpeedKmh;
    const b = c4[i]!.valueKmh;
    if (a != null && b != null && Math.abs(a - b) > toleranceKmh) {
      changed.push(l3[i]!.bucketLabelUtc);
    }
  }
  return changed;
}
