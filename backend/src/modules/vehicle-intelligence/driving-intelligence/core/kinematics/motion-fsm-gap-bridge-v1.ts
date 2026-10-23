import { haversineMeters } from '../geo/haversine';
import { parseBucketLabelMs, type MotionCorePositionBucket } from './motion-core-grid';
import type { MotionCoreSpeedQuality, MotionCoreSpeedSample } from './speed-sample.types';
import type { MotionFsmEvidenceQuality, MotionFsmLabel, MotionFsmState } from './motion-fsm';
import { MOTION_FSM_PARAMS_V0_2_DEV } from './motion-fsm';

export const MOTION_FSM_GAP_BRIDGE_V1_VERSION = 'MOTION_FSM_GAP_BRIDGE_V1';

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
  p: typeof MOTION_FSM_PARAMS_V0_2_DEV,
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
    const v = speedForStandCheck(spBy.get(b.bucketLabelUtc));
    if (v != null && v < p.stationaryBandMaxKmh) {
      return true;
    }
    const q = spBy.get(b.bucketLabelUtc)?.quality;
    if (q === 'FROZEN_POSITION' && aux?.stationarySupportedLabels?.has(b.bucketLabelUtc)) {
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
  p: typeof MOTION_FSM_PARAMS_V0_2_DEV = MOTION_FSM_PARAMS_V0_2_DEV,
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
  p: typeof MOTION_FSM_PARAMS_V0_2_DEV,
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
    if (!frozen || !stationarySupported) {
      continue;
    }
    const b = bucketByLabel.get(lab.label);
    if (!b || b.availability !== 'PRESENT') {
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
  p: typeof MOTION_FSM_PARAMS_V0_2_DEV,
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
  params: typeof MOTION_FSM_PARAMS_V0_2_DEV = MOTION_FSM_PARAMS_V0_2_DEV,
): MotionFsmLabel[] {
  const spBy = new Map(speedSamples.map((s) => [s.label, s]));
  const afterFrozen = applyFrozenStandInUnknown(labels, ordered, spBy, auxiliary, params);
  return applyRetrospectiveGapBridge(afterFrozen, ordered, spBy, auxiliary, params);
}
