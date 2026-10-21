/** EXP021 motion-core SpeedSample contract (offline / shadow extension; not yet in DI V0 intervals). */
export type MotionCoreSpeedQuality =
  | 'OK'
  | 'REPAIRED'
  | 'SPARSE_SUPPORT'
  | 'JITTER_SUSPECT'
  | 'NO_SUPPORT'
  | 'NO_POSITION'
  | 'FROZEN_POSITION'
  | 'OUTLIER_REJECTED';

export interface MotionCoreSpeedSample {
  label: string;
  valueKmh: number | null;
  quality: MotionCoreSpeedQuality;
  supportLabels: string[];
  supportSpanS: number | null;
  flags: string[];
  estimator: string;
}
