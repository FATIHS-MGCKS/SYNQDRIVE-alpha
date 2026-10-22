/** Neutral manoeuvre events (Fable `event_detector.MotionEvent`). */
export type MotionManoeuvreKind = 'ACCELERATION' | 'DECELERATION';

/**
 * `ARTEFACT_SUSPECT` is only produced by the review-round candidate `spikeReversionCheck`
 * (see `motion-event-detector.ts`); Fable V0.1 emits OK / DEGRADED / LIMITED only.
 */
export type MotionEventQuality = 'OK' | 'DEGRADED' | 'LIMITED' | 'ARTEFACT_SUSPECT';

export interface MotionManoeuvreEvent {
  trip: number;
  kind: MotionManoeuvreKind;
  startLabel: string;
  endLabel: string;
  startUncertaintyS: string;
  endUncertaintyS: string;
  startSpeedKmh: number;
  endSpeedKmh: number;
  deltaKmh: number;
  meanAccelMps2: number;
  peakAccel1sMps2: number;
  peakAccel2sMps2: number | null;
  durationS: number;
  steps: number;
  coverageRatio: number;
  quality: MotionEventQuality;
  source: string;
  algorithmVersion: string;
  flags: string[];
}

