import type { MotionManoeuvreEvent } from './motion-event.types';

/**
 * Universal post-detector plausibility pass (fleet-wide, no make/model/mass/power inputs).
 * Does not replace detection thresholds; marks only events with internally inconsistent kinematics
 * or clear sign/reporting contradictions. High mean acceleration alone is never sufficient.
 */
export const MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2 = 'MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2';

/** @deprecated Use MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2 */
export const MOTION_EVENT_PHYSICS_ENVELOPE_V0_1 = MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2;

export type MotionEventPlausibilityViolation = 'kinematic_mean_mismatch' | 'kind_delta_sign_mismatch';

const MIN_DURATION_S_FOR_MEAN_CHECK = 0.5;
/** Absolute floor (m/s²) on mean-vs-Δv/t disagreement; covers 1 Hz grid + L3 rounding. */
const MEAN_MISMATCH_ABS_FLOOR_MPS2 = 1.25;
/** Relative floor on implied mean; conservative so plausible manoeuvres are not flagged. */
const MEAN_MISMATCH_REL_FRACTION = 0.4;
export function assessMotionEventUniversalPlausibility(
  ev: Pick<
    MotionManoeuvreEvent,
    'kind' | 'deltaKmh' | 'meanAccelMps2' | 'durationS'
  >,
): MotionEventPlausibilityViolation | null {
  if (ev.deltaKmh < 0.5) {
    return 'kind_delta_sign_mismatch';
  }

  if (ev.durationS < MIN_DURATION_S_FOR_MEAN_CHECK) {
    return null;
  }

  // Match `motion-event-detector.ts`: mean uses max(durationS, 1s), deltaKmh is positive magnitude.
  const impliedMeanMps2 = ev.deltaKmh / 3.6 / Math.max(ev.durationS, 1);
  const meanErr = Math.abs(ev.meanAccelMps2 - impliedMeanMps2);
  const threshold = Math.max(MEAN_MISMATCH_ABS_FLOOR_MPS2, MEAN_MISMATCH_REL_FRACTION * Math.max(impliedMeanMps2, 0.5));
  if (meanErr > threshold) {
    return 'kinematic_mean_mismatch';
  }

  return null;
}

/**
 * Marks events with proven internal inconsistency as `ARTEFACT_SUSPECT` (retained in payload).
 */
export function applyMotionEventUniversalPlausibility(events: MotionManoeuvreEvent[]): void {
  for (const ev of events) {
    if (ev.quality === 'ARTEFACT_SUSPECT') {
      continue;
    }
    const violation = assessMotionEventUniversalPlausibility(ev);
    if (!violation) {
      continue;
    }
    ev.quality = 'ARTEFACT_SUSPECT';
    const flag = `MOTION_PLAUSIBILITY_VIOLATION=${violation};mean:${ev.meanAccelMps2};duration_s:${ev.durationS}`;
    ev.flags = [...ev.flags, flag].sort();
  }
}

/** @deprecated Use applyMotionEventUniversalPlausibility */
export function applyMotionEventPhysicsEnvelope(events: MotionManoeuvreEvent[]): void {
  applyMotionEventUniversalPlausibility(events);
}
