import { haversineMeters } from '../geo/haversine';
import { parseBucketLabelMs, type MotionCorePositionBucket } from './motion-core-grid';
import type { MotionCoreSpeedQuality, MotionCoreSpeedSample } from './speed-sample.types';
import type { MotionFsmEvidenceQuality, MotionFsmLabel, MotionFsmState } from './motion-fsm';

export const MOTION_FSM_GAP_BRIDGE_V1_VERSION = 'MOTION_FSM_GAP_BRIDGE_V1_V1_3';

/**
 * Kinematic envelope for “could a full stop fit inside this gap?” (not trip-tuned).
 * {@link gapBridgeV1MaxDistanceWithEmbeddedStopM} uses bang-bang optimal segment bounds per (a,b).
 */
export const GAP_BRIDGE_V1_STOP_FEASIBILITY_PHYSICS = {
  minStopHoldS: 1.0,
  minBrakeMps2: 1.0,
  maxBrakeMps2: 8.0,
  minAccelMps2: 1.0,
  maxAccelMps2: 4.0,
  speedHeadroomFrac: 0.15,
  speedHeadroomMps: 5.0,
  /** T1 split search step (s); {@link gapBridgeV1StopFeasibilityDiscretizationMarginM} pads the bound. */
  stopSplitSearchStepS: 0.01,
} as const;

/** @deprecated Use {@link gapBridgeV1MaxDistanceWithEmbeddedStopM}; kept for audit references. */
export const GAP_BRIDGE_V1_STOP_FEASIBILITY_DECEL_MPS2 = 3.0;

export type MotionFsmGapBridgeParamSlice = {
  stationaryBandMaxKmh: number;
  movingBandMinKmh: number;
  stopConfirmS: number;
  gapShortMaxS: number;
  gapLowSpeedContextKmh: number;
  gapLongMaxS: number;
  reappearNoiseM: number;
  lookaheadS: number;
};

/** Optional DI-V0 hints; only consumed when gap-bridge V1 is enabled. */
export interface MotionFsmGapBridgeAuxiliary {
  /** Bucket labels where DI-V0 `motionState === STATIONARY_SUPPORTED`. */
  stationarySupportedLabels?: ReadonlySet<string>;
}

const FSM_NUMERIC_SPEED_QUALITIES: ReadonlySet<MotionCoreSpeedQuality | string> = new Set([
  'OK',
  'SPARSE_SUPPORT',
  'JITTER_SUSPECT',
  'REPAIRED',
  'SPAN_SUPPORT',
  'SPAN_DERIVED',
]);

function secSinceEpoch(label: string): number {
  return Math.floor(parseBucketLabelMs(label) / 1000);
}

function isMovingSide(state: MotionFsmState): boolean {
  return state === 'MOVING' || state === 'STARTING';
}

function cloneLabel(l: MotionFsmLabel): MotionFsmLabel {
  return { ...l, flags: [...l.flags] };
}

function speedForStandCheck(s: MotionCoreSpeedSample | undefined): number | null {
  if (!s || s.valueKmh == null || !FSM_NUMERIC_SPEED_QUALITIES.has(s.quality)) {
    return null;
  }
  return s.valueKmh;
}

function isCircularGapMotionReason(reason: string): boolean {
  return (
    reason === 'displacement_across_gap_implies_motion' ||
    reason === 'retro_gap_bridge_endpoint_displacement'
  );
}

function directAnchorSpeedKmh(label: MotionFsmLabel, spBy: Map<string, MotionCoreSpeedSample>): number | null {
  if (label.evidenceQuality !== 'DIRECT') {
    return null;
  }
  if (label.speedKmh != null) {
    return label.speedKmh;
  }
  return speedForStandCheck(spBy.get(label.label));
}

function nearestDirectMovingAnchor(
  labels: MotionFsmLabel[],
  boundarySec: number,
  direction: 'before' | 'after',
  maxSpanS: number,
): MotionFsmLabel | null {
  const ordered = labels;
  if (direction === 'before') {
    for (let k = ordered.length - 1; k >= 0; k--) {
      const l = ordered[k]!;
      const sec = secSinceEpoch(l.label);
      if (sec >= boundarySec) {
        continue;
      }
      if (boundarySec - sec > maxSpanS) {
        break;
      }
      if (!isMovingSide(l.state) || l.evidenceQuality !== 'DIRECT') {
        continue;
      }
      if (isCircularGapMotionReason(l.reason)) {
        continue;
      }
      return l;
    }
    return null;
  }
  for (let k = 0; k < ordered.length; k++) {
    const l = ordered[k]!;
    const sec = secSinceEpoch(l.label);
    if (sec <= boundarySec) {
      continue;
    }
    if (sec - boundarySec > maxSpanS) {
      break;
    }
    if (!isMovingSide(l.state) || l.evidenceQuality !== 'DIRECT') {
      continue;
    }
    if (isCircularGapMotionReason(l.reason)) {
      continue;
    }
    return l;
  }
  return null;
}

/** Conservative padding for T1 split discretization (two segment time quanta at speed cap). */
export function gapBridgeV1StopFeasibilityDiscretizationMarginM(vCapMps: number): number {
  const step = GAP_BRIDGE_V1_STOP_FEASIBILITY_PHYSICS.stopSplitSearchStepS;
  return 2 * vCapMps * step;
}

/**
 * Maximum distance (m) in time `tS` from `vStartMps` to a full stop using |accel|≤`aAccel`, |brake|≤`aBrake`,
 * peak speed ≤ `vCapMps`. Bang-bang optimum: accel (cruise at cap) then brake to zero.
 */
export function gapBridgeV1MaxDistanceToStopInTimeM(
  tS: number,
  vStartMps: number,
  aAccel: number,
  aBrake: number,
  vCapMps: number,
): number {
  if (tS <= 0 || vStartMps <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  if (tS < vStartMps / aBrake - 1e-9) {
    return Number.NEGATIVE_INFINITY;
  }
  const vp = (tS + vStartMps / aAccel) / (1 / aAccel + 1 / aBrake);
  if (vp <= vCapMps) {
    const tAcc = (vp - vStartMps) / aAccel;
    return ((vStartMps + vp) / 2) * tAcc + (vp * vp) / (2 * aBrake);
  }
  const tAccCap = (vCapMps - vStartMps) / aAccel;
  const tBrakeCap = vCapMps / aBrake;
  const tCruise = tS - tAccCap - tBrakeCap;
  if (tCruise < -1e-9) {
    return Number.NEGATIVE_INFINITY;
  }
  return ((vStartMps + vCapMps) / 2) * tAccCap + vCapMps * tCruise + (vCapMps * vCapMps) / (2 * aBrake);
}

/**
 * Maximum distance (m) in time `tS` from a full stop to `vEndMps` (symmetric bang-bang optimum).
 */
export function gapBridgeV1MaxDistanceFromStopInTimeM(
  tS: number,
  vEndMps: number,
  aAccel: number,
  aBrake: number,
  vCapMps: number,
): number {
  if (tS <= 0 || vEndMps <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  if (tS < vEndMps / aAccel - 1e-9) {
    return Number.NEGATIVE_INFINITY;
  }
  const vp = (tS + vEndMps / aBrake) / (1 / aAccel + 1 / aBrake);
  if (vp <= vCapMps) {
    return (vp * vp) / (2 * aAccel) + (vp * vp - vEndMps * vEndMps) / (2 * aBrake);
  }
  const tAccCap = vCapMps / aAccel;
  const tBrakeCap = (vCapMps - vEndMps) / aBrake;
  const tCruise = tS - tAccCap - tBrakeCap;
  if (tCruise < -1e-9) {
    return Number.NEGATIVE_INFINITY;
  }
  return (vCapMps * vCapMps) / (2 * aAccel) + vCapMps * tCruise + (vCapMps * vCapMps - vEndMps * vEndMps) / (2 * aBrake);
}

function gapBridgeV1PhysicsAccelBrakeGrid(): { aAccel: number; aBrake: number }[] {
  const phys = GAP_BRIDGE_V1_STOP_FEASIBILITY_PHYSICS;
  const pairs: { aAccel: number; aBrake: number }[] = [];
  for (let a = phys.minAccelMps2; a <= phys.maxAccelMps2 + 1e-9; a += 0.5) {
    for (let b = phys.minBrakeMps2; b <= phys.maxBrakeMps2 + 1e-9; b += 0.5) {
      pairs.push({ aAccel: a, aBrake: b });
    }
  }
  pairs.push({ aAccel: phys.maxAccelMps2, aBrake: phys.minBrakeMps2 });
  return pairs;
}

/**
 * Conservative upper bound on path length (m) in `dtS` from `vinKmh` to `voutKmh` while including a
 * full stop of at least {@link GAP_BRIDGE_V1_STOP_FEASIBILITY_PHYSICS.minStopHoldS}, over the declared
 * accel/brake envelope and speed cap. Includes discretization margin and `positionUncertaintyM`.
 */
export function gapBridgeV1MaxDistanceWithEmbeddedStopM(
  dtS: number,
  vinKmh: number,
  voutKmh: number,
  positionUncertaintyM = 0,
): number {
  if (dtS < 1 || vinKmh <= 0 || voutKmh <= 0) {
    return 0;
  }
  const phys = GAP_BRIDGE_V1_STOP_FEASIBILITY_PHYSICS;
  const vin = vinKmh / 3.6;
  const vout = voutKmh / 3.6;
  const vCap = Math.max(vin, vout) * (1 + phys.speedHeadroomFrac) + phys.speedHeadroomMps;
  const tsMin = phys.minStopHoldS;
  const step = phys.stopSplitSearchStepS;
  let best = 0;

  for (const { aAccel, aBrake } of gapBridgeV1PhysicsAccelBrakeGrid()) {
    for (let t1 = 0; t1 <= dtS - tsMin + 1e-9; t1 += step) {
      const t2 = dtS - tsMin - t1;
      if (t2 < 0) {
        continue;
      }
      const d1 = gapBridgeV1MaxDistanceToStopInTimeM(t1, vin, aAccel, aBrake, vCap);
      const d2 = gapBridgeV1MaxDistanceFromStopInTimeM(t2, vout, aAccel, aBrake, vCap);
      if (!Number.isFinite(d1) || !Number.isFinite(d2)) {
        continue;
      }
      best = Math.max(best, d1 + d2);
    }
  }

  return best + positionUncertaintyM + gapBridgeV1StopFeasibilityDiscretizationMarginM(vCap);
}

/**
 * Bridge only if observed displacement exceeds every kinematically plausible stop-inclusive path.
 * Uses vin/vout from independent DIRECT anchors (km/h).
 */
export function gapBridgeV1StopFeasibilityAllowsBridge(
  dispM: number,
  dtS: number,
  vinKmh: number | null,
  voutKmh: number | null,
  p: MotionFsmGapBridgeParamSlice,
): boolean {
  if (dtS < 1 || dispM <= 0) {
    return false;
  }
  if (vinKmh == null || voutKmh == null) {
    return false;
  }
  if (vinKmh < p.movingBandMinKmh || voutKmh < p.movingBandMinKmh) {
    return false;
  }
  const uncertaintyM = p.reappearNoiseM * 2;
  const dMax = gapBridgeV1MaxDistanceWithEmbeddedStopM(dtS, vinKmh, voutKmh, uncertaintyM);
  return dispM > dMax;
}

function lastPresentBefore(ordered: MotionCorePositionBucket[], beforeSec: number): MotionCorePositionBucket | null {
  let best: MotionCorePositionBucket | null = null;
  for (const b of ordered) {
    const s = secSinceEpoch(b.bucketLabelUtc);
    if (s > beforeSec) {
      break;
    }
    if (b.availability === 'PRESENT' && b.latitude != null && b.longitude != null) {
      best = b;
    }
  }
  return best;
}

function firstPresentAtOrAfter(ordered: MotionCorePositionBucket[], fromSec: number): MotionCorePositionBucket | null {
  for (const b of ordered) {
    const s = secSinceEpoch(b.bucketLabelUtc);
    if (s < fromSec) {
      continue;
    }
    if (b.availability === 'PRESENT' && b.latitude != null && b.longitude != null) {
      return b;
    }
  }
  return null;
}

/** Brackets UNKNOWN run (kinematics use independent DIRECT anchors, not neighbor reasons). */
function anchorUsable(label: MotionFsmLabel | null): boolean {
  if (!label) {
    return false;
  }
  if (!isMovingSide(label.state)) {
    return false;
  }
  return label.evidenceQuality !== 'INDETERMINATE';
}

function hasEmbeddedStopInWindow(
  ordered: MotionCorePositionBucket[],
  spBy: Map<string, MotionCoreSpeedSample>,
  aux: MotionFsmGapBridgeAuxiliary | undefined,
  startSec: number,
  endSec: number,
  p: MotionFsmGapBridgeParamSlice,
): boolean {
  let lowDispRun = 0;
  let lastPresent: MotionCorePositionBucket | null = null;
  for (const b of ordered) {
    const s = secSinceEpoch(b.bucketLabelUtc);
    if (s < startSec || s > endSec) {
      continue;
    }
    if (aux?.stationarySupportedLabels?.has(b.bucketLabelUtc)) {
      return true;
    }
    const c4 = spBy.get(b.bucketLabelUtc);
    if (c4?.quality === 'FROZEN_POSITION') {
      return true;
    }
    const v = speedForStandCheck(c4);
    if (v != null && v < p.stationaryBandMaxKmh) {
      return true;
    }
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      continue;
    }
    if (lastPresent) {
      const d = haversineMeters(
        lastPresent.latitude!,
        lastPresent.longitude!,
        b.latitude,
        b.longitude,
      );
      if (d <= p.reappearNoiseM) {
        lowDispRun += 1;
        if (lowDispRun >= p.stopConfirmS) {
          return true;
        }
      } else {
        lowDispRun = 0;
      }
    }
    lastPresent = b;
  }
  return false;
}

/**
 * Long-gap guard (not trip-specific): spans beyond `gapShortMaxS` need cruise-class implied speed;
 * STARTING anchors require DIRECT evidence on both sides.
 */
export function gapBridgeV1LongSpanAllowed(
  spanS: number,
  impliedKmh: number,
  left: MotionFsmLabel,
  right: MotionFsmLabel,
  p: MotionFsmGapBridgeParamSlice,
): boolean {
  if (impliedKmh < p.movingBandMinKmh) {
    return false;
  }
  if (spanS <= p.gapShortMaxS) {
    return true;
  }
  if (impliedKmh < p.gapLowSpeedContextKmh) {
    return false;
  }
  if (left.state === 'STARTING' || right.state === 'STARTING') {
    return left.evidenceQuality === 'DIRECT' && right.evidenceQuality === 'DIRECT';
  }
  return true;
}

function applyFrozenStandInUnknown(
  labels: MotionFsmLabel[],
  ordered: MotionCorePositionBucket[],
  spBy: Map<string, MotionCoreSpeedSample>,
  aux: MotionFsmGapBridgeAuxiliary | undefined,
  p: MotionFsmGapBridgeParamSlice,
): MotionFsmLabel[] {
  const bucketByLabel = new Map(ordered.map((b) => [b.bucketLabelUtc, b]));
  let stopObs = 0;
  const out = labels.map(cloneLabel);
  for (let i = 0; i < out.length; i++) {
    const lab = out[i]!;
    if (lab.state === 'STATIONARY' || lab.state === 'STOP_CANDIDATE') {
      stopObs = lab.state === 'STATIONARY' ? p.stopConfirmS : Math.max(stopObs, 1);
    } else if (isMovingSide(lab.state)) {
      stopObs = 0;
    }
    if (lab.state !== 'UNKNOWN') {
      continue;
    }
    const c4 = spBy.get(lab.label);
    const frozen = c4?.quality === 'FROZEN_POSITION';
    const stationarySupported = aux?.stationarySupportedLabels?.has(lab.label) === true;
    const b = bucketByLabel.get(lab.label);
    const eligibleFrozenStand = frozen && stationarySupported && b?.availability === 'PRESENT';
    if (!eligibleFrozenStand) {
      stopObs = 0;
      continue;
    }
    stopObs += 1;
    if (stopObs >= p.stopConfirmS) {
      lab.state = 'STATIONARY';
      lab.reason = 'frozen_stationary_supported_confirmed';
    } else {
      lab.state = 'STOP_CANDIDATE';
      lab.reason = 'frozen_stationary_supported_observing';
    }
    lab.evidenceQuality = 'INFERRED';
    lab.flags.push('GAP_BRIDGE_V1_FROZEN_STAND');
  }
  return out;
}

function applyRetrospectiveGapBridge(
  labels: MotionFsmLabel[],
  ordered: MotionCorePositionBucket[],
  spBy: Map<string, MotionCoreSpeedSample>,
  aux: MotionFsmGapBridgeAuxiliary | undefined,
  p: MotionFsmGapBridgeParamSlice,
): MotionFsmLabel[] {
  const out = labels.map(cloneLabel);
  let i = 0;
  while (i < out.length) {
    if (out[i]!.state !== 'UNKNOWN') {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < out.length && out[j + 1]!.state === 'UNKNOWN') {
      j += 1;
    }
    const startSec = secSinceEpoch(out[i]!.label);
    const endSec = secSinceEpoch(out[j]!.label);
    const spanS = endSec - startSec + 1;
    const left = i > 0 ? out[i - 1]! : null;
    const right = j + 1 < out.length ? out[j + 1]! : null;
    if (spanS > p.gapLongMaxS || !anchorUsable(left) || !anchorUsable(right)) {
      i = j + 1;
      continue;
    }
    if (hasEmbeddedStopInWindow(ordered, spBy, aux, startSec, endSec, p)) {
      i = j + 1;
      continue;
    }
    const leftDirect = nearestDirectMovingAnchor(out, startSec, 'before', p.lookaheadS);
    const rightDirect = nearestDirectMovingAnchor(out, endSec, 'after', p.lookaheadS);
    if (!leftDirect || !rightDirect) {
      i = j + 1;
      continue;
    }
    const a = lastPresentBefore(ordered, startSec - 1);
    const b = firstPresentAtOrAfter(ordered, endSec + 1);
    if (!a || !b) {
      i = j + 1;
      continue;
    }
    const dtS = Math.max(1, secSinceEpoch(b.bucketLabelUtc) - secSinceEpoch(a.bucketLabelUtc));
    const dispM = haversineMeters(a.latitude!, a.longitude!, b.latitude!, b.longitude!);
    const impliedKmh = (dispM / dtS) * 3.6;
    if (!gapBridgeV1LongSpanAllowed(spanS, impliedKmh, left!, right!, p)) {
      i = j + 1;
      continue;
    }
    const vinKmh = directAnchorSpeedKmh(leftDirect, spBy);
    const voutKmh = directAnchorSpeedKmh(rightDirect, spBy);
    if (!gapBridgeV1StopFeasibilityAllowsBridge(dispM, dtS, vinKmh, voutKmh, p)) {
      i = j + 1;
      continue;
    }
    for (let k = i; k <= j; k++) {
      const lab = out[k]!;
      lab.state = 'MOVING';
      lab.evidenceQuality = 'INFERRED';
      lab.reason = 'retro_gap_bridge_endpoint_displacement';
      lab.speedKmh = null;
      lab.flags.push(`GAP_BRIDGE_V1_BRIDGE;implied_mean_kmh=${impliedKmh.toFixed(1)}`);
    }
    i = j + 1;
  }
  return out;
}

/** Retrospective-only post-pass; caller must keep flag OFF for byte-identical baseline. */
export function applyMotionFsmGapBridgeV1PostPass(
  labels: MotionFsmLabel[],
  ordered: MotionCorePositionBucket[],
  speedSamples: MotionCoreSpeedSample[],
  auxiliary: MotionFsmGapBridgeAuxiliary | undefined,
  params: MotionFsmGapBridgeParamSlice,
): MotionFsmLabel[] {
  const spBy = new Map(speedSamples.map((s) => [s.label, s]));
  const afterFrozen = applyFrozenStandInUnknown(labels, ordered, spBy, auxiliary, params);
  return applyRetrospectiveGapBridge(afterFrozen, ordered, spBy, auxiliary, params);
}
