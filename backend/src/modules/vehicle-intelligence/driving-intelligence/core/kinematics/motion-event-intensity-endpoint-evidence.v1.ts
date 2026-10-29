import { MOTION_EVENT_HF_THRESHOLDS_V1 } from './motion-event-detector';
import type { MotionManoeuvreEvent } from './motion-event.types';
import type { MotionCoreSpeedSample } from './speed-sample.types';

/**
 * Reuses Speed QC / shadow semantics as sample flags (no parallel quality engine).
 * @see evaluate-di-v0-speed-qc-interval.ts (CROSS_SOURCE_CONFLICT, SHADOW_ABSTAINED)
 */
export const MOTION_INTENSITY_UNTRUSTED_ENDPOINT_FLAG_MARKERS = [
  'CROSS_SOURCE_CONFLICT',
  'SHADOW_ABSTAINED',
  'SPEED_EVIDENCE_ABSTAINED',
  'SPEED_EVIDENCE_CONFLICT_EXPLAINED',
  'SPEED_QC_UNTRUSTED',
] as const;

export type MotionIntensityEndpointUntrustedReasonV1 =
  | 'START_ENDPOINT_UNTRUSTED'
  | 'END_ENDPOINT_UNTRUSTED';

export function isMotionCoreSpeedSampleTrustedForIntensityEndpoint(
  sample: MotionCoreSpeedSample | undefined,
): boolean {
  if (sample == null || sample.valueKmh == null) {
    return false;
  }
  for (const flag of sample.flags) {
    if (MOTION_INTENSITY_UNTRUSTED_ENDPOINT_FLAG_MARKERS.some((m) => flag === m || flag.startsWith(`${m}=`))) {
      return false;
    }
  }
  return true;
}

/**
 * Fail closed on intensity consumption when either endpoint speed is not evidence-trusted.
 * Preserves event row and diagnostic flags; does not zero kinematic fields.
 */
export function applyMotionEventIntensityEndpointEvidenceGate(
  events: MotionManoeuvreEvent[],
  samples: readonly MotionCoreSpeedSample[],
): void {
  const byLabel = new Map(samples.map((s) => [s.label, s]));
  for (const ev of events) {
    if (ev.quality === 'ARTEFACT_SUSPECT') {
      continue;
    }
    const reasons: MotionIntensityEndpointUntrustedReasonV1[] = [];
    if (!isMotionCoreSpeedSampleTrustedForIntensityEndpoint(byLabel.get(ev.startLabel))) {
      reasons.push('START_ENDPOINT_UNTRUSTED');
    }
    if (!isMotionCoreSpeedSampleTrustedForIntensityEndpoint(byLabel.get(ev.endLabel))) {
      reasons.push('END_ENDPOINT_UNTRUSTED');
    }
    if (reasons.length === 0) {
      continue;
    }
    ev.quality = 'ARTEFACT_SUSPECT';
    ev.flags = [...ev.flags, `INTENSITY_ENDPOINT_EVIDENCE=${reasons.join(',')}`].sort();
  }
}

function sortedNumericSamples(samples: readonly MotionCoreSpeedSample[]): MotionCoreSpeedSample[] {
  return samples
    .filter((s) => s.valueKmh != null)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Opposite-kind events that share a label with a local speed spike (conflict knot) are not
 * intensity-trustworthy — spike bracket may skip them when oppositeFollows is true.
 */
export function isSharedConflictKnotSample(
  knot: MotionCoreSpeedSample,
  prev: MotionCoreSpeedSample | null,
  next: MotionCoreSpeedSample | null,
): boolean {
  if (knot.valueKmh == null || prev?.valueKmh == null || next?.valueKmh == null) {
    return false;
  }
  const k = knot.valueKmh;
  const p = prev.valueKmh;
  const n = next.valueKmh;
  const neighborHigh = Math.max(p, n);
  const neighborLow = Math.max(Math.min(p, n), 1);
  const minSpikeKmh = MOTION_EVENT_HF_THRESHOLDS_V1.minDeltaKmh.ACCELERATION * 3;
  if (k - neighborHigh < minSpikeKmh) {
    return false;
  }
  if (k / neighborLow < 2.5) {
    return false;
  }
  return true;
}

export function applyMotionEventSharedConflictKnotGate(
  events: MotionManoeuvreEvent[],
  samples: readonly MotionCoreSpeedSample[],
): void {
  const ordered = sortedNumericSamples(samples);
  const indexByLabel = new Map(ordered.map((s, i) => [s.label, i]));

  for (let i = 0; i < events.length; i++) {
    for (let j = 0; j < events.length; j++) {
      if (i === j) {
        continue;
      }
      const a = events[i]!;
      const b = events[j]!;
      if (a.kind === b.kind || a.endLabel !== b.startLabel) {
        continue;
      }
      const ki = indexByLabel.get(a.endLabel);
      if (ki == null || ki < 1 || ki >= ordered.length - 1) {
        continue;
      }
      const knot = ordered[ki]!;
      const prev = ordered[ki - 1]!;
      const next = ordered[ki + 1]!;
      if (!isSharedConflictKnotSample(knot, prev, next)) {
        continue;
      }
      for (const ev of [a, b]) {
        const knotFlag = `SHARED_CONFLICT_KNOT=${knot.label};knot_kmh:${Math.round(knot.valueKmh! * 10) / 10}`;
        if (!ev.flags.some((f) => f.startsWith('SHARED_CONFLICT_KNOT'))) {
          ev.flags = [...ev.flags, knotFlag].sort();
        }
        if (ev.quality === 'ARTEFACT_SUSPECT') {
          continue;
        }
        ev.quality = 'ARTEFACT_SUSPECT';
      }
    }
  }
}

/** Production shadow stack: endpoint trust + shared conflict knot after universal plausibility. */
export function applyMotionEventIntensityEvidenceGatesV1(
  events: MotionManoeuvreEvent[],
  samples: readonly MotionCoreSpeedSample[],
): void {
  applyMotionEventIntensityEndpointEvidenceGate(events, samples);
  applyMotionEventSharedConflictKnotGate(events, samples);
}
