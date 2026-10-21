/** Neutral manoeuvre events (Fable `event_detector.MotionEvent`). */
export type MotionManoeuvreKind = 'ACCELERATION' | 'DECELERATION';

export type MotionEventQuality = 'OK' | 'DEGRADED' | 'LIMITED';

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
